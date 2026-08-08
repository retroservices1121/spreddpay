/**
 * Partner dashboard metrics, per TECHNICAL_README section 15.
 *
 * Every aggregate is computed with bigint sums over minor units. The activation
 * rate is returned in basis points rather than a float for the same reason —
 * percentages that round are percentages that disagree between two screens.
 */

import { formatMoney, type PartnerDashboardDto, type MoneyDto } from "@spreddpay/contracts";
import type { Database } from "@spreddpay/db";

export function toMoneyDto(amountMinor: bigint, asset: string): MoneyDto {
  return {
    amountMinor: amountMinor.toString(),
    asset,
    display: formatMoney(amountMinor, asset),
  };
}

function startOfMonth(reference: Date): Date {
  return new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), 1));
}

export interface DashboardOptions {
  /** Injected so tests and the demo can pin the reporting month. */
  now?: Date;
}

export async function partnerDashboard(
  db: Database,
  partnerId: string,
  options: DashboardOptions = {},
): Promise<PartnerDashboardDto> {
  const now = options.now ?? new Date();
  const monthStart = startOfMonth(now);

  const partner = await db.partner.findUnique({
    where: { id: partnerId },
    select: { defaultAsset: true },
  });
  const asset = partner?.defaultAsset ?? "USDC";

  const [
    activeTraders,
    pendingKyc,
    invitedTotal,
    activatedTotal,
    activeCards,
    pendingPayouts,
    completedPayouts,
    failedPayouts,
    monthlyPayouts,
    monthlyTransactions,
    openOperations,
  ] = await Promise.all([
    db.trader.count({
      where: {
        partnerId,
        status: {
          in: ["PROVIDER_ACCOUNT_ACTIVE", "CARD_ELIGIBLE", "VIRTUAL_CARD_PENDING", "VIRTUAL_CARD_ACTIVE"],
        },
      },
    }),
    db.trader.count({
      where: { partnerId, status: { in: ["KYC_PENDING", "KYC_REVIEW", "TERMS_PENDING"] } },
    }),
    db.trader.count({ where: { partnerId } }),
    db.trader.count({ where: { partnerId, status: "VIRTUAL_CARD_ACTIVE" } }),
    db.card.count({ where: { partnerId, status: "ACTIVE" } }),
    db.payout.count({
      where: {
        partnerId,
        status: {
          in: [
            "PENDING_APPROVAL",
            "APPROVED",
            "FUNDING_PENDING",
            "SUBMITTED_TO_PROVIDER",
            "PROCESSING",
          ],
        },
      },
    }),
    db.payout.count({ where: { partnerId, status: "COMPLETED" } }),
    db.payout.count({ where: { partnerId, status: { in: ["FAILED", "REJECTED"] } } }),
    db.payout.findMany({
      where: { partnerId, status: "COMPLETED", completedAt: { gte: monthStart } },
      select: { amountMinor: true },
    }),
    db.cardTransaction.findMany({
      where: {
        partnerId,
        occurredAt: { gte: monthStart },
        kind: { in: ["AUTHORIZATION", "CAPTURE", "PAYMENT"] },
        status: { in: ["PENDING", "APPROVED", "CLEARED"] },
      },
      select: { amountMinor: true },
    }),
    db.manualOperation.count({
      where: { partnerId, status: { in: ["OPEN", "IN_PROGRESS", "BLOCKED"] } },
    }),
  ]);

  let monthlyPayoutVolume = 0n;
  for (const payout of monthlyPayouts) monthlyPayoutVolume += payout.amountMinor;

  let monthlyCardSpend = 0n;
  for (const transaction of monthlyTransactions) monthlyCardSpend += transaction.amountMinor;

  const averageSpendPerActiveCard =
    activeCards > 0 ? monthlyCardSpend / BigInt(activeCards) : 0n;

  const activationRateBps =
    invitedTotal > 0 ? Math.round((activatedTotal / invitedTotal) * 10_000) : 0;

  return {
    activeTraders,
    pendingKyc,
    activeCards,
    payouts: {
      pending: pendingPayouts,
      completed: completedPayouts,
      failed: failedPayouts,
    },
    monthlyPayoutVolume: toMoneyDto(monthlyPayoutVolume, asset),
    // Card spend settles in the card's billing currency, which is USD.
    monthlyCardSpend: toMoneyDto(monthlyCardSpend, "USD"),
    averageSpendPerActiveCard: toMoneyDto(averageSpendPerActiveCard, "USD"),
    activationRateBps,
    operationsRequiringAttention: openOperations,
  };
}

export interface PlatformOverview {
  partners: number;
  activePartners: number;
  traders: number;
  activeCards: number;
  payoutsAwaitingAttention: number;
  openManualOperations: number;
  unprocessedWebhookEvents: number;
}

export async function platformOverview(db: Database): Promise<PlatformOverview> {
  const [
    partners,
    activePartners,
    traders,
    activeCards,
    payoutsAwaitingAttention,
    openManualOperations,
    unprocessedWebhookEvents,
  ] = await Promise.all([
    db.partner.count(),
    db.partner.count({ where: { status: "ACTIVE" } }),
    db.trader.count(),
    db.card.count({ where: { status: "ACTIVE" } }),
    db.payout.count({ where: { status: { in: ["MANUAL_REVIEW", "FAILED"] } } }),
    db.manualOperation.count({ where: { status: { in: ["OPEN", "IN_PROGRESS", "BLOCKED"] } } }),
    db.webhookEvent.count({ where: { status: { in: ["RECEIVED", "FAILED"] } } }),
  ]);

  return {
    partners,
    activePartners,
    traders,
    activeCards,
    payoutsAwaitingAttention,
    openManualOperations,
    unprocessedWebhookEvents,
  };
}

/**
 * Rows for a CSV export. Kept here so the partner portal and the admin portal
 * cannot drift into producing different columns for the same report.
 */
export function toCsv(rows: readonly Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0] as Record<string, unknown>);

  const escape = (value: unknown): string => {
    if (value === null || value === undefined) return "";
    const text = value instanceof Date ? value.toISOString() : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => escape(row[header])).join(","));
  }
  return lines.join("\n");
}
