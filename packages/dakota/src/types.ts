/**
 * Dakota adapter types.
 *
 * Unlike the Rain adapter, these are grounded in Dakota's *public*
 * documentation (docs.dakota.xyz), so the endpoint paths and field names here
 * are transcribed rather than invented. Every capability is recorded in
 * docs/dakota-api-map.md with the page it came from.
 *
 * Dakota's domain model, in its own words:
 *   Client      — us. SpreddPay.
 *   Customer    — a business or individual we process payments for. KYB/KYC'd.
 *   Sub-Client  — a business customer designated as an intermediary, so other
 *                 customers can be grouped underneath it.
 *   Recipient   — a person or entity that receives payments for a customer.
 *   Destination — the specific bank account or crypto address for a recipient.
 *   Wallet      — a non-custodial on-chain wallet, governed by signer groups
 *                 and policies, whose transactions are signed client-side.
 *   Account     — an automated onramp/offramp configuration.
 *
 * Two consequences worth stating plainly, because they change the product:
 *
 *   1. Dakota issues no cards. Card issuance is deferred until their card
 *      programme opens.
 *   2. Wallets are non-custodial and require an ES256 signature over an
 *      RFC 8785-canonicalised intent. SpreddPay cannot move funds by API key
 *      alone, which is a stronger security posture than a custodial provider
 *      and a real constraint on where signing keys live.
 */

export type DakotaEnvironment = "sandbox" | "production";

export const DAKOTA_BASE_URLS: Readonly<Record<DakotaEnvironment, string>> = Object.freeze({
  production: "https://api.platform.dakota.xyz",
  sandbox: "https://api.platform.sandbox.dakota.xyz",
});

// ------------------------------------------------------------------ errors

export class DakotaError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string | null;

  constructor(status: number, code: string, message: string, requestId: string | null = null) {
    super(message);
    this.name = "DakotaError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }

  /** 5xx and 429 are worth retrying; a 4xx will fail again identically. */
  get retryable(): boolean {
    return this.status >= 500 || this.status === 429;
  }
}

export class DakotaCapabilityUnavailableError extends Error {
  readonly capability: string;

  constructor(capability: string, detail?: string) {
    super(
      `Dakota does not provide "${capability}".${detail ? ` ${detail}` : ""} See docs/dakota-api-map.md.`,
    );
    this.name = "DakotaCapabilityUnavailableError";
    this.capability = capability;
  }
}

// --------------------------------------------------------------- customers

export type DakotaCustomerType = "business" | "individual";

/**
 * KYB/KYC status. `active` is the value Dakota's onboarding flow documents as
 * the point at which a customer may transact; anything else is treated as
 * not-yet-eligible rather than guessed at.
 */
export type DakotaKycStatus = string;

export interface DakotaCustomer {
  id: string;
  name: string;
  customerType: DakotaCustomerType;
  externalId: string | null;
  kybStatus: DakotaKycStatus;
  /** Present on creation: the hosted onboarding form to send the customer to. */
  applicationId: string | null;
  applicationUrl: string | null;
  createdAt: Date | null;
  raw: Record<string, unknown>;
}

export interface CreateCustomerInput {
  name: string;
  customerType: DakotaCustomerType;
  /** Our own id for this customer, echoed back on reads. */
  externalId?: string;
}

// -------------------------------------------------- recipients & destinations

export interface DakotaRecipient {
  id: string;
  customerId: string;
  name: string;
  raw: Record<string, unknown>;
}

export interface CreateRecipientInput {
  customerId: string;
  name: string;
  externalId?: string;
}

export type DakotaDestinationType = "crypto" | "fiat_us";

export interface DakotaDestination {
  id: string;
  recipientId: string;
  destinationType: DakotaDestinationType;
  /** Set for crypto destinations. */
  cryptoAddress: string | null;
  networkId: string | null;
  raw: Record<string, unknown>;
}

export interface CreateCryptoDestinationInput {
  recipientId: string;
  cryptoAddress: string;
  /** e.g. "base-mainnet". Sandbox rejects mainnet ids — see the api map. */
  networkId: string;
}

// ----------------------------------------------------------------- wallets

export interface DakotaWallet {
  id: string;
  name: string;
  family: string;
  address: string | null;
  raw: Record<string, unknown>;
}

export interface DakotaBalance {
  assetId: string;
  networkId: string | null;
  /** Integer minor units. Never a float, and never a JS number. */
  amountMinor: bigint;
  decimals: number;
  raw: Record<string, unknown>;
}

// ------------------------------------------------------------ transactions

export type DakotaTransactionStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "failed"
  | "cancelled"
  | string;

export interface DakotaTransaction {
  id: string;
  status: DakotaTransactionStatus;
  amountMinor: bigint | null;
  assetId: string | null;
  networkId: string | null;
  txHash: string | null;
  createdAt: Date | null;
  raw: Record<string, unknown>;
}

/**
 * A wallet transfer intent.
 *
 * Dakota requires this to be canonicalised (RFC 8785 JCS), SHA-256 hashed and
 * signed with an ES256 key before submission. SpreddPay builds the intent; the
 * signature comes from a signer the platform controls. See
 * docs/dakota-flow-of-funds.md for where that key is expected to live — which
 * is an open question and deliberately not answered in code yet.
 */
export interface WalletTransferIntent {
  walletId: string;
  /** CAIP-2 chain identifier, e.g. "eip155:8453". */
  caip2: string;
  operation: {
    kind: "transfer";
    from: string;
    to: string;
    /** Integer minor units, as a string, exactly as Dakota expects on the wire. */
    amount: string;
    assetId: string;
  };
  idempotencyKey: string;
}

export interface SubmitWalletTransactionInput {
  walletId: string;
  intent: WalletTransferIntent;
  /** Base64 DER ES256 signatures over the canonicalised intent. */
  signatures: string[];
}

// ---------------------------------------------------------------- webhooks

export interface DakotaWebhookEvent {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  receivedAt: Date;
}

/**
 * The adapter surface SpreddPay codes against.
 *
 * Scoped to what Dakota's documentation actually describes. There is no
 * `createCard` here, because Dakota has no card product — a method that exists
 * only to throw would imply the capability is coming from this provider.
 */
export interface DakotaService {
  readonly mode: "mock" | "sandbox" | "production";

  createCustomer(input: CreateCustomerInput): Promise<DakotaCustomer>;
  getCustomer(id: string): Promise<DakotaCustomer>;
  listCustomers(params?: { limit?: number }): Promise<DakotaCustomer[]>;
  /** Fresh hosted-application link for re-engaging an approved customer. */
  mintApplicationLink(customerId: string): Promise<{ applicationUrl: string }>;

  createRecipient(input: CreateRecipientInput): Promise<DakotaRecipient>;
  createCryptoDestination(input: CreateCryptoDestinationInput): Promise<DakotaDestination>;

  createWallet(input: {
    name: string;
    family: string;
    signerGroups: string[];
    policies: string[];
  }): Promise<DakotaWallet>;
  getWallet(id: string): Promise<DakotaWallet>;
  getWalletBalances(id: string): Promise<DakotaBalance[]>;
  submitWalletTransaction(input: SubmitWalletTransactionInput): Promise<DakotaTransaction>;

  getTransaction(id: string): Promise<DakotaTransaction>;
  listTransactions(params?: { limit?: number }): Promise<DakotaTransaction[]>;

  verifyWebhook(headers: Record<string, string>, rawBody: string): Promise<DakotaWebhookEvent>;
}
