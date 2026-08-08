/**
 * Transaction ingestion and balance sync.
 *
 * The rules from TECHNICAL_README section 14 that shape this file:
 *   * merge updates into existing transactions rather than inserting twice;
 *   * key on the provider transaction id so duplicates are impossible;
 *   * preserve provider ids, merchant data and timestamps;
 *   * model refunds and reversals as their own rows, not as edits.
 */

import type { TransactionKind, TransactionStatus } from "@spreddpay/contracts";
import type { Database } from "@spreddpay/db";
import {
  recordCardAuthorization,
  recordCardCleared,
  recordCardRefund,
} from "@spreddpay/ledger";
import { queuePartnerWebhook } from "@spreddpay/notifications";
import type { NormalizedTransaction, RainService } from "@spreddpay/rain";

export interface TransactionDeps {
  db: Database;
  rain: RainService;
}

/**
 * Upsert a normalized provider transaction.
 *
 * Returns whether this was the first time we saw it, because the ledger entry
 * must be written once and only once no matter how many times a webhook
 * redelivers the same event.
 */
export async function ingestTransaction(
  deps: TransactionDeps,
  input: {
    partnerId: string;
    traderId: string;
    cardId: string | null;
    transaction: NormalizedTransaction;
  },
): Promise<{ created: boolean; statusChanged: boolean; id: string }> {
  const { transaction } = input;

  const existing = await deps.db.cardTransaction.findFirst({
    where: { provider: "RAIN", providerTransactionId: transaction.id },
  });

  if (existing) {
    const statusChanged = existing.status !== transaction.status;
    if (!statusChanged && existing.amountMinor === transaction.amountMinor) {
      return { created: false, statusChanged: false, id: existing.id };
    }

    await deps.db.cardTransaction.update({
      where: { id: existing.id },
      data: {
        status: transaction.status,
        amountMinor: transaction.amountMinor,
        postedAt: transaction.postedAt,
        declineReason: transaction.declineReason,
      },
    });

    if (statusChanged) {
      await applyLedgerForStatus(deps, {
        partnerId: input.partnerId,
        traderId: input.traderId,
        transactionId: existing.id,
        kind: transaction.kind,
        status: transaction.status,
        amountMinor: transaction.amountMinor,
        asset: transaction.asset,
        merchantName: transaction.merchantName,
      });
    }

    return { created: false, statusChanged, id: existing.id };
  }

  const created = await deps.db.cardTransaction.create({
    data: {
      partnerId: input.partnerId,
      traderId: input.traderId,
      cardId: input.cardId,
      provider: "RAIN",
      providerTransactionId: transaction.id,
      providerParentId: transaction.parentId,
      kind: transaction.kind,
      status: transaction.status,
      amountMinor: transaction.amountMinor,
      asset: transaction.asset,
      originalAmountMinor: transaction.originalAmountMinor,
      originalAsset: transaction.originalAsset,
      merchantName: transaction.merchantName,
      merchantCategory: transaction.merchantCategory,
      merchantCountry: transaction.merchantCountry,
      merchantId: transaction.merchantId,
      declineReason: transaction.declineReason,
      occurredAt: transaction.occurredAt,
      postedAt: transaction.postedAt,
    },
  });

  await applyLedgerForStatus(deps, {
    partnerId: input.partnerId,
    traderId: input.traderId,
    transactionId: created.id,
    kind: transaction.kind,
    status: transaction.status,
    amountMinor: transaction.amountMinor,
    asset: transaction.asset,
    merchantName: transaction.merchantName,
  });

  return { created: true, statusChanged: true, id: created.id };
}

/**
 * Post the ledger entry that matches a transaction's current state. Declines
 * post nothing — no money moved — which is why this is a switch rather than a
 * single generic entry.
 */
async function applyLedgerForStatus(
  deps: TransactionDeps,
  input: {
    partnerId: string;
    traderId: string;
    transactionId: string;
    kind: TransactionKind;
    status: TransactionStatus;
    amountMinor: bigint;
    asset: string;
    merchantName: string | null;
  },
): Promise<void> {
  const context = {
    partnerId: input.partnerId,
    traderId: input.traderId,
    transactionId: input.transactionId,
    amountMinor: input.amountMinor,
    asset: input.asset,
    merchantName: input.merchantName,
  };

  await deps.db.$transaction(async (tx) => {
    if (input.kind === "REFUND") {
      if (input.status === "CLEARED" || input.status === "APPROVED") {
        await recordCardRefund(tx, context);
        await queuePartnerWebhook(tx, {
          partnerId: input.partnerId,
          eventType: "transaction.cleared",
          payload: { transactionId: input.transactionId, kind: "REFUND" },
        });
      }
      return;
    }

    if (input.kind === "REVERSAL") {
      if (input.status === "REVERSED" || input.status === "CLEARED") {
        await recordCardRefund(tx, context);
        await queuePartnerWebhook(tx, {
          partnerId: input.partnerId,
          eventType: "transaction.reversed",
          payload: { transactionId: input.transactionId },
        });
      }
      return;
    }

    if (input.status === "PENDING" || input.status === "APPROVED") {
      await recordCardAuthorization(tx, context);
      await queuePartnerWebhook(tx, {
        partnerId: input.partnerId,
        eventType: "transaction.pending",
        payload: { transactionId: input.transactionId },
      });
      return;
    }

    if (input.status === "CLEARED") {
      await recordCardCleared(tx, context);
      await queuePartnerWebhook(tx, {
        partnerId: input.partnerId,
        eventType: "transaction.cleared",
        payload: { transactionId: input.transactionId },
      });
    }
    // DECLINED and FAILED move no money and post nothing.
  });
}

/**
 * Pull the current provider balance and store a snapshot.
 *
 * Rain is the source of truth for balances. The internal ledger is reconciled
 * against these snapshots; it never replaces them.
 */
export async function syncBalances(
  deps: TransactionDeps,
  input: { partnerId: string; traderId: string },
): Promise<number> {
  /**
   * In mock mode there is no provider custodying funds, so its "balance" is
   * fiction — and writing it would overwrite the balance the payout engine
   * derived from the ledger with a newer, emptier snapshot. The trader would
   * see a completed payout and a zero balance.
   *
   * With a real provider this runs normally: the provider is the source of
   * truth for balances and its snapshots supersede anything internal.
   */
  if (deps.rain.mode === "mock") return 0;

  const accounts = await deps.db.financialAccount.findMany({
    where: { partnerId: input.partnerId, traderId: input.traderId, provider: "RAIN" },
  });

  let written = 0;
  for (const account of accounts) {
    const balances = await deps.rain.getBalances(account.providerAccountId);
    for (const balance of balances) {
      await deps.db.balanceSnapshot.create({
        data: {
          financialAccountId: account.id,
          partnerId: input.partnerId,
          traderId: input.traderId,
          asset: balance.asset,
          network: balance.network,
          availableMinor: balance.availableMinor,
          pendingMinor: balance.pendingMinor,
          reservedMinor: balance.reservedMinor,
          source: balance.source,
          asOf: balance.asOf,
        },
      });
      written += 1;
    }
  }
  return written;
}

/** Latest snapshot per account for a trader. */
export async function latestBalances(db: Database, partnerId: string, traderId: string) {
  const accounts = await db.financialAccount.findMany({
    where: { partnerId, traderId },
    select: { id: true },
  });

  const snapshots = [];
  for (const account of accounts) {
    const latest = await db.balanceSnapshot.findFirst({
      where: { financialAccountId: account.id },
      orderBy: { asOf: "desc" },
    });
    if (latest) snapshots.push(latest);
  }
  return snapshots;
}
