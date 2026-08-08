/**
 * The payout engine.
 *
 * A payout is an approved partner instruction to make funds available to a
 * trader through the configured Rain flow. Everything that can reject one is
 * checked here, in this order, before any state moves:
 *
 *   1. the trader belongs to this partner and can receive funds;
 *   2. the external reference has not been used by this partner before;
 *   3. the amount is within the program's per-payout bounds;
 *   4. the partner's rolling daily limit is not breached;
 *   5. dual approval is required above the configured threshold.
 *
 * State changes and their ledger entries and audit events always commit in one
 * database transaction. There is no code path where a payout advances without
 * its journal entry, or vice versa.
 */

import {
  AppError,
  assertPayoutTransition,
  formatMoney,
  parseAmountToMinor,
  traderCanReceivePayout,
  type PayoutStatus,
} from "@spreddpay/contracts";
import { recordAudit, type Database } from "@spreddpay/db";
import { assertNotSelfApproval, requirePermission, type Principal } from "@spreddpay/auth";
import {
  accountBalance,
  recordPayoutApproved,
  recordPayoutCompleted,
  recordPayoutFailed,
} from "@spreddpay/ledger";
import { queueNotification, queuePartnerWebhook, TEMPLATES } from "@spreddpay/notifications";
import type { RainService } from "@spreddpay/rain";

export interface PayoutServiceDeps {
  db: Database;
  rain: RainService;
}

export interface ActorContext {
  principal: Principal;
  ipAddress: string | null;
  userAgent: string | null;
}

function auditActor(actor: ActorContext) {
  return {
    type: actor.principal.kind,
    id: actor.principal.userId,
    label: `${actor.principal.firstName} ${actor.principal.lastName}`,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
  } as const;
}

async function loadProgram(db: Database, partnerId: string) {
  const program = await db.partnerProgram.findFirst({
    where: { partnerId, provider: "RAIN", active: true },
  });
  if (!program) {
    throw AppError.conflict(
      "This partner has no active provider program configuration. Configure limits before creating payouts.",
    );
  }
  return program;
}

/** Rolling 24-hour completed-and-in-flight volume for the partner. */
async function dailyVolumeMinor(db: Database, partnerId: string): Promise<bigint> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const payouts = await db.payout.findMany({
    where: {
      partnerId,
      createdAt: { gte: since },
      status: {
        in: [
          "PENDING_APPROVAL",
          "APPROVED",
          "FUNDING_PENDING",
          "SUBMITTED_TO_PROVIDER",
          "PROCESSING",
          "COMPLETED",
        ],
      },
    },
    select: { amountMinor: true },
  });

  let total = 0n;
  for (const payout of payouts) total += payout.amountMinor;
  return total;
}

export interface CreatePayoutInput {
  partnerId: string;
  traderId: string;
  externalReference: string;
  amount: string;
  asset: string;
  network?: string | undefined;
  memo?: string | undefined;
  submitForApproval: boolean;
  idempotencyKey: string;
}

