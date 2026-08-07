/**
 * Named journal entries for the business events Phase 1 produces.
 *
 * Keeping the postings in one file means the accounting convention is reviewable
 * in a single place, and every service records the same shape for the same
 * event. Each recipe is documented in docs/ledger.md.
 */

import type { DatabaseTransaction } from "@spreddpay/db";
import { postEntry, type PostedEntry, type PostingInput } from "./entry";

export interface PayoutLedgerContext {
  partnerId: string;
  payoutId: string;
  traderId: string;
  amountMinor: bigint;
  asset: string;
  externalReference: string;
}

/**
 * payout.approved — the obligation exists but funds have not reached the trader.
 *
 *   DEBIT  PARTNER_PAYOUTS_PENDING   value in flight
 *   CREDIT USER_RESERVED_REPORTING   the trader's reserved claim
 */
export function payoutApprovedPostings(amountMinor: bigint, asset: string): PostingInput[] {
  return [
    { account: "PARTNER_PAYOUTS_PENDING", direction: "DEBIT", amountMinor, asset },
    { account: "USER_RESERVED_REPORTING", direction: "CREDIT", amountMinor, asset },
  ];
}

export async function recordPayoutApproved(
  tx: DatabaseTransaction,
  ctx: PayoutLedgerContext,
): Promise<PostedEntry> {
  return postEntry(tx, {
    partnerId: ctx.partnerId,
    eventType: "payout.approved",
    entityType: "Payout",
    entityId: ctx.payoutId,
    payoutId: ctx.payoutId,
    asset: ctx.asset,
    description: `Payout ${ctx.externalReference} approved for trader ${ctx.traderId}`,
    postings: payoutApprovedPostings(ctx.amountMinor, ctx.asset),
  });
}

/**
 * payout.completed — funds are available through the approved Rain flow.
 *
 *   DEBIT  USER_RESERVED_REPORTING     release the reservation
 *   CREDIT USER_AVAILABLE_REPORTING    the trader can now spend it
 *   DEBIT  PARTNER_PAYOUTS_COMPLETED   delivered value
 *   CREDIT PARTNER_PAYOUTS_PENDING     no longer in flight
 */
export function payoutCompletedPostings(amountMinor: bigint, asset: string): PostingInput[] {
  return [
    { account: "USER_RESERVED_REPORTING", direction: "DEBIT", amountMinor, asset },
    { account: "USER_AVAILABLE_REPORTING", direction: "CREDIT", amountMinor, asset },
    { account: "PARTNER_PAYOUTS_COMPLETED", direction: "DEBIT", amountMinor, asset },
    { account: "PARTNER_PAYOUTS_PENDING", direction: "CREDIT", amountMinor, asset },
  ];
}

export async function recordPayoutCompleted(
  tx: DatabaseTransaction,
  ctx: PayoutLedgerContext,
): Promise<PostedEntry> {
  return postEntry(tx, {
    partnerId: ctx.partnerId,
    eventType: "payout.completed",
    entityType: "Payout",
    entityId: ctx.payoutId,
    payoutId: ctx.payoutId,
    asset: ctx.asset,
    description: `Payout ${ctx.externalReference} completed for trader ${ctx.traderId}`,
    postings: payoutCompletedPostings(ctx.amountMinor, ctx.asset),
  });
}

/**
 * payout.failed — unwind the reservation created at approval.
 */
export async function recordPayoutFailed(
  tx: DatabaseTransaction,
  ctx: PayoutLedgerContext,
  reason: string,
): Promise<PostedEntry> {
  return postEntry(tx, {
    partnerId: ctx.partnerId,
    eventType: "payout.failed",
    entityType: "Payout",
    entityId: ctx.payoutId,
    payoutId: ctx.payoutId,
    asset: ctx.asset,
    description: `Payout ${ctx.externalReference} failed: ${reason}`,
    postings: [
      {
        account: "USER_RESERVED_REPORTING",
        direction: "DEBIT",
        amountMinor: ctx.amountMinor,
        asset: ctx.asset,
      },
      {
        account: "PARTNER_PAYOUTS_PENDING",
        direction: "CREDIT",
        amountMinor: ctx.amountMinor,
        asset: ctx.asset,
      },
    ],
  });
}

export interface CardSpendContext {
  partnerId: string;
  traderId: string;
  transactionId: string;
  amountMinor: bigint;
  asset: string;
  merchantName: string | null;
}

/**
 * transaction.pending — an authorization holds part of the trader's balance.
 *
 *   DEBIT  USER_AVAILABLE_REPORTING   claim drawn down
 *   CREDIT CARD_SPEND_PENDING         held against an authorization
 */
