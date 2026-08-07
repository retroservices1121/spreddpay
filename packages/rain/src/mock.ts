/**
 * Deterministic mock Rain service.
 *
 * Every identifier, card number suffix, expiry and merchant is derived from a
 * hash of the input, so the same demo run produces the same output every time —
 * screenshots stay stable, tests do not flake, and there is no wall-clock or
 * random dependence anywhere in this file except the injected clock.
 *
 * This mock is a product demo, not a simulation of Rain's semantics. It exists
 * so Milestone 1 can be exercised end to end without provider credentials.
 */

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type {
  CreateRainAccountInput,
  CreateRainCardInput,
  CreateRainCustomerInput,
  NormalizedBalance,
  NormalizedCard,
  NormalizedTransaction,
  ProviderPayout,
  ProviderPayoutInput,
  RainAccount,
  RainCustomer,
  RainKycSession,
  RainKycStatus,
  RainService,
  TransactionPage,
  TransactionQuery,
  ValidationResult,
  VerifiedWebhook,
} from "./types";
import { RainProviderError } from "./types";

/** Stable 32-bit hash. Same input, same number, forever. */
function stableHash(input: string): number {
  const digest = createHash("sha256").update(input).digest();
  return digest.readUInt32BE(0);
}

function stableId(prefix: string, seed: string): string {
  return `${prefix}_${createHash("sha256").update(seed).digest("hex").slice(0, 24)}`;
}

function pick<T>(items: readonly T[], seed: string): T {
  const item = items[stableHash(seed) % items.length];
  // items is never empty at any call site; this keeps noUncheckedIndexedAccess happy.
  return item as T;
}

const MERCHANTS = [
  { name: "Online Purchase", category: "5999", country: "US" },
  { name: "TradingView", category: "7372", country: "US" },
  { name: "Amazon", category: "5942", country: "US" },
  { name: "Uber", category: "4121", country: "US" },
  { name: "Starbucks", category: "5814", country: "US" },
] as const;

export interface MockRainState {
  customers: Map<string, RainCustomer>;
  kyc: Map<string, RainKycStatus>;
  accounts: Map<string, RainAccount>;
  balances: Map<string, NormalizedBalance>;
  cards: Map<string, NormalizedCard>;
  transactions: Map<string, NormalizedTransaction>;
  payouts: Map<string, ProviderPayout>;
}

export interface MockRainOptions {
  /** Injected clock. Tests pass a fixed date; the demo passes Date.now. */
  now?: () => Date;
  /** Shared secret used by verifyWebhook when the caller signs mock events. */
  webhookSecret?: string;
  /**
   * When true, KYC returns APPROVED immediately instead of PENDING. The demo
   * uses this to keep the three-minute run tight.
   */
  autoApproveKyc?: boolean;
}

export function createMockRainState(): MockRainState {
  return {
    customers: new Map(),
    kyc: new Map(),
    accounts: new Map(),
    balances: new Map(),
    cards: new Map(),
    transactions: new Map(),
    payouts: new Map(),
  };
}

export class MockRainService implements RainService {
  readonly mode = "mock" as const;

  private readonly state: MockRainState;
  private readonly now: () => Date;
  private readonly webhookSecret: string;
  private readonly autoApproveKyc: boolean;

  constructor(options: MockRainOptions = {}, state: MockRainState = createMockRainState()) {
    this.state = state;
    this.now = options.now ?? (() => new Date());
    this.webhookSecret = options.webhookSecret ?? "mock_rain_webhook_secret";
    this.autoApproveKyc = options.autoApproveKyc ?? true;
  }

  // ------------------------------------------------------------- customers

  async createCustomer(input: CreateRainCustomerInput): Promise<RainCustomer> {
    const id = stableId("rain_cus", input.externalId);
    const existing = this.state.customers.get(id);
    if (existing) return existing;

    const customer: RainCustomer = {
      id,
      externalId: input.externalId,
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      countryCode: input.countryCode.toUpperCase(),
      status: "PENDING",
      createdAt: this.now(),
    };
    this.state.customers.set(id, customer);
    this.state.kyc.set(id, {
      customerId: id,
      status: "NOT_STARTED",
      reasonCode: null,
      reasonMessage: null,
      updatedAt: this.now(),
    });
    return customer;
  }

