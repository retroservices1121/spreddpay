/**
 * The platform vocabulary. These string unions mirror the Prisma enums exactly;
 * `packages/db` re-exports the generated types, and the shared tests assert the
 * two stay in step.
 */

export const PARTNER_STATUSES = [
  "DRAFT",
  "ONBOARDING",
  "ACTIVE",
  "SUSPENDED",
  "CLOSED",
] as const;
export type PartnerStatus = (typeof PARTNER_STATUSES)[number];

// --------------------------------------------------------------------- roles

export const PARTNER_ROLES = [
  "PARTNER_OWNER",
  "PARTNER_ADMIN",
  "PAYOUT_CREATOR",
  "PAYOUT_APPROVER",
  "SUPPORT_AGENT",
  "ANALYST",
  "READ_ONLY",
] as const;
export type PartnerRoleName = (typeof PARTNER_ROLES)[number];

export const PLATFORM_ROLES = [
  "SUPER_ADMIN",
  "OPERATIONS",
  "SUPPORT",
  "FINANCE",
  "READ_ONLY",
] as const;
export type PlatformRoleName = (typeof PLATFORM_ROLES)[number];

// ---------------------------------------------------------- trader lifecycle

export const TRADER_STATUSES = [
  "INVITED",
  "ACCOUNT_CREATED",
  "TERMS_PENDING",
  "KYC_PENDING",
  "KYC_REVIEW",
  "KYC_APPROVED",
  "PROVIDER_ACCOUNT_PENDING",
  "PROVIDER_ACCOUNT_ACTIVE",
  "CARD_ELIGIBLE",
  "VIRTUAL_CARD_PENDING",
  "VIRTUAL_CARD_ACTIVE",
  // failure states
  "KYC_REJECTED",
  "COUNTRY_UNSUPPORTED",
  "ACCOUNT_RESTRICTED",
  "CARD_INELIGIBLE",
  "PROVIDER_ERROR",
  "MANUAL_REVIEW",
] as const;
export type TraderStatus = (typeof TRADER_STATUSES)[number];

export const TRADER_TERMINAL_STATUSES = [
  "KYC_REJECTED",
  "COUNTRY_UNSUPPORTED",
  "ACCOUNT_RESTRICTED",
  "CARD_INELIGIBLE",
] as const satisfies readonly TraderStatus[];

// ------------------------------------------------------------------ payouts

export const PAYOUT_STATUSES = [
  "DRAFT",
  "PENDING_APPROVAL",
  "APPROVED",
  "FUNDING_PENDING",
  "SUBMITTED_TO_PROVIDER",
  "PROCESSING",
  "COMPLETED",
  // exceptional
  "REJECTED",
  "FAILED",
  "CANCELLED",
  "REVERSED",
  "MANUAL_REVIEW",
] as const;
export type PayoutStatus = (typeof PAYOUT_STATUSES)[number];

export const PAYOUT_TERMINAL_STATUSES = [
  "COMPLETED",
  "REJECTED",
  "CANCELLED",
  "REVERSED",
] as const satisfies readonly PayoutStatus[];

export const OPERATION_MODES = [
  "AUTOMATED",
  "MANUAL_REQUIRED",
  "MANUAL_IN_PROGRESS",
  "MANUAL_COMPLETED",
] as const;
export type OperationMode = (typeof OPERATION_MODES)[number];

// -------------------------------------------------------------------- cards

export const CARD_STATUSES = [
  "PENDING",
  "ACTIVE",
  "FROZEN",
  "SUSPENDED",
  "CANCELLED",
  "EXPIRED",
  "REPLACED",
  "FAILED",
] as const;
export type CardStatus = (typeof CARD_STATUSES)[number];

export const CARD_TYPES = ["VIRTUAL", "PHYSICAL"] as const;
export type CardType = (typeof CARD_TYPES)[number];

// ------------------------------------------------------------- transactions

export const TRANSACTION_KINDS = [
  "AUTHORIZATION",
  "CAPTURE",
  "PAYMENT",
  "REFUND",
  "REVERSAL",
  "FEE",
  "ADJUSTMENT",
] as const;
export type TransactionKind = (typeof TRANSACTION_KINDS)[number];

export const TRANSACTION_STATUSES = [
  "PENDING",
  "APPROVED",
  "DECLINED",
  "CLEARED",
  "REVERSED",
  "FAILED",
] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

// ---------------------------------------------------------------- providers

export const BALANCE_SOURCES = ["RAIN", "INTERNAL", "BLEND"] as const;
export type BalanceSource = (typeof BALANCE_SOURCES)[number];

