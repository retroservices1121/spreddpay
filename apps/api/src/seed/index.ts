import { db } from "@spreddpay/db";
import { seedDemo } from "./demo";

async function main(): Promise<void> {
  const result = await seedDemo(db);

  console.log("\nSpreddPay demo data seeded.\n");
  console.log(`  Partner     ${result.partnerId}`);
  console.log(`  Trader      ${result.traderId}`);
  console.log(`  Card        ${result.cardId}`);
  console.log(`  Payout      ${result.payoutId}  (4,850 USDC, DRAFT)`);
  console.log(`  Transaction ${result.transactionId}  ($84.23, PENDING)\n`);

  console.log("  Sign in with:");
  for (const login of result.logins) {
    console.log(`    ${login.portal.padEnd(8)} ${login.email.padEnd(36)} ${login.role}`);
  }
  console.log(`\n  Password for every demo account: ${result.logins[0]?.password}\n`);
}

main()
  .then(() => db.$disconnect())
  .catch(async (error) => {
    console.error("Seed failed:", error);
    await db.$disconnect();
    process.exit(1);
  });
