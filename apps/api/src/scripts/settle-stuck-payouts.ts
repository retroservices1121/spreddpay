/**
 * Settle payouts left stranded before approval settled them inline.
 *
 *   pnpm payouts:settle-stuck
 *
 * `completePayout` had no caller for a while, so payouts approved in that
 * window reached SUBMITTED_TO_PROVIDER and stopped. They will never move on
 * their own: in mock mode there is no webhook coming.
 *
 * This runs the real completePayout, so each one gets its ledger entry, its
 * balance snapshot, its audit event and its partner webhook exactly as a
 * normally-settled payout would. It does not write status directly.
 *
 * It refuses to run unless both providers are mocks. Marking a payout delivered
 * when a real provider has not confirmed it is precisely the thing this
 * codebase is built to prevent, and a convenient script to do it is not
 * something that should exist.
 */

import { loadServerEnv } from "@spreddpay/config";
import { db } from "@spreddpay/db";
import { createRainService } from "@spreddpay/rain";
import { formatMoney } from "@spreddpay/contracts";
import { completePayout } from "../services/payouts";

const env = loadServerEnv();

if (env.RAIN_MODE !== "mock" || env.DAKOTA_MODE !== "mock") {
  console.error(
    "\nRefusing to run: a provider is not in mock mode.\n\n" +
      "Settlement must come from the provider, via its webhook. Marking payouts\n" +
      "delivered without that confirmation would assert money moved when it may\n" +
      "not have.\n",
  );
  await db.$disconnect();
  process.exit(1);
}

const deps = {
  db,
  rain: createRainService({
    mode: env.RAIN_MODE,
    baseUrl: env.RAIN_API_BASE_URL,
    apiKey: env.RAIN_API_KEY,
    programId: env.RAIN_PROGRAM_ID,
    webhookSecret: env.RAIN_WEBHOOK_SECRET,
  }),
};

// Anything past approval but short of a terminal state.
const stuck = await db.payout.findMany({
  where: { status: { in: ["SUBMITTED_TO_PROVIDER", "PROCESSING"] } },
  orderBy: { createdAt: "asc" },
});

if (stuck.length === 0) {
  console.log("\nNothing stuck. Every payout is in a terminal or pre-approval state.\n");
  await db.$disconnect();
  process.exit(0);
}

console.log(`\nSettling ${stuck.length} stranded payout(s):\n`);

let settled = 0;
for (const payout of stuck) {
  try {
    await completePayout(deps, { payoutId: payout.id });
    console.log(
      `  ok   ${payout.externalReference.padEnd(24)} ${formatMoney(payout.amountMinor, payout.asset)}`,
    );
    settled += 1;
  } catch (error) {
    console.log(
      `  FAIL ${payout.externalReference.padEnd(24)} ${error instanceof Error ? error.message : error}`,
    );
  }
}

console.log(`\n${settled}/${stuck.length} settled.\n`);
await db.$disconnect();