  async getCustomer(id: string): Promise<RainCustomer> {
    const customer = this.state.customers.get(id);
    if (!customer) throw new RainProviderError("customer_not_found", `No customer ${id}.`);
    return customer;
  }

  async startKyc(customerId: string): Promise<RainKycSession> {
    await this.getCustomer(customerId);
    const sessionId = stableId("rain_kyc", customerId);
    const status: RainKycStatus = {
      customerId,
      status: this.autoApproveKyc ? "APPROVED" : "PENDING",
      reasonCode: null,
      reasonMessage: null,
      updatedAt: this.now(),
    };
    this.state.kyc.set(customerId, status);

    if (this.autoApproveKyc) {
      const customer = await this.getCustomer(customerId);
      this.state.customers.set(customerId, { ...customer, status: "ACTIVE" });
    }

    return {
      customerId,
      sessionId,
      hostedUrl: `https://mock.rain.local/kyc/${sessionId}`,
      expiresAt: new Date(this.now().getTime() + 60 * 60 * 1000),
    };
  }

  async getKycStatus(customerId: string): Promise<RainKycStatus> {
    const status = this.state.kyc.get(customerId);
    if (!status) throw new RainProviderError("kyc_not_found", `No KYC record for ${customerId}.`);
    return status;
  }

  // -------------------------------------------------------------- accounts

  async createAccount(input: CreateRainAccountInput): Promise<RainAccount> {
    const kyc = await this.getKycStatus(input.customerId);
    if (kyc.status !== "APPROVED") {
      throw new RainProviderError(
        "kyc_not_approved",
        `Customer ${input.customerId} is ${kyc.status}; an account requires APPROVED.`,
      );
    }

    const id = stableId("rain_acc", input.customerId);
    const existing = this.state.accounts.get(id);
    if (existing) return existing;

    const account: RainAccount = {
      id,
      customerId: input.customerId,
      asset: input.asset,
      network: input.network ?? "base",
      status: "ACTIVE",
      depositAddress: `0x${createHash("sha256").update(id).digest("hex").slice(0, 40)}`,
      createdAt: this.now(),
    };
    this.state.accounts.set(id, account);
    this.state.balances.set(id, {
      asset: input.asset,
      network: account.network,
      availableMinor: 0n,
      pendingMinor: 0n,
      reservedMinor: 0n,
      source: "RAIN",
      asOf: this.now(),
    });
    return account;
  }

  async getAccount(id: string): Promise<RainAccount> {
    const account = this.state.accounts.get(id);
    if (!account) throw new RainProviderError("account_not_found", `No account ${id}.`);
    return account;
  }

  async getBalances(accountId: string): Promise<NormalizedBalance[]> {
    await this.getAccount(accountId);
    const balance = this.state.balances.get(accountId);
    return balance ? [{ ...balance, asOf: this.now() }] : [];
  }

  /** Test/demo hook: credit an account as if a payout had settled. */
  creditAccount(accountId: string, amountMinor: bigint): void {
    const balance = this.state.balances.get(accountId);
    if (!balance) return;
    this.state.balances.set(accountId, {
      ...balance,
      availableMinor: balance.availableMinor + amountMinor,
      asOf: this.now(),
    });
  }

  // ----------------------------------------------------------------- cards

  async createVirtualCard(input: CreateRainCardInput): Promise<NormalizedCard> {
    const account = await this.getAccount(input.accountId);
    if (account.status !== "ACTIVE") {
      throw new RainProviderError(
        "account_not_active",
        `Account ${account.id} is ${account.status}; a card requires ACTIVE.`,
      );
    }

    const id = stableId("rain_card", `${input.accountId}:${input.type}`);
    const existing = this.state.cards.get(id);
    if (existing) return existing;

    const seed = stableHash(id);
    const created = this.now();
    const card: NormalizedCard = {
      id,
      customerId: input.customerId,
      accountId: input.accountId,
      type: input.type,
      status: "ACTIVE",
      last4: String(seed % 10000).padStart(4, "0"),
      brand: "VISA",
      expiryMonth: (seed % 12) + 1,
      expiryYear: created.getUTCFullYear() + 3,
      createdAt: created,
      activatedAt: created,
    };
    this.state.cards.set(id, card);
    return card;
  }

