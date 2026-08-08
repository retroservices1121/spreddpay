/**
 * Break-glass: clear an operator's second factor from the command line.
 *
 *   pnpm mfa:reset ops@spreddpay.com
 *
 * The API already has an operator-to-operator reset, but that requires a second
 * operator to exist. With a single operator — which is where every deployment
 * starts — losing the authenticator means losing the admin portal entirely.
 * This is the only way back in, and it deliberately requires database access
 * rather than any credential the locked-out person still has.
 *
 * Clearing the factor also revokes that operator's live sessions, so a session
 * that had already passed MFA cannot outlive the reset.
 */

import { db, recordAudit } from "@spreddpay/db";

const email = process.argv[2];

if (!email) {
  console.error("Usage: pnpm mfa:reset <operator-email>");
  process.exit(1);
}

const user = await db.platformUser.findUnique({ where: { email: email.toLowerCase() } });

if (!user) {
  console.error(`No operator with email ${email}.`);
  await db.$disconnect();
  process.exit(1);
}

await db.$transaction(async (tx) => {
  await tx.platformUser.update({
    where: { id: user.id },
    data: { mfaEnabled: false, mfaSecret: null },
  });

  const revoked = await tx.session.updateMany({
    where: { platformUserId: user.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  // A break-glass action is exactly the sort of thing that must leave a trace.
  await recordAudit(tx, {
    actor: { type: "SYSTEM", label: "mfa:reset (command line)" },
    action: "auth.mfa_reset",
    entityType: "PlatformUser",
    entityId: user.id,
    summary: `Two-factor authentication reset for ${user.email} from the command line`,
    changes: { sessionsRevoked: revoked.count },
  });

  console.log(`\nTwo-factor authentication cleared for ${user.email}.`);
  console.log(`${revoked.count} live session(s) revoked.`);
  console.log("\nSign in again and the portal will walk through enrolment.\n");
});

await db.$disconnect();
