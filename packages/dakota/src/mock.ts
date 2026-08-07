/**
 * Deterministic mock Dakota service.
 *
 * Same discipline as the Rain mock: every id derives from a hash of its input,
 * so `pnpm demo:reset` produces identical output every run. It models Dakota's
 * documented object graph — customer → recipient → destination, plus wallets
 * and transactions — and nothing it does not have. There is no card here,
 * because Dakota has no cards.
 */

import { createHash } from "node:crypto";
import type {
  CreateCryptoDestinationInput,
  CreateCustomerInput,
  CreateRecipientInput,
  DakotaBalance,
  DakotaCustomer,
  DakotaDestination,
  DakotaRecipient,
  DakotaService,
  DakotaTransaction,
  DakotaWallet,
  DakotaWebhookEvent,
  SubmitWalletTransactionInput,
} from "./types";
import { DakotaError } from "./types";

function stableId(prefix: string, seed: string): string {
  return `${prefix}_${createHash("sha256").update(seed).digest("hex").slice(0, 24)}`;
}

function stableAddress(seed: string): string {
  return `0x${createHash("sha256").update(seed).digest("hex").slice(0, 40)}`;
}

export interface MockDakotaOptions {
  now?: () => Date;
  /** When true, a created customer is immediately KYB-approved. */
  autoApproveKyb?: boolean;
}

export class MockDakotaService implements DakotaService {
  readonly mode = "mock" as const;

  private readonly customers = new Map<string, DakotaCustomer>();
  private readonly recipients = new Map<string, DakotaRecipient>();
  private readonly destinations = new Map<string, DakotaDestination>();
  private readonly wallets = new Map<string, DakotaWallet>();
  private readonly balances = new Map<string, DakotaBalance[]>();
  private readonly transactions = new Map<string, DakotaTransaction>();

  private readonly now: () => Date;
  private readonly autoApproveKyb: boolean;

  constructor(options: MockDakotaOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.autoApproveKyb = options.autoApproveKyb ?? true;
  }

  async createCustomer(input: CreateCustomerInput): Promise<DakotaCustomer> {
    const id = stableId("cus", input.externalId ?? input.name);
    const existing = this.customers.get(id);
    if (existing) return existing;

    const applicationId = stableId("app", id);
    const customer: DakotaCustomer = {
      id,
      name: input.name,
      customerType: input.customerType,
      externalId: input.externalId ?? null,
      kybStatus: this.autoApproveKyb ? "active" : "pending",
      applicationId,
      applicationUrl: `https://mock.dakota.local/apply/${applicationId}`,
      createdAt: this.now(),
      raw: {},
    };
    this.customers.set(id, customer);
    return customer;
  }

  async getCustomer(id: string): Promise<DakotaCustomer> {
    const customer = this.customers.get(id);
    if (!customer) throw new DakotaError(404, "not_found", `No customer ${id}.`);
    return customer;
  }

  async listCustomers(params: { limit?: number } = {}): Promise<DakotaCustomer[]> {
    return [...this.customers.values()].slice(0, params.limit ?? 100);
  }

  async mintApplicationLink(customerId: string): Promise<{ applicationUrl: string }> {
    const customer = await this.getCustomer(customerId);
    return { applicationUrl: customer.applicationUrl ?? "" };
  }

  /** Test hook: move a customer's KYB status without a webhook. */
  setKybStatus(customerId: string, kybStatus: string): void {
    const customer = this.customers.get(customerId);
    if (customer) this.customers.set(customerId, { ...customer, kybStatus });
  }

  async createRecipient(input: CreateRecipientInput): Promise<DakotaRecipient> {
    await this.getCustomer(input.customerId);
    const id = stableId("rcp", `${input.customerId}:${input.externalId ?? input.name}`);
    const recipient: DakotaRecipient = {
      id,
      customerId: input.customerId,
      name: input.name,
      raw: {},
    };
    this.recipients.set(id, recipient);
    return recipient;
  }

  async createCryptoDestination(
    input: CreateCryptoDestinationInput,
  ): Promise<DakotaDestination> {
    if (!this.recipients.has(input.recipientId)) {
      throw new DakotaError(404, "not_found", `No recipient ${input.recipientId}.`);
    }
    const id = stableId("dst", `${input.recipientId}:${input.cryptoAddress}`);
    const destination: DakotaDestination = {
      id,
      recipientId: input.recipientId,
      destinationType: "crypto",
      cryptoAddress: input.cryptoAddress,
      networkId: input.networkId,
      raw: {},
    };
    this.destinations.set(id, destination);
    return destination;
  }

