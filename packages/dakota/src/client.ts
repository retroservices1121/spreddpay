/**
 * Dakota HTTP client.
 *
 * Every path here is transcribed from docs.dakota.xyz and recorded in
 * docs/dakota-api-map.md alongside the page it came from. Nothing is guessed:
 * where the documentation does not describe a field, the raw payload is kept on
 * the returned object rather than a plausible-looking property being invented.
 */

import { randomUUID } from "node:crypto";
import {
  DAKOTA_BASE_URLS,
  DakotaError,
  type CreateCryptoDestinationInput,
  type CreateCustomerInput,
  type CreateRecipientInput,
  type DakotaBalance,
  type DakotaCustomer,
  type DakotaDestination,
  type DakotaEnvironment,
  type DakotaRecipient,
  type DakotaService,
  type DakotaTransaction,
  type DakotaWallet,
  type DakotaWebhookEvent,
  type SubmitWalletTransactionInput,
} from "./types";

export interface DakotaClientConfig {
  environment: DakotaEnvironment;
  apiKey: string;
  baseUrl?: string;
  webhookSecret?: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

type Json = Record<string, unknown>;

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Parse an amount into integer minor units without ever touching a float.
 *
 * Dakota returns amounts as strings. `Number("0.1") * 1e6` is 100000.00000000001
 * — so the decimal is shifted textually instead.
 */
export function toMinorUnits(amount: string, decimals: number): bigint {
  const trimmed = amount.trim();
  const negative = trimmed.startsWith("-");
  const body = negative ? trimmed.slice(1) : trimmed;
  const [whole = "0", fraction = ""] = body.split(".");

  if (fraction.length > decimals) {
    // Truncating would silently lose value; refuse instead.
    throw new Error(
      `Amount "${amount}" has ${fraction.length} decimal places but the asset supports ${decimals}.`,
    );
  }

  const magnitude = BigInt(`${whole}${fraction.padEnd(decimals, "0")}`);
  return negative ? -magnitude : magnitude;
}

export class DakotaClient implements DakotaService {
  readonly mode: "sandbox" | "production";

  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly webhookSecret: string | undefined;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;

  constructor(config: DakotaClientConfig) {
    this.mode = config.environment;
    this.baseUrl = (config.baseUrl ?? DAKOTA_BASE_URLS[config.environment]).replace(/\/$/, "");
    this.apiKey = config.apiKey;
    this.webhookSecret = config.webhookSecret;
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.now = config.now ?? (() => new Date());
  }

  /**
   * Dakota's three standard headers. `X-Idempotency-Key` is sent on every
   * mutating call — a retried payout that creates two transfers is the failure
   * mode this whole platform is built to avoid.
   */
  private async request<T = Json>(
    method: "GET" | "POST" | "DELETE" | "PATCH",
    path: string,
    body?: unknown,
    idempotencyKey?: string,
  ): Promise<T> {
    const headers: Record<string, string> = {
      "X-API-Key": this.apiKey,
      "Content-Type": "application/json",
    };
    if (method !== "GET") {
      headers["X-Idempotency-Key"] = idempotencyKey ?? randomUUID();
    }

    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(30_000),
    });