  async getCard(id: string): Promise<NormalizedCard> {
    const card = this.state.cards.get(id);
    if (!card) throw new RainProviderError("card_not_found", `No card ${id}.`);
    return card;
  }

  async freezeCard(id: string): Promise<void> {
    const card = await this.getCard(id);
    if (card.status !== "ACTIVE") {
      throw new RainProviderError("card_not_active", `Card ${id} is ${card.status}.`);
    }
    this.state.cards.set(id, { ...card, status: "FROZEN" });
  }

  async unfreezeCard(id: string): Promise<void> {
    const card = await this.getCard(id);
    if (card.status !== "FROZEN") {
      throw new RainProviderError("card_not_frozen", `Card ${id} is ${card.status}.`);
    }
    this.state.cards.set(id, { ...card, status: "ACTIVE" });
  }

  async listCardTransactions(input: TransactionQuery): Promise<TransactionPage> {
    const all = [...this.state.transactions.values()]
      .filter((tx) => (input.cardId ? tx.cardId === input.cardId : true))
      .filter((tx) => (input.customerId ? tx.customerId === input.customerId : true))
      .filter((tx) => (input.from ? tx.occurredAt >= input.from : true))
      .filter((tx) => (input.to ? tx.occurredAt <= input.to : true))
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());

    const limit = input.limit ?? 25;
    const start = input.cursor ? all.findIndex((tx) => tx.id === input.cursor) + 1 : 0;
    const page = all.slice(start, start + limit);
    const hasMore = start + limit < all.length;

