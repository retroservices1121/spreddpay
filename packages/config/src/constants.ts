/** Assets Spredd Pay understands, with their minor-unit exponent. */
export const ASSET_DECIMALS: Readonly<Record<string, number>> = Object.freeze({
  USDC: 6,
  USD: 2,
  EUR: 2,
});

export const DEFAULT_ASSET = "USDC";
export const DEFAULT_NETWORK = "base";

/**
 * Payouts at or above this value require a second approver. Overridable per
 * partner via PartnerProgram.dualApprovalThresholdMinor.
 */
export const DEFAULT_DUAL_APPROVAL_THRESHOLD_MINOR = 1_000_000_000n; // 1,000 USDC

/** Default daily ceiling on outbound payout volume for a single partner. */
export const DEFAULT_PARTNER_DAILY_LIMIT_MINOR = 250_000_000_000n; // 250,000 USDC

/** Session cookie name shared by all three portals. */
export const SESSION_COOKIE = "spreddpay_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 12;

/** Header carrying the caller-supplied idempotency key on mutating requests. */
export const IDEMPOTENCY_HEADER = "idempotency-key";

/** Feature flags recognised by the platform. */
export const FEATURE_FLAGS = {
  BLEND_YIELD_ENABLED: "blend_yield_enabled",
  CARD_DETAIL_REVEAL: "card_detail_reveal",
  PHYSICAL_CARDS: "physical_cards",
  DIGITAL_WALLET_PROVISIONING: "digital_wallet_provisioning",
} as const;

export type FeatureFlagKey = (typeof FEATURE_FLAGS)[keyof typeof FEATURE_FLAGS];
