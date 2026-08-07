import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError } from "@spreddpay/contracts";
import {
  decryptSecret,
  encryptSecret,
  generateTotpSecret,
  totpEnrollmentUri,
  verifyTotp,
} from "@spreddpay/auth";
import { recordAudit } from "@spreddpay/db";
import type { AppContext } from "../context";
import { clientContext, requireAuth } from "../plugins/auth";

const codeSchema = z.object({ code: z.string().min(6).max(9) });

/**
 * Two-factor authentication for SpreddPay operators.
 *
 * The threat this closes: admin.spreddpay.com is publicly reachable and reaches
 * every partner's data. A leaked or reused operator password should not be
 * sufficient on its own.
 *
 * The secret is stored encrypted with ENCRYPTION_KEY, so a database read alone
 * does not yield a working authenticator. Verification is recorded on the
 * *session*, not the user, so a stolen cookie from an unverified session is
 * useless and every new sign-in must present the factor again.
 */
export async function registerMfaRoutes(app: FastifyInstance, context: AppContext): Promise<void> {
  /** Where the caller is in the MFA flow. Drives the admin portal's UI. */
  app.get("/auth/mfa", async (request) => {
    const principal = requireAuth(request);
    return {
      required: principal.kind === "PLATFORM_USER",
      enrolled: principal.mfaEnabled,
      verified: principal.mfaVerified,
    };
  });

  /**
   * Begin enrolment. Returns the secret once — it is never readable again
   * through the API, only re-derivable by starting over.
   *
   * Re-enrolling while already enabled is refused: that would let anyone with a
   * live session silently swap the second factor for their own.
   */
  app.post("/auth/mfa/enroll", async (request) => {
    const principal = requireAuth(request);
    if (principal.kind !== "PLATFORM_USER") {
      throw AppError.forbidden("Two-factor authentication is only available to operators.");
    }
    if (principal.mfaEnabled) {
      throw AppError.conflict(
        "Two-factor authentication is already enabled. Ask another operator to reset it.",
      );
    }

    const secret = generateTotpSecret();
    await context.db.platformUser.update({
      where: { id: principal.userId },
      data: { mfaSecret: encryptSecret(secret, context.env.ENCRYPTION_KEY) },
    });

    return {
      secret,
      otpauthUri: totpEnrollmentUri({ secret, accountName: principal.email }),
    };
  });

  /** Confirm enrolment with a code from the app, then turn MFA on. */
  app.post("/auth/mfa/activate", async (request) => {
    const principal = requireAuth(request);
    if (principal.kind !== "PLATFORM_USER") {
      throw AppError.forbidden("Two-factor authentication is only available to operators.");
    }

    const { code } = codeSchema.parse(request.body);
    const user = await context.db.platformUser.findUnique({ where: { id: principal.userId } });
    if (!user?.mfaSecret) {
      throw AppError.conflict("Start enrolment before activating.");
    }

    const secret = decryptSecret(user.mfaSecret, context.env.ENCRYPTION_KEY);
    if (!verifyTotp(secret, code)) {
      throw AppError.unauthenticated("That code is not valid. Check your authenticator app.");
    }

    await context.db.$transaction(async (tx) => {
      await tx.platformUser.update({
        where: { id: principal.userId },
        data: { mfaEnabled: true },
      });
      // Activating proves possession, so this session is verified too.
      await tx.session.update({
        where: { id: principal.sessionId },
        data: { mfaVerifiedAt: new Date() },
      });
      await recordAudit(tx, {
        actor: {
          type: "PLATFORM_USER",
          id: principal.userId,
          label: `${principal.firstName} ${principal.lastName}`,
          ...clientContext(request),
        },
        action: "auth.mfa_enabled",
        entityType: "PlatformUser",
        entityId: principal.userId,
        summary: `${principal.email} enabled two-factor authentication`,
      });
    });

    return { ok: true, enrolled: true, verified: true };
  });

  /** Present the second factor on an already-enrolled session. */
  app.post("/auth/mfa/verify", async (request) => {
    const principal = requireAuth(request);
    const { code } = codeSchema.parse(request.body);

    if (principal.kind !== "PLATFORM_USER") {
      throw AppError.forbidden("Two-factor authentication is only available to operators.");
    }
    if (!principal.mfaEnabled) {
      throw AppError.conflict("Two-factor authentication is not set up for this account.");
    }

    const user = await context.db.platformUser.findUnique({ where: { id: principal.userId } });
    if (!user?.mfaSecret) {
      throw AppError.conflict("No second factor is registered for this account.");
    }

    const secret = decryptSecret(user.mfaSecret, context.env.ENCRYPTION_KEY);
    if (!verifyTotp(secret, code)) {
      request.log.warn({ userId: principal.userId }, "failed MFA verification");
      // Deliberately not rate-limited separately here: the global limiter and
      // the 30-second TOTP window already make brute force impractical, and a
      // per-account lockout would be a denial-of-service against operators.
      throw AppError.unauthenticated("That code is not valid.");
    }

    await context.db.session.update({
      where: { id: principal.sessionId },
      data: { mfaVerifiedAt: new Date() },
    });

    return { ok: true, verified: true };
  });

  /**
   * Reset another operator's second factor.
   *
   * Requires platform:user:manage, and cannot be used on yourself — resetting
   * your own factor from a session you already hold would defeat the control.
   */
  app.post<{ Params: { userId: string } }>(
    "/auth/mfa/reset/:userId",
    async (request) => {
      const principal = requireAuth(request);
      if (principal.kind !== "PLATFORM_USER") {
        throw AppError.forbidden("Operators only.");
      }
      if (!principal.permissions.has("platform:user:manage")) {
        throw AppError.forbidden('This action requires the "platform:user:manage" permission.');
      }
      if (request.params.userId === principal.userId) {
        throw AppError.forbidden(
          "You cannot reset your own second factor. Ask another operator to do it.",
        );
      }

      const target = await context.db.platformUser.findUnique({
        where: { id: request.params.userId },
      });
      if (!target) throw AppError.notFound("Operator not found.");

      await context.db.$transaction(async (tx) => {
        await tx.platformUser.update({
          where: { id: target.id },
          data: { mfaEnabled: false, mfaSecret: null },
        });
        // Their live sessions lose their verified status along with it.
        await tx.session.updateMany({
          where: { platformUserId: target.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await recordAudit(tx, {
          actor: {
            type: "PLATFORM_USER",
            id: principal.userId,
            label: `${principal.firstName} ${principal.lastName}`,
            ...clientContext(request),
          },
          action: "auth.mfa_reset",
          entityType: "PlatformUser",
          entityId: target.id,
          summary: `${principal.email} reset two-factor authentication for ${target.email}`,
        });
      });

      return { ok: true };
    },
  );
}