export async function createPayout(
  deps: PayoutServiceDeps,
  actor: ActorContext,
  input: CreatePayoutInput,
) {
  requirePermission(actor.principal, "payout:create");

  const trader = await deps.db.trader.findFirst({
    where: { id: input.traderId, partnerId: input.partnerId },
  });
  if (!trader) {
    throw AppError.notFound("Trader not found for this partner.");
  }
  if (!traderCanReceivePayout(trader.status)) {
    throw new AppError(
      "TRADER_NOT_ELIGIBLE",
      `Trader is ${trader.status}; a payout requires an active provider account.`,
    );
  }

  const program = await loadProgram(deps.db, input.partnerId);
  const amountMinor = parseAmountToMinor(input.amount, input.asset);

  if (amountMinor <= 0n) {
    throw AppError.badRequest("Payout amount must be greater than zero.");
  }
  if (amountMinor < program.minPayoutMinor) {
    throw new AppError(
      "LIMIT_EXCEEDED",
      `Minimum payout is ${formatMoney(program.minPayoutMinor, input.asset)}.`,
    );
  }
  if (amountMinor > program.singlePayoutMaxMinor) {
    throw new AppError(
      "LIMIT_EXCEEDED",
      `Maximum single payout is ${formatMoney(program.singlePayoutMaxMinor, input.asset)}.`,
    );
  }

  const duplicate = await deps.db.payout.findFirst({
    where: { partnerId: input.partnerId, externalReference: input.externalReference },
    select: { id: true, status: true },
  });
  if (duplicate) {
    throw new AppError(
      "DUPLICATE_REFERENCE",
      `External reference "${input.externalReference}" already exists on payout ${duplicate.id}.`,
    );
  }

  const rolling = await dailyVolumeMinor(deps.db, input.partnerId);
  if (rolling + amountMinor > program.partnerDailyLimitMinor) {
    throw new AppError(
      "LIMIT_EXCEEDED",
      `This payout would exceed the partner's 24-hour limit of ${formatMoney(program.partnerDailyLimitMinor, input.asset)} (${formatMoney(rolling, input.asset)} already committed).`,
    );
  }

  // Rain must agree the destination can receive funds before we promise anything.
  if (trader.rainCustomerId) {
    const validation = await deps.rain.validatePayoutDestination(trader.rainCustomerId);
    if (!validation.valid) {
      throw new AppError(
        "TRADER_NOT_ELIGIBLE",
        `The provider rejected this destination: ${validation.reasons.join(", ")}.`,
      );
    }
  }

  const requiresDualApproval = amountMinor >= program.dualApprovalThresholdMinor;
  const status: PayoutStatus = input.submitForApproval ? "PENDING_APPROVAL" : "DRAFT";

  return deps.db.$transaction(async (tx) => {
    const payout = await tx.payout.create({
      data: {
        partnerId: input.partnerId,
        traderId: input.traderId,
        externalReference: input.externalReference,
        amountMinor,
        asset: input.asset,
        network: input.network ?? program.network,
        status,
        memo: input.memo ?? null,
        requiresDualApproval,
        initiatedByUserId: actor.principal.userId,
        idempotencyKey: input.idempotencyKey,
      },
      include: { trader: true, initiatedBy: true, approvedBy: true },
    });

    await recordAudit(tx, {
      partnerId: input.partnerId,
      actor: auditActor(actor),
      action: "payout.created",
      entityType: "Payout",
      entityId: payout.id,
      summary: `Created payout ${payout.externalReference} for ${formatMoney(amountMinor, input.asset)}`,
      changes: {
        amountMinor,
        asset: input.asset,
        status,
        requiresDualApproval,
        traderId: input.traderId,
      },
    });

    if (status === "PENDING_APPROVAL" && requiresDualApproval) {
      const template = TEMPLATES.payoutAwaitingApproval({
        reference: payout.externalReference,
        amount: formatMoney(amountMinor, input.asset),
        createdBy: `${actor.principal.firstName} ${actor.principal.lastName}`,
      });
      await queueNotification(tx, { partnerId: input.partnerId, ...template });
    }

    return payout;
  });
}

export async function approvePayout(
  deps: PayoutServiceDeps,
  actor: ActorContext,
  input: { partnerId: string; payoutId: string; note?: string | undefined },
) {
  requirePermission(actor.principal, "payout:approve");

  const payout = await deps.db.payout.findFirst({
    where: { id: input.payoutId, partnerId: input.partnerId },
  });
  if (!payout) throw AppError.notFound("Payout not found.");

  assertNotSelfApproval({
    principal: actor.principal,
    initiatedByUserId: payout.initiatedByUserId,
    requiresDualApproval: payout.requiresDualApproval,
  });

  assertPayoutTransition(payout.status, "APPROVED");

  return deps.db.$transaction(async (tx) => {
    const updated = await tx.payout.update({
      where: { id: payout.id },
      data: {
        status: "APPROVED",
        approvedByUserId: actor.principal.userId,
        approvedAt: new Date(),
      },
      include: { trader: true, initiatedBy: true, approvedBy: true },
    });

    await tx.payoutApproval.create({
      data: {
        payoutId: payout.id,
        partnerId: input.partnerId,
        partnerUserId: actor.principal.userId,
        decision: "APPROVED",
        note: input.note ?? null,
      },
    });

    await recordPayoutApproved(tx, {
      partnerId: payout.partnerId,
      payoutId: payout.id,
      traderId: payout.traderId,
      amountMinor: payout.amountMinor,
      asset: payout.asset,
      externalReference: payout.externalReference,
    });

    await recordAudit(tx, {
      partnerId: input.partnerId,
      actor: auditActor(actor),
      action: "payout.approved",
      entityType: "Payout",
      entityId: payout.id,
      summary: `Approved payout ${payout.externalReference}`,
      changes: { status: { from: payout.status, to: "APPROVED" } },
    });

    await queuePartnerWebhook(tx, {
      partnerId: input.partnerId,
      eventType: "payout.approved",
      payload: { payoutId: payout.id, externalReference: payout.externalReference },
    });

    return updated;
  });
}

