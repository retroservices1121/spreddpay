/**
 * Add a spread of demo traders and payouts.
 *
 *   pnpm demo:traders
 *
 * Everything goes through the real services — inviteTrader, advanceOnboarding,
 * createPayout, approvePayout, completePayout, rejectPayout — so each record
 * carries the ledger entries, audit events and balance snapshots it would have
 * in normal use. Writing rows directly would produce a demo whose books do not
 * reconcile, which is worse than no demo at all.
 *
 * The point is variety: dashboards with one trader and one payout tell you
 * nothing about whether the metrics, filters and empty states are right.
 * Traders are left at CARD_ELIGIBLE rather than issued cards, because card
 * issuance is deferred until the provider's card programme opens.
 *
 * Safe to re-run: traders already present are skipped by external id.
 */

import { loadServerEnv } from "@spreddpay/config";
import { db } from "@spreddpay/db";
import { createRainService } from "@spreddpay/rain";
import { buildPartnerPrincipal, type Principal } from "@spreddpay/auth";
import { formatMoney } from "@spreddpay/contracts";
import { advanceOnboarding, inviteTrader } from "../services/onboarding";
import { hydrateMockRain } from "../services/mock-hydration";
import {
  approvePayout,
  completePayout,
  createPayout,
  rejectPayout,
  submitPayout,
} from "../services/payouts";

const env = loadServerEnv();

if (env.RAIN_MODE !== "mock" || env.DAKOTA_MODE !== "mock") {
  console.error("\nRefusing to run: demo data must not be created against a live provider.\n");
  await db.$disconnect();
  process.exit(1);
}

const rain = createRainService({ mode: "mock", mock: { autoApproveKyc: true } });

// The mock holds its state in memory, so a fresh process knows nothing about
// customers and accounts written by an earlier run. Replay them from the
// database first, exactly as the API does at boot — otherwise a re-run fails
// with "no_provider_account" for traders that plainly have one.
await hydrateMockRain(db, rain);

const deps = { db, rain };

const partner = await db.partner.findFirst({ where: { slug: "demo-trading-firm" } });
if (!partner) {
  console.error("\nNo demo partner. Run `pnpm db:seed` first.\n");
  await db.$disconnect();
  process.exit(1);
}

async function principalFor(email: string): Promise<Principal> {
  const user = await db.partnerUser.findFirst({
    where: { partnerId: partner!.id, email },
    include: { roles: true },
  });
  if (!user) throw new Error(`Missing demo user ${email}`);
  return buildPartnerPrincipal({
    userId: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    partnerId: user.partnerId,
    roles: user.roles.map((r) => r.role),
    mfaEnabled: user.mfaEnabled,
    sessionId: "demo-traders-script",
  });
}

// Each action uses the actor that genuinely holds the permission for it —
// PAYOUT_CREATOR has no trader:invite, and the seed should not pretend
// otherwise. Using one all-powerful actor would hide exactly the kind of
// permission gap this matrix exists to surface.
const owner = { principal: await principalFor("owner@demotradingfirm.example"), ipAddress: null, userAgent: null };
const creator = { principal: await principalFor("creator@demotradingfirm.example"), ipAddress: null, userAgent: null };
const approver = { principal: await principalFor("approver@demotradingfirm.example"), ipAddress: null, userAgent: null };

