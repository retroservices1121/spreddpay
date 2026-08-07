/**
 * Explicit state machines. Every financial and lifecycle transition in the
 * platform goes through `assertTransition`, so an illegal move fails loudly at
 * the service boundary instead of quietly corrupting a payout record.
 */

import type {
  PayoutStatus,
  TraderStatus,
  CardStatus,
  YieldAccountStatus,
  YieldDepositStatus,
  YieldWithdrawalStatus,
} from "./enums";

export class InvalidTransitionError extends Error {
  readonly from: string;
  readonly to: string;
  readonly machine: string;

  constructor(machine: string, from: string, to: string) {
    super(`${machine}: ${from} → ${to} is not a permitted transition.`);
    this.name = "InvalidTransitionError";
    this.machine = machine;
    this.from = from;
    this.to = to;
  }
}

export type TransitionMap<T extends string> = Readonly<Record<T, readonly T[]>>;

export function canTransition<T extends string>(map: TransitionMap<T>, from: T, to: T): boolean {
  return (map[from] ?? []).includes(to);
}

export function assertTransition<T extends string>(
  machine: string,
  map: TransitionMap<T>,
  from: T,
  to: T,
): void {
  if (!canTransition(map, from, to)) {
    throw new InvalidTransitionError(machine, from, to);
  }
}

// ------------------------------------------------------------------ payouts

/**
 * DRAFT → PENDING_APPROVAL → APPROVED → FUNDING_PENDING → SUBMITTED_TO_RAIN
 *       → PROCESSING → COMPLETED
 *
 * MANUAL_REVIEW is reachable from any in-flight state and can return to the
 * state it interrupted, because an operator resolving a hold should not have to
 * cancel and recreate a payout.
 */
export const PAYOUT_TRANSITIONS: TransitionMap<PayoutStatus> = Object.freeze({
  DRAFT: ["PENDING_APPROVAL", "CANCELLED"],
  PENDING_APPROVAL: ["APPROVED", "REJECTED", "CANCELLED", "MANUAL_REVIEW"],
  APPROVED: ["FUNDING_PENDING", "SUBMITTED_TO_RAIN", "CANCELLED", "MANUAL_REVIEW", "FAILED"],
  FUNDING_PENDING: ["SUBMITTED_TO_RAIN", "FAILED", "MANUAL_REVIEW", "CANCELLED"],
  SUBMITTED_TO_RAIN: ["PROCESSING", "COMPLETED", "FAILED", "MANUAL_REVIEW"],
  PROCESSING: ["COMPLETED", "FAILED", "MANUAL_REVIEW"],
  COMPLETED: ["REVERSED"],
  // exceptional
  REJECTED: [],
  FAILED: ["MANUAL_REVIEW", "PENDING_APPROVAL", "CANCELLED"],
  CANCELLED: [],
  REVERSED: [],
  MANUAL_REVIEW: [
    "APPROVED",
    "FUNDING_PENDING",
    "SUBMITTED_TO_RAIN",
    "PROCESSING",
    "COMPLETED",
    "FAILED",
    "CANCELLED",
    "REJECTED",
  ],
});

export function assertPayoutTransition(from: PayoutStatus, to: PayoutStatus): void {
  assertTransition("Payout", PAYOUT_TRANSITIONS, from, to);
}

/** A payout in a terminal state can never move again. */
export function isPayoutTerminal(status: PayoutStatus): boolean {
  return PAYOUT_TRANSITIONS[status].length === 0;
}

/** Statuses after which funds are considered committed to the trader. */
export function payoutCountsAsDelivered(status: PayoutStatus): boolean {
  return status === "COMPLETED";
}

// ------------------------------------------------------------ trader onboarding

export const TRADER_TRANSITIONS: TransitionMap<TraderStatus> = Object.freeze({
  INVITED: ["ACCOUNT_CREATED", "COUNTRY_UNSUPPORTED"],
  ACCOUNT_CREATED: ["TERMS_PENDING", "ACCOUNT_RESTRICTED"],
  TERMS_PENDING: ["KYC_PENDING", "ACCOUNT_RESTRICTED"],
  KYC_PENDING: ["KYC_REVIEW", "KYC_APPROVED", "KYC_REJECTED", "PROVIDER_ERROR", "MANUAL_REVIEW"],
  KYC_REVIEW: ["KYC_APPROVED", "KYC_REJECTED", "MANUAL_REVIEW"],
  KYC_APPROVED: ["RAIN_ACCOUNT_PENDING", "ACCOUNT_RESTRICTED"],
  RAIN_ACCOUNT_PENDING: ["RAIN_ACCOUNT_ACTIVE", "PROVIDER_ERROR", "MANUAL_REVIEW"],
  RAIN_ACCOUNT_ACTIVE: ["CARD_ELIGIBLE", "ACCOUNT_RESTRICTED"],
  CARD_ELIGIBLE: ["VIRTUAL_CARD_PENDING", "CARD_INELIGIBLE"],
  VIRTUAL_CARD_PENDING: ["VIRTUAL_CARD_ACTIVE", "PROVIDER_ERROR", "CARD_INELIGIBLE"],
  VIRTUAL_CARD_ACTIVE: ["ACCOUNT_RESTRICTED"],
  // failure states
  KYC_REJECTED: [],
  COUNTRY_UNSUPPORTED: [],
  ACCOUNT_RESTRICTED: [],
  CARD_INELIGIBLE: [],
  PROVIDER_ERROR: ["MANUAL_REVIEW", "KYC_PENDING", "RAIN_ACCOUNT_PENDING", "VIRTUAL_CARD_PENDING"],
  MANUAL_REVIEW: [
    "KYC_PENDING",
    "KYC_APPROVED",
    "KYC_REJECTED",
    "RAIN_ACCOUNT_PENDING",
    "RAIN_ACCOUNT_ACTIVE",
    "ACCOUNT_RESTRICTED",
  ],
});