  async createWallet(input: {
    name: string;
    family: string;
    signerGroups: string[];
    policies: string[];
  }): Promise<DakotaWallet> {
    // Dakota requires governance on every wallet; the mock refuses without it
    // so the demo cannot drift into a shape the real API would reject.
    if (input.signerGroups.length === 0 || input.policies.length === 0) {
      throw new DakotaError(
        400,
        "governance_required",
        "A wallet requires at least one signer group and one policy.",
      );
    }

    const id = stableId("wlt", input.name);
    const wallet: DakotaWallet = {
      id,
      name: input.name,
      family: input.family,
      address: stableAddress(id),
      raw: {},
    };
    this.wallets.set(id, wallet);
    this.balances.set(id, [
      { assetId: "USDC", networkId: "base-mainnet", amountMinor: 0n, decimals: 6, raw: {} },
    ]);
    return wallet;
  }

  async getWallet(id: string): Promise<DakotaWallet> {
    const wallet = this.wallets.get(id);
    if (!wallet) throw new DakotaError(404, "not_found", `No wallet ${id}.`);
    return wallet;
  }

  async getWalletBalances(id: string): Promise<DakotaBalance[]> {
    await this.getWallet(id);
    return this.balances.get(id) ?? [];
  }

  /** Test/demo hook: credit a wallet as if a deposit had landed. */
  credit(walletId: string, amountMinor: bigint, assetId = "USDC"): void {
    const current = this.balances.get(walletId) ?? [];
    const next = current.map((balance) =>
      balance.assetId === assetId
        ? { ...balance, amountMinor: balance.amountMinor + amountMinor }
        : balance,
    );
    this.balances.set(walletId, next);
  }

  async submitWalletTransaction(
    input: SubmitWalletTransactionInput,
  ): Promise<DakotaTransaction> {
    await this.getWallet(input.walletId);

    // Dakota will not accept an unsigned intent, so neither does the mock.
    if (input.signatures.length === 0) {
      throw new DakotaError(400, "signature_required", "A wallet transaction must be signed.");
    }

    const id = stableId("txn", input.intent.idempotencyKey);
    const existing = this.transactions.get(id);
    if (existing) return existing;

    const amountMinor = BigInt(input.intent.operation.amount);
    const balances = this.balances.get(input.walletId) ?? [];
    const available =
      balances.find((b) => b.assetId === input.intent.operation.assetId)?.amountMinor ?? 0n;
    if (available < amountMinor) {
      throw new DakotaError(
        422,
        "insufficient_balance",
        `Wallet holds ${available} but the transfer is ${amountMinor}.`,
      );
    }

    this.credit(input.walletId, -amountMinor, input.intent.operation.assetId);

    const transaction: DakotaTransaction = {
      id,
      status: "pending",
      amountMinor,
      assetId: input.intent.operation.assetId,
      networkId: null,
      txHash: stableAddress(`tx:${id}`),
      createdAt: this.now(),
      raw: {},
    };
    this.transactions.set(id, transaction);
    return transaction;
  }

  /** Test/demo hook: settle a pending transaction. */
  settle(id: string): DakotaTransaction {
    const transaction = this.transactions.get(id);
    if (!transaction) throw new DakotaError(404, "not_found", `No transaction ${id}.`);
    const settled: DakotaTransaction = { ...transaction, status: "completed" };
    this.transactions.set(id, settled);
    return settled;
  }

  async getTransaction(id: string): Promise<DakotaTransaction> {
    const transaction = this.transactions.get(id);
    if (!transaction) throw new DakotaError(404, "not_found", `No transaction ${id}.`);
    return transaction;
  }

  async listTransactions(params: { limit?: number } = {}): Promise<DakotaTransaction[]> {
    return [...this.transactions.values()].slice(0, params.limit ?? 100);
  }

  async verifyWebhook(): Promise<DakotaWebhookEvent> {
    throw new DakotaError(
      501,
      "webhook_verification_unmapped",
      "Dakota webhook signature verification is not implemented in any mode. See docs/dakota-api-map.md.",
    );
  }
}