/** Deliberately varied: countries, amounts, and how far each one gets. */
const TRADERS = [
  { ext: "TRADER-31002", first: "Marcus", last: "Webb", country: "GB",
    payouts: [{ ref: "PO-2026-0101", amount: "12500.00", outcome: "completed" },
              { ref: "PO-2026-0102", amount: "3200.50", outcome: "completed" }] },
  { ext: "TRADER-31003", first: "Yuki", last: "Tanaka", country: "SG",
    payouts: [{ ref: "PO-2026-0103", amount: "875.25", outcome: "completed" },
              { ref: "PO-2026-0104", amount: "9400.00", outcome: "pending" }] },
  { ext: "TRADER-31004", first: "Amara", last: "Okafor", country: "CA",
    payouts: [{ ref: "PO-2026-0105", amount: "45200.00", outcome: "completed" }] },
  { ext: "TRADER-31005", first: "Lukas", last: "Bergmann", country: "DE",
    payouts: [{ ref: "PO-2026-0106", amount: "2100.00", outcome: "rejected" },
              { ref: "PO-2026-0107", amount: "640.00", outcome: "completed" }] },
  // No payouts at all — an onboarded trader who has not been paid yet is a
  // real state the dashboards should handle.
  { ext: "TRADER-31006", first: "Sofia", last: "Marin", country: "AU", payouts: [] },
] as const;

console.log(`\nSeeding ${TRADERS.length} traders into ${partner.displayName}…\n`);

for (const spec of TRADERS) {
  const existing = await db.trader.findFirst({
    where: { partnerId: partner.id, externalTraderId: spec.ext },
  });

  let traderId: string;
  if (existing) {
    traderId = existing.id;
    console.log(`  ${spec.first} ${spec.last} — already present, reusing`);
  } else {
    const trader = await inviteTrader(deps, owner, {
      partnerId: partner.id,
      externalTraderId: spec.ext,
      email: `${spec.first.toLowerCase()}.${spec.last.toLowerCase()}@example.com`,
      firstName: spec.first,
      lastName: spec.last,
      countryCode: spec.country,
    });
    traderId = trader.id;
    console.log(`  ${spec.first} ${spec.last} (${spec.country}) invited`);
  }

  // Walk onboarding to the point a payout can be received. Each call is one
  // provider interaction, the same as the portal's "advance" button.
  for (let step = 0; step < 10; step += 1) {
    const trader = await db.trader.findUnique({ where: { id: traderId } });
    if (!trader || trader.status === "CARD_ELIGIBLE") break;
    await advanceOnboarding(deps, { traderId, acceptedTermsVersion: "2026-01-terms-v1" }, "SYSTEM");
  }

  for (const p of spec.payouts) {
    const already = await db.payout.findFirst({
      where: { partnerId: partner.id, externalReference: p.ref },
    });
    if (already) {
      console.log(`      ${p.ref} already exists`);
      continue;
    }

    const payout = await createPayout(deps, creator, {
      partnerId: partner.id,
      traderId,
      externalReference: p.ref,
      amount: p.amount,
      asset: "USDC",
      submitForApproval: true,
      idempotencyKey: `seed-${p.ref}`,
    });

    if (p.outcome === "completed") {
      // The full path, exactly as the portal drives it. The state machine
      // rejects APPROVED -> COMPLETED, and it is right to: a payout that never
      // went to the provider has not been delivered.
      await approvePayout(deps, approver, { partnerId: partner.id, payoutId: payout.id });
      await submitPayout(deps, approver, { partnerId: partner.id, payoutId: payout.id });
      await completePayout(deps, { payoutId: payout.id });
      console.log(`      ${p.ref} ${formatMoney(payout.amountMinor, "USDC").padStart(18)}  completed`);
    } else if (p.outcome === "rejected") {
      await rejectPayout(deps, approver, {
        partnerId: partner.id,
        payoutId: payout.id,
        reason: "Trader account under review",
      });
      console.log(`      ${p.ref} ${formatMoney(payout.amountMinor, "USDC").padStart(18)}  rejected`);
    } else {
      console.log(`      ${p.ref} ${formatMoney(payout.amountMinor, "USDC").padStart(18)}  awaiting approval`);
    }
  }
}

const [traders, payouts] = await Promise.all([
  db.trader.count({ where: { partnerId: partner.id } }),
  db.payout.count({ where: { partnerId: partner.id } }),
]);
console.log(`\n${traders} traders and ${payouts} payouts on ${partner.displayName}.\n`);

await db.$disconnect();
