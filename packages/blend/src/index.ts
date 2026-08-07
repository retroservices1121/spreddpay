/**
 * Blend adapter — Phase 2, deliberately unimplemented in Milestone 1.
 *
 * The initial build instruction is explicit: "Do not implement Blend." What
 * exists here is the interface shape from TECHNICAL_README section 21 so the
 * database models and the Earn feature flag have something to type against.
 *
 * Milestone 8 onward fills this in against Blend's *current official*
 * documentation (https://docs.blend.money/). Method names below are placeholders
 * for SpreddPay's own adapter surface; the real SDK method names must be read
 * from Blend's docs, not assumed from this file.
 *
 * Two product rules constrain whatever gets written here:
 *   * Rain spend balance and Blend earn balance are always displayed separately.
 *   * No automated Rain-to-Blend movement ships until docs/rain-blend-flow.md
 *     is approved by both providers.
 */

import type { YieldAccountStatus } from "@spreddpay/contracts";

export interface YieldAccount {
  id: string;
  traderId: string;
  providerAccountId: string | null;
  status: YieldAccountStatus;
  asset: string;
  createdAt: Date;
}

export interface YieldBalance {
  traderId: string;
  balanceMinor: bigint;
  asset: string;
  /** Provider-reported and variable. Never presented as guaranteed. */
  currentApyBps: number | null;
  apyAsOf: Date | null;
  asOf: Date;
}

export interface YieldStrategy {
  id: string;
  name: string;
  description: string | null;
  asset: string;
  currentApyBps: number | null;
  apyAsOf: Date | null;
}

export interface YieldDepositInput {
  traderId: string;
  amountMinor: bigint;
  asset: string;
  strategyId?: string | null;
}

export interface YieldWithdrawalInput {
  traderId: string;
  amountMinor: bigint;
  asset: string;
}

export interface YieldIntent {
  id: string;
  traderId: string;
  kind: "DEPOSIT" | "WITHDRAWAL";
  amountMinor: bigint;
  asset: string;
  expiresAt: Date;
}

export interface SubmitYieldIntentInput {
  intentId: string;
  /** Signature material, when the flow requires the trader to authorise. */
  authorization?: string;
}

export interface YieldTransaction {
  id: string;
  traderId: string;
  kind: "DEPOSIT" | "WITHDRAWAL";
  status: string;
  amountMinor: bigint;
  asset: string;
  txHash: string | null;
  createdAt: Date;
  completedAt: Date | null;
}

export interface BlendYieldService {
  readonly mode: "mock" | "sandbox" | "production";

  getOrCreateAccount(traderId: string): Promise<YieldAccount>;
  getBalance(traderId: string): Promise<YieldBalance>;
  listStrategies(): Promise<YieldStrategy[]>;
  createDepositIntent(input: YieldDepositInput): Promise<YieldIntent>;
  submitDeposit(input: SubmitYieldIntentInput): Promise<YieldTransaction>;
  createWithdrawalIntent(input: YieldWithdrawalInput): Promise<YieldIntent>;
  submitWithdrawal(input: SubmitYieldIntentInput): Promise<YieldTransaction>;
  getTransaction(id: string): Promise<YieldTransaction>;
}

export class BlendNotImplementedError extends Error {
  constructor(capability: string) {
    super(
      `Blend capability "${capability}" is Phase 2 and is not implemented. It ships behind the blend_yield_enabled flag once docs/blend-api-map.md and docs/rain-blend-flow.md are approved.`,
    );
    this.name = "BlendNotImplementedError";
  }
}

/**
 * Every Phase 1 caller gets this. It exists so the Earn surfaces can be built
 * and flagged off without a second code path, and so nothing accidentally ships
 * a fabricated yield number.
 */
export class UnavailableBlendService implements BlendYieldService {
  readonly mode: "mock" | "sandbox" | "production";

  constructor(mode: "mock" | "sandbox" | "production" = "mock") {
    this.mode = mode;
  }

  async getOrCreateAccount(): Promise<YieldAccount> {
    throw new BlendNotImplementedError("getOrCreateAccount");
  }
  async getBalance(): Promise<YieldBalance> {
    throw new BlendNotImplementedError("getBalance");
  }
  async listStrategies(): Promise<YieldStrategy[]> {
    throw new BlendNotImplementedError("listStrategies");
  }
  async createDepositIntent(): Promise<YieldIntent> {
    throw new BlendNotImplementedError("createDepositIntent");
  }
  async submitDeposit(): Promise<YieldTransaction> {
    throw new BlendNotImplementedError("submitDeposit");
  }
  async createWithdrawalIntent(): Promise<YieldIntent> {
    throw new BlendNotImplementedError("createWithdrawalIntent");
  }
  async submitWithdrawal(): Promise<YieldTransaction> {
    throw new BlendNotImplementedError("submitWithdrawal");
  }
  async getTransaction(): Promise<YieldTransaction> {
    throw new BlendNotImplementedError("getTransaction");
  }
}

export function createBlendService(mode: "mock" | "sandbox" | "production"): BlendYieldService {
  return new UnavailableBlendService(mode);
}