    return {
      data: page,
      nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
      hasMore,
    };
  }

  /**
   * Demo/test hook: create a deterministic card transaction. The seed decides
   * the merchant, so `seedTransaction(card, "demo-1")` is the same purchase on
   * every reset.
   */
  seedTransaction(input: {
    cardId: string;
    customerId: string;
    seed: string;
    amountMinor: bigint;
    asset?: string;
    kind?: NormalizedTransaction["kind"];
    status?: NormalizedTransaction["status"];
    occurredAt?: Date;
  }): NormalizedTransaction {
    const merchant = pick(MERCHANTS, input.seed);
    const transaction: NormalizedTransaction = {
      id: stableId("rain_txn", input.seed),
      cardId: input.cardId,
      customerId: input.customerId,
      parentId: null,
      kind: input.kind ?? "AUTHORIZATION",
      status: input.status ?? "PENDING",
      amountMinor: input.amountMinor,
      asset: input.asset ?? "USD",
      originalAmountMinor: null,
      originalAsset: null,
      merchantName: merchant.name,
      merchantCategory: merchant.category,
      merchantCountry: merchant.country,
      merchantId: stableId("rain_mer", merchant.name),
      declineReason: null,
      occurredAt: input.occurredAt ?? this.now(),
      postedAt: null,
    };
    this.state.transactions.set(transaction.id, transaction);
    return transaction;
  }

  // --------------------------------------------------------------- payouts

  async validatePayoutDestination(traderId: string): Promise<ValidationResult> {
    const account = [...this.state.accounts.values()].find((acc) => acc.customerId === traderId);
    const reasons: string[] = [];
    if (!account) reasons.push("no_provider_account");
    else if (account.status !== "ACTIVE") reasons.push(`account_${account.status.toLowerCase()}`);
    return { valid: reasons.length === 0, reasons };
  }

  async createPayout(input: ProviderPayoutInput): Promise<ProviderPayout> {
    const account = await this.getAccount(input.accountId);
    if (account.status !== "ACTIVE") {
      throw new RainProviderError("account_not_active", `Account ${account.id} is not active.`);
    }
    if (input.amountMinor <= 0n) {
      throw new RainProviderError("invalid_amount", "Payout amount must be positive.");
    }

    // Idempotency: the same key always yields the same provider payout.
    const id = stableId("rain_tr", input.idempotencyKey);
    const existing = this.state.payouts.get(id);
    if (existing) return existing;

    const created = this.now();
    const payout: ProviderPayout = {
      id,
      reference: input.reference,
      status: "PROCESSING",
      amountMinor: input.amountMinor,
      asset: input.asset,
      network: input.network,
      txHash: `0x${createHash("sha256").update(id).digest("hex")}`,
      feeMinor: 0n,
      failureCode: null,
      failureMessage: null,
      createdAt: created,
      settledAt: null,
    };
    this.state.payouts.set(id, payout);
    return payout;
  }

  async getPayout(id: string): Promise<ProviderPayout> {
    const payout = this.state.payouts.get(id);
    if (!payout) throw new RainProviderError("payout_not_found", `No payout ${id}.`);
    return payout;
  }

  /**
   * Demo/test hook: settle a mock payout and credit the destination account.
   * Real settlement arrives as a webhook; the worker calls the same code path.
   */
  settlePayout(id: string, accountId: string): ProviderPayout {
    const payout = this.state.payouts.get(id);
    if (!payout) throw new RainProviderError("payout_not_found", `No payout ${id}.`);
    const settled: ProviderPayout = { ...payout, status: "COMPLETED", settledAt: this.now() };
    this.state.payouts.set(id, settled);
    this.creditAccount(accountId, payout.amountMinor);
    return settled;
  }

  // -------------------------------------------------------------- webhooks

  async verifyWebhook(
    headers: Record<string, string>,
    rawBody: string,
  ): Promise<VerifiedWebhook> {
    const signature = headers["x-rain-signature"] ?? headers["X-Rain-Signature"] ?? "";
    const expected = createHmac("sha256", this.webhookSecret).update(rawBody).digest("hex");

    let valid = false;
    if (signature.length === expected.length) {
      valid = timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    }

    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      valid = false;
    }

    return {
      valid,
      eventId: String(payload.id ?? stableId("rain_evt", rawBody)),
      eventType: String(payload.type ?? "unknown"),
      payload,
      receivedAt: this.now(),
    };
  }

  /** Sign a body the way the mock expects — used by demo tooling and tests. */
  signWebhook(rawBody: string): string {
    return createHmac("sha256", this.webhookSecret).update(rawBody).digest("hex");
  }

  // ------------------------------------------------------------ rehydration

  /**
   * The mock holds its state in memory, so a restarted API would not recognise
   * the provider ids the demo seed wrote to the database. These `restore*`
   * methods let the caller replay SpreddPay's own records back into the mock at
   * boot, which keeps freeze/unfreeze and balance lookups working across
   * restarts. Nothing here fabricates state the platform does not already hold.
   */
  restoreCustomer(customer: RainCustomer): void {
    this.state.customers.set(customer.id, customer);
    if (!this.state.kyc.has(customer.id)) {
      this.state.kyc.set(customer.id, {
        customerId: customer.id,
        status: customer.status === "ACTIVE" ? "APPROVED" : "PENDING",
        reasonCode: null,
        reasonMessage: null,
        updatedAt: customer.createdAt,
      });
    }
  }

  restoreAccount(account: RainAccount, balance?: Partial<NormalizedBalance>): void {
    this.state.accounts.set(account.id, account);
    this.state.balances.set(account.id, {
      asset: account.asset,
      network: account.network,
      availableMinor: balance?.availableMinor ?? 0n,
      pendingMinor: balance?.pendingMinor ?? 0n,
      reservedMinor: balance?.reservedMinor ?? 0n,
      source: "RAIN",
      asOf: balance?.asOf ?? this.now(),
    });
  }

  restoreCard(card: NormalizedCard): void {
    this.state.cards.set(card.id, card);
  }

  restoreTransaction(transaction: NormalizedTransaction): void {
    this.state.transactions.set(transaction.id, transaction);
  }
}