export async function rejectPayout(
  deps: PayoutServiceDeps,
  actor: ActorContext,
  input: { partnerId: string; payoutId: string; reason: string },
) {
  requirePermission(actor.principal, "payout:approve");

  const payout = await deps.db.payout.findFirst({
    where: { id: input.payoutId, partnerId: input.partnerId },
  });
  if (!payout) throw AppError.notFound("Payout not found.");

  assertPayoutTransition(payout.status, "REJECTED");

  return deps.db.$transaction(async (tx) => {
    const updated = await tx.payout.update({
      where: { id: payout.id },
      data: { status: "REJECTED", failureCode: "rejected", failureMessage: input.reason },
      include: { trader: true, initiatedBy: true, approvedBy: true },
    });

    await tx.payoutApproval.create({
      data: {
        payoutId: payout.id,
        partnerId: input.partnerId,
        partnerUserId: actor.principal.userId,
        decision: "REJECTED",
        note: input.reason,
      },
    });

    await recordAudit(tx, {
      partnerId: input.partnerId,
      actor: auditActor(actor),
      action: "payout.rejected",
      entityType: "Payout",
      entityId: payout.id,
      summary: `Rejected payout ${payout.externalReference}: ${input.reason}`,
      changes: { status: { from: payout.status, to: "REJECTED" } },
    });

    return updated;
  });
}

export async function cancelPayout(
  deps: PayoutServiceDeps,
  actor: ActorContext,
  input: { partnerId: string; payoutId: string; reason: string },
) {
  requirePermission(actor.principal, "payout:cancel");

  const payout = await deps.db.payout.findFirst({
    where: { id: input.payoutId, partnerId: input.partnerId },
  });
  if (!payout) throw AppError.notFound("Payout not found.");

  assertPayoutTransition(payout.status, "CANCELLED");

  return deps.db.$transaction(async (tx) => {
    const updated = await tx.payout.update({
      where: { id: payout.id },
      data: { status: "CANCELLED", failureCode: "cancelled", failureMessage: input.reason },
      include: { trader: true, initiatedBy: true, approvedBy: true },
    });

    // An approved payout has a reservation on the books; unwind it.
    if (payout.status === "APPROVED" || payout.status === "FUNDING_PENDING") {
      await recordPayoutFailed(
        tx,
        {
          partnerId: payout.partnerId,
          payoutId: payout.id,
          traderId: payout.traderId,
          amountMinor: payout.amountMinor,
          asset: payout.asset,
          externalReference: payout.externalReference,
        },
        `cancelled: ${input.reason}`,
      );
    }

    await recordAudit(tx, {
      partnerId: input.partnerId,
      actor: auditActor(actor),
      action: "payout.cancelled",
      entityType: "Payout",
      entityId: payout.id,
      summary: `Cancelled payout ${payout.externalReference}: ${input.reason}`,
      changes: { status: { from: payout.status, to: "CANCELLED" } },
    });

    return updated;
  });
}

/**
 * Hand an approved payout to the provider.
 *
 * TECHNICAL_README section 13 is explicit that the movement architecture is not
 * to be assumed. In `mock` mode this runs the demo flow end to end. In
 * `sandbox` it will call whatever Rain's documentation defines once
 * docs/rain-flow-of-funds.md is approved — the adapter throws until then, and
 * the payout lands in MANUAL_REVIEW with an operations task rather than
 * pretending to have moved money.
 */