export function assertTraderTransition(from: TraderStatus, to: TraderStatus): void {
  assertTransition("Trader", TRADER_TRANSITIONS, from, to);
}

/**
 * The ordered happy path. Used by the onboarding UI to render progress and by
 * the mock Rain service to advance a trader one verifiable step at a time.
 */
export const TRADER_HAPPY_PATH: readonly TraderStatus[] = Object.freeze([
  "INVITED",
  "ACCOUNT_CREATED",
  "TERMS_PENDING",
  "KYC_PENDING",
  "KYC_APPROVED",
  "RAIN_ACCOUNT_PENDING",
  "RAIN_ACCOUNT_ACTIVE",
  "CARD_ELIGIBLE",
  "VIRTUAL_CARD_PENDING",
  "VIRTUAL_CARD_ACTIVE",
]);

/** A trader may only receive a payout once Rain holds an active account. */
export function traderCanReceivePayout(status: TraderStatus): boolean {
  return (
    status === "RAIN_ACCOUNT_ACTIVE" ||
    status === "CARD_ELIGIBLE" ||
    status === "VIRTUAL_CARD_PENDING" ||
    status === "VIRTUAL_CARD_ACTIVE"
  );
}

// -------------------------------------------------------------------- cards

export const CARD_TRANSITIONS: TransitionMap<CardStatus> = Object.freeze({
  PENDING: ["ACTIVE", "FAILED", "CANCELLED"],
  ACTIVE: ["FROZEN", "SUSPENDED", "CANCELLED", "EXPIRED", "REPLACED"],
  FROZEN: ["ACTIVE", "SUSPENDED", "CANCELLED", "EXPIRED"],
  SUSPENDED: ["ACTIVE", "CANCELLED", "EXPIRED"],
  CANCELLED: [],
  EXPIRED: ["REPLACED"],
  REPLACED: [],
  FAILED: ["PENDING"],
});

export function assertCardTransition(from: CardStatus, to: CardStatus): void {
  assertTransition("Card", CARD_TRANSITIONS, from, to);
}

export function cardCanSpend(status: CardStatus): boolean {
  return status === "ACTIVE";
}

// ------------------------------------------------------- phase 2 — blend yield

export const YIELD_ACCOUNT_TRANSITIONS: TransitionMap<YieldAccountStatus> = Object.freeze({
  NOT_ENABLED: ["DISCLOSURES_PENDING", "INELIGIBLE"],
  DISCLOSURES_PENDING: ["ELIGIBILITY_PENDING", "NOT_ENABLED"],
  ELIGIBILITY_PENDING: ["ACCOUNT_CREATING", "INELIGIBLE", "RESTRICTED", "MANUAL_REVIEW"],
  ACCOUNT_CREATING: ["ACCOUNT_ACTIVE", "ACCOUNT_ERROR"],
  ACCOUNT_ACTIVE: ["DEPOSIT_ENABLED", "RESTRICTED", "DEPOSIT_PAUSED", "WITHDRAWAL_PAUSED"],
  DEPOSIT_ENABLED: ["DEPOSIT_PAUSED", "WITHDRAWAL_PAUSED", "RESTRICTED", "ACCOUNT_ACTIVE"],
  INELIGIBLE: ["ELIGIBILITY_PENDING"],
  RESTRICTED: ["MANUAL_REVIEW", "ACCOUNT_ACTIVE"],
  ACCOUNT_ERROR: ["ACCOUNT_CREATING", "MANUAL_REVIEW"],
  DEPOSIT_PAUSED: ["DEPOSIT_ENABLED", "RESTRICTED"],
  WITHDRAWAL_PAUSED: ["DEPOSIT_ENABLED", "RESTRICTED"],
  MANUAL_REVIEW: ["ACCOUNT_ACTIVE", "RESTRICTED", "INELIGIBLE", "ELIGIBILITY_PENDING"],
});

export const YIELD_DEPOSIT_TRANSITIONS: TransitionMap<YieldDepositStatus> = Object.freeze({
  DRAFT: ["PENDING_AUTHORIZATION", "CANCELLED"],
  PENDING_AUTHORIZATION: ["SUBMITTED", "CANCELLED", "FAILED"],
  SUBMITTED: ["BRIDGING", "SETTLING", "FAILED"],
  BRIDGING: ["SETTLING", "FAILED"],
  SETTLING: ["COMPLETED", "FAILED"],
  COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
});

export const YIELD_WITHDRAWAL_TRANSITIONS: TransitionMap<YieldWithdrawalStatus> = Object.freeze({
  DRAFT: ["PENDING_AUTHORIZATION", "CANCELLED"],
  PENDING_AUTHORIZATION: ["SUBMITTED", "CANCELLED", "FAILED"],
  SUBMITTED: ["UNWINDING", "FAILED"],
  UNWINDING: ["BRIDGING", "SETTLING", "FAILED"],
  BRIDGING: ["SETTLING", "FAILED"],
  SETTLING: ["COMPLETED", "FAILED"],
  COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
});