export async function recordCardAuthorization(
  tx: DatabaseTransaction,
  ctx: CardSpendContext,
): Promise<PostedEntry> {
  return postEntry(tx, {
    partnerId: ctx.partnerId,
    eventType: "transaction.pending",
    entityType: "CardTransaction",
    entityId: ctx.transactionId,
    asset: ctx.asset,
    description: `Authorization${ctx.merchantName ? ` at ${ctx.merchantName}` : ""}`,
    postings: [
      {
        account: "USER_AVAILABLE_REPORTING",
        direction: "DEBIT",
        amountMinor: ctx.amountMinor,
        asset: ctx.asset,
      },
      {
        account: "CARD_SPEND_PENDING",
        direction: "CREDIT",
        amountMinor: ctx.amountMinor,
        asset: ctx.asset,
      },
    ],
  });
}

/**
 * transaction.cleared — settlement replaces the hold.
 *
 *   DEBIT  CARD_SPEND_PENDING   release the hold
 *   CREDIT CARD_SPEND_CLEARED   settled spend
 */
export async function recordCardCleared(
  tx: DatabaseTransaction,
  ctx: CardSpendContext,
): Promise<PostedEntry> {
  return postEntry(tx, {
    partnerId: ctx.partnerId,
    eventType: "transaction.cleared",
    entityType: "CardTransaction",
    entityId: ctx.transactionId,
    asset: ctx.asset,
    description: `Settlement${ctx.merchantName ? ` at ${ctx.merchantName}` : ""}`,
    postings: [
      {
        account: "CARD_SPEND_PENDING",
        direction: "DEBIT",
        amountMinor: ctx.amountMinor,
        asset: ctx.asset,
      },
      {
        account: "CARD_SPEND_CLEARED",
        direction: "CREDIT",
        amountMinor: ctx.amountMinor,
        asset: ctx.asset,
      },
    ],
  });
}

/**
 * transaction.refunded — value returns to the trader's spendable claim.
 */
export async function recordCardRefund(
  tx: DatabaseTransaction,
  ctx: CardSpendContext,
): Promise<PostedEntry> {
  return postEntry(tx, {
    partnerId: ctx.partnerId,
    eventType: "transaction.refunded",
    entityType: "CardTransaction",
    entityId: ctx.transactionId,
    asset: ctx.asset,
    description: `Refund${ctx.merchantName ? ` from ${ctx.merchantName}` : ""}`,
    postings: [
      {
        account: "CARD_REFUNDS",
        direction: "DEBIT",
        amountMinor: ctx.amountMinor,
        asset: ctx.asset,
      },
      {
        account: "USER_AVAILABLE_REPORTING",
        direction: "CREDIT",
        amountMinor: ctx.amountMinor,
        asset: ctx.asset,
      },
    ],
  });
}

/**
 * revenue.recognized — split realized revenue between Spredd Pay and the partner.
 * Estimated or unrealized yield never reaches this recipe.
 */
export async function recordRevenueRecognized(
  tx: DatabaseTransaction,
  input: {
    partnerId: string;
    revenueEventId: string;
    asset: string;
    grossMinor: bigint;
    spreddPayMinor: bigint;
    partnerMinor: bigint;
    source: string;
  },
): Promise<PostedEntry> {
  const residual = input.grossMinor - input.spreddPayMinor - input.partnerMinor;
  const postings: PostingInput[] = [
    {
      account: "ADJUSTMENTS",
      direction: "DEBIT",
      amountMinor: input.grossMinor,
      asset: input.asset,
    },
  ];

  if (input.spreddPayMinor > 0n) {
    postings.push({
      account: "SPREDDPAY_REVENUE",
      direction: "CREDIT",
      amountMinor: input.spreddPayMinor,
      asset: input.asset,
    });
  }
  if (input.partnerMinor > 0n) {
    postings.push({
      account: "PARTNER_REVENUE_PAYABLE",
      direction: "CREDIT",
      amountMinor: input.partnerMinor,
      asset: input.asset,
    });
  }
  if (residual > 0n) {
    // Anything not allocated by a revenue rule stays in provider fees rather
    // than silently inflating Spredd Pay's share.
    postings.push({
      account: "PROVIDER_FEES",
      direction: "CREDIT",
      amountMinor: residual,
      asset: input.asset,
    });
  }

  return postEntry(tx, {
    partnerId: input.partnerId,
    eventType: "revenue.recognized",
    entityType: "RevenueEvent",
    entityId: input.revenueEventId,
    asset: input.asset,
    description: `Revenue recognised from ${input.source}`,
    postings,
  });
}