export async function submitPayout(
  deps: PayoutServiceDeps,
  actor: ActorContext,
  input: { partnerId: string; payoutId: string },
) {
  const payout = await deps.db.payout.findFirst({
    where: { id: input.payoutId, partnerId: input.partnerId },
    include: { trader: true },
  });
  if (!payout) throw AppError.notFound("Payout not found.");

  assertPayoutTransition(payout.status, "SUBMITTED_TO_PROVIDER");

  const account = await deps.db.financialAccount.findFirst({
    where: { partnerId: input.partnerId, traderId: payout.traderId, provider: "RAIN" },
  });
  if (!account || !payout.trader.rainCustomerId) {
    throw new AppError(
      "TRADER_NOT_ELIGIBLE",
      "The trader has no provider account to receive this payout.",
    );
  }

  try {
    const providerPayout = await deps.rain.createPayout({
      reference: payout.id,
      customerId: payout.trader.rainCustomerId,
      accountId: account.providerAccountId,
      amountMinor: payout.amountMinor,
      asset: payout.asset,
      network: payout.network,
      idempotencyKey: payout.idempotencyKey ?? payout.id,
    });

    return await deps.db.$transaction(async (tx) => {
      const updated = await tx.payout.update({
        where: { id: payout.id },
        data: {
          status: "SUBMITTED_TO_PROVIDER",
          rainTransferId: providerPayout.id,
          blockchainTxHash: providerPayout.txHash,
          submittedAt: new Date(),
        },
        include: { trader: true, initiatedBy: true, approvedBy: true },
      });

      await tx.providerTransfer.create({
        data: {
          partnerId: payout.partnerId,
          payoutId: payout.id,
          provider: "RAIN",
          providerTransferId: providerPayout.id,
          status: providerPayout.status,
          amountMinor: payout.amountMinor,
          asset: payout.asset,
          network: payout.network,
          txHash: providerPayout.txHash,
          feeMinor: providerPayout.feeMinor,
        },
      });

      await recordAudit(tx, {
        partnerId: payout.partnerId,
        actor: auditActor(actor),
        action: "payout.submitted",
        entityType: "Payout",
        entityId: payout.id,
        summary: `Submitted payout ${payout.externalReference} to the provider`,
        changes: { rainTransferId: providerPayout.id },
      });

      await queuePartnerWebhook(tx, {
        partnerId: payout.partnerId,
        eventType: "payout.processing",
        payload: { payoutId: payout.id, externalReference: payout.externalReference },
      });

      return updated;
    });
  } catch (error) {
    // The provider path is not available or failed. Park the payout for an
    // operator rather than leaving it in a state that implies money moved.
    const message = error instanceof Error ? error.message : "Unknown provider error";

    await deps.db.$transaction(async (tx) => {
      await tx.payout.update({
        where: { id: payout.id },
        data: {
          status: "MANUAL_REVIEW",
          operationMode: "MANUAL_REQUIRED",
          failureCode: "provider_submit_failed",
          failureMessage: message,
        },
      });

      await tx.manualOperation.create({
        data: {
          partnerId: payout.partnerId,
          payoutId: payout.id,
          kind: "PAYOUT_SUBMISSION",
          status: "OPEN",
          summary: `Payout ${payout.externalReference} could not be submitted automatically`,
          detail: message,
        },
      });

      await recordAudit(tx, {
        partnerId: payout.partnerId,
        actor: auditActor(actor),
        action: "payout.manual_review",
        entityType: "Payout",
        entityId: payout.id,
        summary: `Payout ${payout.externalReference} moved to manual review: ${message}`,
      });
    });

    throw error;
  }
}

/**
 * Settle a payout. Called by the webhook processor when Rain reports the
 * transfer is done, and by the demo flow.
 */
