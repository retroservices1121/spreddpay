/**
 * `pnpm demo:reset` — wipe the demo database and reseed it.
 *
 * This is the one sanctioned path around the append-only guard on financial,
 * webhook and audit tables, and it earns that by refusing to run anywhere it
 * could matter: production is blocked outright, and a database whose name does
 * not look like a development or demo database needs SPREDDPAY_CONFIRM_RESET=1.
 */

import { db } from "@spreddpay/db";
import { seedDemo } from "./demo";

function assertSafeToReset(): void {
  const url = process.env.DATABASE_URL ?? "";

  if (process.env.NODE_ENV === "production") {
    throw new Error("demo:reset refuses to run with NODE_ENV=production.");
  }

  const looksDisposable = /(localhost|127\.0\.0\.1|demo|dev|test|staging)/i.test(url);
  if (!looksDisposable && process.env.SPREDDPAY_CONFIRM_RESET !== "1") {
    throw new Error(
      [
        "DATABASE_URL does not look like a development or demo database, and this command",
        "deletes every row in the schema.",
        "",
        "If that is genuinely what you want, re-run with SPREDDPAY_CONFIRM_RESET=1.",
      ].join("\n"),
    );
  }
}

async function truncateAll(): Promise<number> {
  // Read the table list from the database rather than hardcoding it, so a new
  // model added to schema.prisma is never silently missed by the reset.
  const rows = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE '\\_prisma%'
  `;

  if (rows.length === 0) return 0;

  const list = rows.map((row) => `"public"."${row.tablename}"`).join(", ");
  await db.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  return rows.length;
}

async function main(): Promise<void> {
  assertSafeToReset();

  const truncated = await truncateAll();
  console.log(`\nTruncated ${truncated} tables.`);

  const result = await seedDemo(db);

  console.log("Demo data reseeded.\n");
  console.log(`  Partner     ${result.partnerId}`);
  console.log(`  Trader      ${result.traderId}  (Alex Morgan, TRADER-28491)`);
  console.log(`  Card        ${result.cardId}  (virtual, ACTIVE)`);
  console.log(`  Payout      ${result.payoutId}  (4,850 USDC, DRAFT)`);
  console.log(`  Transaction ${result.transactionId}  (Online Purchase, $84.23, PENDING)\n`);

  console.log("  Sign in with:");
  for (const login of result.logins) {
    console.log(`    ${login.portal.padEnd(8)} ${login.email.padEnd(36)} ${login.role}`);
  }
  console.log(`\n  Password for every demo account: ${result.logins[0]?.password}\n`);
}

main()
  .then(() => db.$disconnect())
  .catch(async (error) => {
    console.error("\ndemo:reset failed:", error instanceof Error ? error.message : error);
    await db.$disconnect();
    process.exit(1);
  });
