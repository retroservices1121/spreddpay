import type { FastifyInstance } from "fastify";
import { SESSION_COOKIE, SESSION_TTL_SECONDS } from "@spreddpay/config";
import { AppError, loginRequest } from "@spreddpay/contracts";
import { issueSession, revokeSession, verifyPassword } from "@spreddpay/auth";
import { recordAudit } from "@spreddpay/db";
import type { AppContext } from "../context";
import { clientContext, requireAuth } from "../plugins/auth";
import { toSessionUserDto } from "../mappers";

/**
 * Session login for all three portals.
 *
 * One endpoint resolves partner users, platform operators and traders, and it
 * returns the same generic message whichever lookup failed — a login form that
 * distinguishes "no such user" from "wrong password" is an account enumeration
 * oracle.
 */
export async function registerAuthRoutes(app: FastifyInstance, context: AppContext): Promise<void> {
  const cookieOptions = {
    httpOnly: true,
    // Defaults to lax. Set SESSION_COOKIE_SAMESITE=none when the portals and
    // the API are on different registrable domains — Railway's generated
    // *.up.railway.app hostnames are, and a Lax cookie would never be sent.
    sameSite: context.env.SESSION_COOKIE_SAMESITE,
    secure: context.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };

  app.post("/auth/login", async (request, reply) => {
    const body = loginRequest.parse(request.body);
    const email = body.email.toLowerCase();
    const client = clientContext(request);

    const [partnerUser, platformUser, trader] = await Promise.all([
      context.db.partnerUser.findFirst({ where: { email } }),
      context.db.platformUser.findUnique({ where: { email } }),
      context.db.trader.findFirst({ where: { email } }),
    ]);

    const candidate = partnerUser ?? platformUser ?? trader;
    const ok = candidate ? await verifyPassword(body.password, candidate.passwordHash) : false;

    if (!candidate || !ok) {
      request.log.warn({ email }, "failed login");
      throw AppError.unauthenticated("Incorrect email or password.");
    }

    if ("status" in candidate && candidate.status !== "ACTIVE" && !("externalTraderId" in candidate)) {
      throw AppError.forbidden("This account is not active.");
    }

    const session = await issueSession(
      context.db,
      partnerUser
        ? { partnerUserId: partnerUser.id }
        : platformUser
          ? { platformUserId: platformUser.id }
          : { traderId: trader!.id },
      client,
    );

    if (partnerUser) {
      await context.db.partnerUser.update({
        where: { id: partnerUser.id },
        data: { lastLoginAt: new Date() },
      });
    } else if (platformUser) {
      await context.db.platformUser.update({
        where: { id: platformUser.id },
        data: { lastLoginAt: new Date() },
      });
    }

    await context.db.$transaction(async (tx) => {
      await recordAudit(tx, {
        partnerId: partnerUser?.partnerId ?? trader?.partnerId ?? null,
        actor: {
          type: partnerUser ? "PARTNER_USER" : platformUser ? "PLATFORM_USER" : "TRADER",
          id: candidate.id,
          label: `${candidate.firstName} ${candidate.lastName}`,
          ipAddress: client.ipAddress,
          userAgent: client.userAgent,
        },
        action: "auth.login",
        entityType: "Session",
        entityId: session.sessionId,
        summary: `${email} signed in`,
      });
    });

    reply.setCookie(SESSION_COOKIE, session.token, cookieOptions);
    return { ok: true };
  });

  app.post("/auth/logout", async (request, reply) => {
    if (request.principal) {
      await revokeSession(context.db, request.principal.sessionId);
    }
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return { ok: true };
  });

  app.get("/auth/session", async (request) => {
    const principal = requireAuth(request);

    // The trader portal needs branding to render, so ship it with the session.
    const branding = principal.partnerId
      ? await context.db.partnerBranding.findUnique({ where: { partnerId: principal.partnerId } })
      : null;

    return {
      user: toSessionUserDto(principal),
      branding: branding
        ? {
            partnerId: branding.partnerId,
            productName: branding.productName,
            logoUrl: branding.logoUrl,
            iconUrl: branding.iconUrl,
            primaryColor: branding.primaryColor,
            secondaryColor: branding.secondaryColor,
            cardBackground: branding.cardBackground,
            cardLabel: branding.cardLabel,
            poweredBySpreddPay: branding.poweredBySpreddPay,
          }
        : null,
    };
  });
}