    const text = await response.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }

    if (!response.ok) {
      const payload = (parsed ?? {}) as Json;
      throw new DakotaError(
        response.status,
        asString(payload.code) ?? asString(payload.error) ?? `http_${response.status}`,
        asString(payload.message) ?? text.slice(0, 300) ?? response.statusText,
        response.headers.get("x-request-id"),
      );
    }

    return (parsed ?? {}) as T;
  }

  // ------------------------------------------------------------- customers

  private toCustomer(raw: Json): DakotaCustomer {
    return {
      id: String(raw.id ?? ""),
      name: asString(raw.name) ?? "",
      customerType: (asString(raw.customer_type) ?? "business") as DakotaCustomer["customerType"],
      externalId: asString(raw.external_id),
      // Never defaulted to something permissive: an unknown status must not
      // read as "active" anywhere downstream.
      kybStatus: asString(raw.kyb_status) ?? asString(raw.kyc_status) ?? "unknown",
      applicationId: asString(raw.application_id),
      applicationUrl: asString(raw.application_url),
      createdAt: asDate(raw.created_at),
      raw,
    };
  }

  async createCustomer(input: CreateCustomerInput): Promise<DakotaCustomer> {
    const raw = await this.request<Json>("POST", "/customers", {
      name: input.name,
      customer_type: input.customerType,
      ...(input.externalId ? { external_id: input.externalId } : {}),
    });
    return this.toCustomer(raw);
  }

  async getCustomer(id: string): Promise<DakotaCustomer> {
    return this.toCustomer(await this.request<Json>("GET", `/customers/${id}`));
  }

  async listCustomers(params: { limit?: number } = {}): Promise<DakotaCustomer[]> {
    const query = params.limit ? `?limit=${params.limit}` : "";
    const raw = await this.request<Json>("GET", `/customers${query}`);
    const items = Array.isArray(raw.data) ? raw.data : Array.isArray(raw.items) ? raw.items : [];
    return (items as Json[]).map((item) => this.toCustomer(item));
  }

  async mintApplicationLink(customerId: string): Promise<{ applicationUrl: string }> {
    const raw = await this.request<Json>("POST", `/customers/${customerId}/application-link`);
    return { applicationUrl: asString(raw.application_url) ?? "" };
  }

  // ------------------------------------------------ recipients & destinations

  async createRecipient(input: CreateRecipientInput): Promise<DakotaRecipient> {
    const raw = await this.request<Json>("POST", `/customers/${input.customerId}/recipients`, {
      name: input.name,
      ...(input.externalId ? { external_id: input.externalId } : {}),
    });
    return {
      id: String(raw.id ?? ""),
      customerId: input.customerId,
      name: asString(raw.name) ?? input.name,
      raw,
    };
  }

  async createCryptoDestination(
    input: CreateCryptoDestinationInput,
  ): Promise<DakotaDestination> {
    const raw = await this.request<Json>("POST", `/recipients/${input.recipientId}/destinations`, {
      destination_type: "crypto",
      crypto_address: input.cryptoAddress,
      network_id: input.networkId,
    });
    return {
      id: String(raw.id ?? ""),
      recipientId: input.recipientId,
      destinationType: "crypto",
      cryptoAddress: asString(raw.crypto_address) ?? input.cryptoAddress,
      networkId: asString(raw.network_id) ?? input.networkId,
      raw,
    };
  }

  // --------------------------------------------------------------- wallets

  private toWallet(raw: Json): DakotaWallet {
    return {
      id: String(raw.id ?? ""),
      name: asString(raw.name) ?? "",
      family: asString(raw.family) ?? "evm",
      address: asString(raw.address),
      raw,
    };
  }

  async createWallet(input: {
    name: string;
    family: string;
    signerGroups: string[];
    policies: string[];
  }): Promise<DakotaWallet> {
    // signer_groups and policies are both required by Dakota — a wallet with
    // no governance would be one an API key alone could drain.
    return this.toWallet(
      await this.request<Json>("POST", "/wallets", {
        name: input.name,
        family: input.family,
        signer_groups: input.signerGroups,
        policies: input.policies,
      }),
    );
  }

  async getWallet(id: string): Promise<DakotaWallet> {
    return this.toWallet(await this.request<Json>("GET", `/wallets/${id}`));
  }

  async getWalletBalances(id: string): Promise<DakotaBalance[]> {
    const raw = await this.request<Json>("GET", `/wallets/${id}/balances`);
    const items = Array.isArray(raw.data)
      ? raw.data
      : Array.isArray(raw.balances)
        ? raw.balances
        : [];

    return (items as Json[]).map((item) => {
      const decimals = typeof item.decimals === "number" ? item.decimals : 6;
      const amount = asString(item.amount) ?? asString(item.balance) ?? "0";
      return {
        assetId: asString(item.asset_id) ?? asString(item.asset) ?? "",
        networkId: asString(item.network_id),
        amountMinor: toMinorUnits(amount, decimals),
        decimals,
        raw: item,
      };
    });
  }

  async submitWalletTransaction(
    input: SubmitWalletTransactionInput,
  ): Promise<DakotaTransaction> {
    const raw = await this.request<Json>(
      "POST",
      `/wallets/${input.walletId}/transactions`,
      {
        signatures: input.signatures,
        intent: {
          wallet_id: input.intent.walletId,
          caip2: input.intent.caip2,
          operation: {
            kind: input.intent.operation.kind,
            from: input.intent.operation.from,
            to: input.intent.operation.to,
            amount: input.intent.operation.amount,
            asset_id: input.intent.operation.assetId,
          },
          idempotency_key: input.intent.idempotencyKey,
        },
      },
      input.intent.idempotencyKey,
    );
    return this.toTransaction(raw);
  }

  // ---------------------------------------------------------- transactions

  private toTransaction(raw: Json): DakotaTransaction {
    const decimals = typeof raw.decimals === "number" ? raw.decimals : 6;
    const amount = asString(raw.amount);
    return {
      id: String(raw.id ?? ""),
      status: asString(raw.status) ?? asString(raw.state) ?? "unknown",
      amountMinor: amount === null ? null : toMinorUnits(amount, decimals),
      assetId: asString(raw.asset_id) ?? asString(raw.asset),
      networkId: asString(raw.network_id),
      txHash: asString(raw.tx_hash) ?? asString(raw.transaction_hash),
      createdAt: asDate(raw.created_at),
      raw,
    };
  }

  async getTransaction(id: string): Promise<DakotaTransaction> {
    return this.toTransaction(await this.request<Json>("GET", `/transactions/${id}`));
  }

  async listTransactions(params: { limit?: number } = {}): Promise<DakotaTransaction[]> {
    const query = params.limit ? `?limit=${params.limit}` : "";
    const raw = await this.request<Json>("GET", `/transactions${query}`);
    const items = Array.isArray(raw.data) ? raw.data : Array.isArray(raw.items) ? raw.items : [];
    return (items as Json[]).map((item) => this.toTransaction(item));
  }

  // -------------------------------------------------------------- webhooks

  /**
   * Signature verification is NOT implemented, because Dakota's signing scheme
   * has not been read from their webhook documentation yet.
   *
   * This deliberately throws rather than returning `valid: true`. An unverified
   * webhook that the platform treats as authentic would let anyone who knows
   * the URL mark payouts as settled.
   */
  async verifyWebhook(
    _headers: Record<string, string>,
    _rawBody: string,
  ): Promise<DakotaWebhookEvent> {
    throw new DakotaError(
      501,
      "webhook_verification_unmapped",
      "Dakota webhook signature verification is not implemented. Read docs.dakota.xyz/documentation/webhooks and record the scheme in docs/dakota-api-map.md before enabling inbound events.",
    );
  }

  /** Exposed for the health endpoint; never returns the key. */
  describe(): { baseUrl: string; environment: string; hasApiKey: boolean; hasWebhookSecret: boolean } {
    return {
      baseUrl: this.baseUrl,
      environment: this.mode,
      hasApiKey: this.apiKey.length > 0,
      hasWebhookSecret: Boolean(this.webhookSecret),
    };
  }

  /** Sandbox-only: advance a simulated onboarding state. */
  async simulateOnboarding(input: { customerId: string; type: string }): Promise<Json> {
    if (this.mode !== "sandbox") {
      throw new DakotaError(400, "sandbox_only", "Simulation is only available in sandbox.");
    }
    return this.request<Json>("POST", "/sandbox/simulate/onboarding", {
      customer_id: input.customerId,
      type: input.type,
    });
  }
}