export async function completePayout(
  deps: PayoutServiceDeps,
  input: { payoutId: string; txHash?: string | null },
) {
  const payout = await deps.db.payout.findUnique({
    where: { id: input.payoutId },
    include: { trader: true, partner: { include: { branding: true } } },
  });
  if (!payout) throw AppError.notFound("Payout not found.");

  if (payout.status === "COMPLETED") return payout;
  assertPayoutTransition(payout.status, "COMPLETED");

  return deps.db.$transaction(async (tx) => {
    const updated = await tx.payout.update({
      where: { id: payout.id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        blockchainTxHash: input.txHash ?? payout.blockchainTxHash,
      },
      include: { trader: true, initiatedBy: true, approvedBy: true },
    });

    await recordPayoutCompleted(tx, {
      partnerId: payout.partnerId,
      payoutId: payout.id,
      traderId: payout.traderId,
      amountMinor: payout.amountMinor,
      asset: payout.asset,
      externalReference: payout.externalReference,
    });

    /**
     * Write the trader's new balance.
     *
     * Balances are normally a snapshot of what the provider reports. In mock
     * mode there is no provider holding funds, so without this the ledger would
     * show the payout delivered while the trader's balance stayed at zero —
     * which is exactly what a completed payout must not look like.
     *
     * The figure comes from the internal ledger's USER_AVAILABLE_REPORTING, and
     * is recorded with source INTERNAL so it is never mistaken for a provider
     * balance. Once a real provider is settling transfers, its own snapshots
     * supersede this.
     */
    const account = await tx.financialAccount.findFirst({
      where: { partnerId: payout.partnerId, traderId: payout.traderId },
      select: { id: true, network: true },
    });

    if (account) {
      const available = await accountBalance(
        tx,
        payout.partnerId,
        "USER_AVAILABLE_REPORTING",
        payout.asset,
      );

      await tx.balanceSnapshot.create({
        data: {
          financialAccountId: account.id,
          partnerId: payout.partnerId,
          traderId: payout.traderId,
          asset: payout.asset,
          network: account.network,
          availableMinor: available,
          pendingMinor: 0n,
          reservedMinor: 0n,
          source: "INTERNAL",
          asOf: new Date(),
        },
      });
    }

    await recordAudit(tx, {
      partnerId: payout.partnerId,
      actor: { type: "SYSTEM", label: "payout-engine" },
      action: "payout.completed",
      entityType: "Payout",
      entityId: payout.id,
      summary: `Payout ${payout.externalReference} completed`,
      changes: { status: { from: payout.status, to: "COMPLETED" } },
    });

    const template = TEMPLATES.payoutCompleted({
      productName: payout.partner.branding?.productName ?? payout.partner.displayName,
      amount: formatMoney(payout.amountMinor, payout.asset),
    });
    await queueNotification(tx, {
      partnerId: payout.partnerId,
      traderId: payout.traderId,
      channel: "EMAIL",
      ...template,
    });

    await queuePartnerWebhook(tx, {
      partnerId: payout.partnerId,
      eventType: "payout.completed",
      payload: {
        payoutId: payout.id,
        externalReference: payout.externalReference,
        amountMinor: payout.amountMinor.toString(),
        asset: payout.asset,
      },
    });

    return updated;
  });
}

export async function failPayout(
  deps: PayoutServiceDeps,
  input: { payoutId: string; code: string; message: string },
) {
  const payout = await deps.db.payout.findUnique({ where: { id: input.payoutId } });
  if (!payout) throw AppError.notFound("Payout not found.");

  assertPayoutTransition(payout.status, "FAILED");

  return deps.db.$transaction(async (tx) => {
    const updated = await tx.payout.update({
      where: { id: payout.id },
      data: { status: "FAILED", failureCode: input.code, failureMessage: input.message },
      include: { trader: true, initiatedBy: true, approvedBy: true },
    });

    // Only an approved payout has a reservation to unwind.
    if (
      payout.status === "APPROVED" ||
      payout.status === "FUNDING_PENDING" ||
      payout.status === "SUBMITTED_TO_PROVIDER" ||
      payout.status === "PROCESSING"
    ) {
      await recordPayoutFailed(
        tx,
        {
          partnerId: payout.partnerId,
          payoutId: payout.id,
          traderId: payout.traderId,
          amountMinor: payout.amountMinor,
          asset: payout.asset,
          externalReference: payout.externalReference,
        },
        input.message,
      );
    }

    await recordAudit(tx, {
      partnerId: payout.partnerId,
      actor: { type: "SYSTEM", label: "payout-engine" },
      action: "payout.failed",
      entityType: "Payout",
      entityId: payout.id,
      summary: `Payout ${payout.externalReference} failed: ${input.message}`,
    });

    const template = TEMPLATES.payoutFailed({
      reference: payout.externalReference,
      reason: input.message,
    });
    await queueNotification(tx, { partnerId: payout.partnerId, ...template });

    await queuePartnerWebhook(tx, {
      partnerId: payout.partnerId,
      eventType: "payout.failed",
      payload: {
        payoutId: payout.id,
        externalReference: payout.externalReference,
        failureCode: input.code,
      },
    });

    return updated;
  });
}
