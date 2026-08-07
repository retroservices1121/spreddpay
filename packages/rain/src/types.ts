/**
 * The Rain adapter surface, per TECHNICAL_README section 10.
 *
 * These are SpreddPay's *normalized* types. They are deliberately not Rain's
 * wire format: the sandbox client, once written against Rain's private
 * documentation, maps Rain objects onto these. Nothing here should be taken as
 * a claim about Rain's actual endpoint or field names — those come from the
 * private dashboard docs and get recorded in docs/rain-api-map.md.
 */

import type { CardStatus, CardType, TransactionKind, TransactionStatus } from "@spreddpay/contracts";

export interface RainCustomer {
  id: string;
  externalId: string;
  email: string;
  firstName: string;
  lastName: string;
  countryCode: string;
  status: "PENDING" | "ACTIVE" | "RESTRICTED" | "REJECTED";
  createdAt: Date;
}

export interface CreateRainCustomerInput {
  externalId: string;
  email: string;
  firstName: string;
  lastName: string;
  countryCode: string;
  programId?: string | null;
}

export interface RainKycSession {
  customerId: string;
  sessionId: string;
  /** Provider-hosted flow. SpreddPay never collects identity documents itself. */
  hostedUrl: string;
  expiresAt: Date;
}

export interface RainKycStatus {
  customerId: string;
  status: "NOT_STARTED" | "PENDING" | "IN_REVIEW" | "APPROVED" | "REJECTED";
  reasonCode: string | null;
  reasonMessage: string | null;
  updatedAt: Date;
}

export interface RainAccount {
  id: string;
  customerId: string;
  asset: string;
  network: string | null;
  status: "PENDING" | "ACTIVE" | "RESTRICTED" | "CLOSED";
  depositAddress: string | null;
  createdAt: Date;
}

export interface CreateRainAccountInput {
  customerId: string;
  asset: string;
  network?: string | null;
  programId?: string | null;
}

export interface NormalizedBalance {
  asset: string;
  network: string | null;
  availableMinor: bigint;
  pendingMinor: bigint;
  reservedMinor: bigint;
  source: "RAIN" | "INTERNAL" | "BLEND";
  asOf: Date;
}

export interface CreateRainCardInput {
  customerId: string;
  accountId: string;
  type: CardType;
  cardLabel: string;
  programId?: string | null;
}

export interface NormalizedCard {
  id: string;
  customerId: string;
  accountId: string;
  type: CardType;
  status: CardStatus;
  last4: string | null;
  brand: string | null;
  expiryMonth: number | null;
  expiryYear: number | null;
  createdAt: Date;
  activatedAt: Date | null;
}

export interface TransactionQuery {
  cardId?: string;
  customerId?: string;
  from?: Date;
  to?: Date;
  cursor?: string | null;
  limit?: number;
}

export interface NormalizedTransaction {
  id: string;
  cardId: string | null;
  customerId: string;
  parentId: string | null;
  kind: TransactionKind;
  status: TransactionStatus;
  amountMinor: bigint;
  asset: string;
  originalAmountMinor: bigint | null;
  originalAsset: string | null;
  merchantName: string | null;
  merchantCategory: string | null;
  merchantCountry: string | null;
  merchantId: string | null;
  declineReason: string | null;
  occurredAt: Date;
  postedAt: Date | null;
}

export interface TransactionPage {
  data: NormalizedTransaction[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface ValidationResult {
  valid: boolean;
  /** Machine-readable reasons the destination cannot receive funds. */
  reasons: string[];
}

export interface ProviderPayoutInput {
  /** SpreddPay payout id — echoed back so webhooks can be correlated. */
  reference: string;
  customerId: string;
  accountId: string;
  amountMinor: bigint;
  asset: string;
  network: string;
  idempotencyKey: string;
  programId?: string | null;
}

export interface ProviderPayout {
  id: string;
  reference: string;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  amountMinor: bigint;
  asset: string;
  network: string | null;
  txHash: string | null;
  feeMinor: bigint | null;
  failureCode: string | null;
  failureMessage: string | null;
  createdAt: Date;
  settledAt: Date | null;
}

export interface VerifiedWebhook {
  valid: boolean;
  eventId: string;
  eventType: string;
  payload: Record<string, unknown>;
  receivedAt: Date;
}

/**
 * Capabilities Rain has not confirmed for SpreddPay's program are reported here
 * rather than faked. Anything listed in docs/rain-program-limitations.md throws
 * `RainCapabilityUnavailableError` in every mode.
 */
export class RainCapabilityUnavailableError extends Error {
  readonly capability: string;

  constructor(capability: string, detail?: string) {
    super(
      `Rain capability "${capability}" is not verified for this program.${detail ? ` ${detail}` : ""} See docs/rain-program-limitations.md.`,
    );
    this.name = "RainCapabilityUnavailableError";
    this.capability = capability;
  }
}

export class RainProviderError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(code: string, message: string, retryable = false) {
    super(message);
    this.name = "RainProviderError";
    this.code = code;
    this.retryable = retryable;
  }
}

export interface RainService {
  readonly mode: "mock" | "sandbox" | "production";

  createCustomer(input: CreateRainCustomerInput): Promise<RainCustomer>;
  getCustomer(id: string): Promise<RainCustomer>;
  startKyc(customerId: string): Promise<RainKycSession>;
  getKycStatus(customerId: string): Promise<RainKycStatus>;

  createAccount(input: CreateRainAccountInput): Promise<RainAccount>;
  getAccount(id: string): Promise<RainAccount>;
  getBalances(accountId: string): Promise<NormalizedBalance[]>;

  createVirtualCard(input: CreateRainCardInput): Promise<NormalizedCard>;
  getCard(id: string): Promise<NormalizedCard>;
  freezeCard(id: string): Promise<void>;
  unfreezeCard(id: string): Promise<void>;
  listCardTransactions(input: TransactionQuery): Promise<TransactionPage>;

  validatePayoutDestination(traderId: string): Promise<ValidationResult>;
  createPayout(input: ProviderPayoutInput): Promise<ProviderPayout>;
  getPayout(id: string): Promise<ProviderPayout>;

  verifyWebhook(headers: Record<string, string>, rawBody: string): Promise<VerifiedWebhook>;
}