export const PROVIDERS = ["RAIN", "BLEND"] as const;
export type Provider = (typeof PROVIDERS)[number];

// ------------------------------------------------------- phase 2 — blend yield

export const YIELD_ACCOUNT_STATUSES = [
  "NOT_ENABLED",
  "DISCLOSURES_PENDING",
  "ELIGIBILITY_PENDING",
  "ACCOUNT_CREATING",
  "ACCOUNT_ACTIVE",
  "DEPOSIT_ENABLED",
  // exceptional
  "INELIGIBLE",
  "RESTRICTED",
  "ACCOUNT_ERROR",
  "DEPOSIT_PAUSED",
  "WITHDRAWAL_PAUSED",
  "MANUAL_REVIEW",
] as const;
export type YieldAccountStatus = (typeof YIELD_ACCOUNT_STATUSES)[number];

export const YIELD_DEPOSIT_STATUSES = [
  "DRAFT",
  "PENDING_AUTHORIZATION",
  "SUBMITTED",
  "BRIDGING",
  "SETTLING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const;
export type YieldDepositStatus = (typeof YIELD_DEPOSIT_STATUSES)[number];

export const YIELD_WITHDRAWAL_STATUSES = [
  "DRAFT",
  "PENDING_AUTHORIZATION",
  "SUBMITTED",
  "UNWINDING",
  "BRIDGING",
  "SETTLING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const;
export type YieldWithdrawalStatus = (typeof YIELD_WITHDRAWAL_STATUSES)[number];

// ------------------------------------------------------------------- ledger

/** Chart of accounts, per TECHNICAL_README section 16. */
export const LEDGER_ACCOUNTS = [
  "PARTNER_PAYOUTS_PENDING",
  "PARTNER_PAYOUTS_COMPLETED",
  "USER_AVAILABLE_REPORTING",
  "USER_RESERVED_REPORTING",
  "CARD_SPEND_PENDING",
  "CARD_SPEND_CLEARED",
  "CARD_REFUNDS",
  "PROVIDER_FEES",
  "SPREDDPAY_REVENUE",
  "PARTNER_REVENUE_PAYABLE",
  "ADJUSTMENTS",
] as const;
export type LedgerAccountCode = (typeof LEDGER_ACCOUNTS)[number];

export const LEDGER_ACCOUNT_TYPES = ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"] as const;
export type LedgerAccountType = (typeof LEDGER_ACCOUNT_TYPES)[number];

/**
 * Normal balance per account. DEBIT-normal accounts increase with debits.
 * Used for reporting sign conventions, not for validation — validation is
 * simply "every entry sums to zero".
 */
export const LEDGER_ACCOUNT_TYPE_BY_CODE: Readonly<
  Record<LedgerAccountCode, LedgerAccountType>
> = Object.freeze({
  // Payout accounts are debit-normal: an approved payout is value in flight
  // toward the trader, and completion moves it from pending to completed.
  PARTNER_PAYOUTS_PENDING: "ASSET",
  PARTNER_PAYOUTS_COMPLETED: "ASSET",
  USER_AVAILABLE_REPORTING: "LIABILITY",
  USER_RESERVED_REPORTING: "LIABILITY",
  // Spend accounts are credit-normal: they accumulate what the trader's claim
  // has been drawn down by, first as a pending authorization and then as
  // cleared settlement. See docs/ledger.md.
  CARD_SPEND_PENDING: "LIABILITY",
  CARD_SPEND_CLEARED: "LIABILITY",
  CARD_REFUNDS: "ASSET",
  PROVIDER_FEES: "EXPENSE",
  SPREDDPAY_REVENUE: "REVENUE",
  PARTNER_REVENUE_PAYABLE: "LIABILITY",
  ADJUSTMENTS: "EQUITY",
});

// ------------------------------------------------------------------ webhooks

/** Events Spredd Pay emits to partner webhook endpoints. */
export const PARTNER_WEBHOOK_EVENTS = [
  "trader.created",
  "trader.kyc_pending",
  "trader.kyc_approved",
  "trader.kyc_rejected",
  "account.active",
  "card.created",
  "card.active",
  "card.frozen",
  "payout.approved",
  "payout.processing",
  "payout.completed",
  "payout.failed",
  "transaction.pending",
  "transaction.cleared",
  "transaction.reversed",
  "yield.deposit_completed",
  "yield.withdrawal_completed",
] as const;
export type PartnerWebhookEvent = (typeof PARTNER_WEBHOOK_EVENTS)[number];
