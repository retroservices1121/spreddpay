/**
 * Session issue / load / revoke.
 *
 * The cookie holds an opaque random token; the database holds only its SHA-256.
 * Loading a session resolves the principal's roles in the same round trip so a
 * request never has to ask "what can this user do?" twice.
 */

import { SESSION_TTL_SECONDS } from "@spreddpay/config";
import type { Database } from "@spreddpay/db";
import { generateToken, hashToken } from "./crypto";
import {
  buildPartnerPrincipal,
  buildPlatformPrincipal,
  buildTraderPrincipal,
  type Principal,
} from "./principal";

export interface IssuedSession {
  /** Raw token — set as a cookie and never stored. */
  token: string;
  sessionId: string;
  expiresAt: Date;
}

export interface SessionSubject {
  partnerUserId?: string;
  platformUserId?: string;
  traderId?: string;
}

export async function issueSession(
  db: Database,
  subject: SessionSubject,
  context: { ipAddress?: string | null; userAgent?: string | null } = {},
  ttlSeconds: number = SESSION_TTL_SECONDS,
): Promise<IssuedSession> {
  const token = generateToken(32);
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

  const session = await db.session.create({
    data: {
      tokenHash: hashToken(token),
      partnerUserId: subject.partnerUserId ?? null,
      platformUserId: subject.platformUserId ?? null,
      traderId: subject.traderId ?? null,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
      expiresAt,
    },
    select: { id: true },
  });

  return { token, sessionId: session.id, expiresAt };
}

export async function loadPrincipal(db: Database, token: string): Promise<Principal | null> {
  if (!token) return null;

  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      partnerUser: { include: { roles: true } },
      platformUser: { include: { roles: true } },
      trader: true,
    },
  });

  if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now()) {
    return null;
  }

  if (session.partnerUser) {
    const user = session.partnerUser;
    if (user.status !== "ACTIVE") return null;
    return buildPartnerPrincipal({
      userId: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      partnerId: user.partnerId,
      roles: user.roles.map((role) => role.role),
      mfaEnabled: user.mfaEnabled,
      mfaVerified: session.mfaVerifiedAt !== null,
      sessionId: session.id,
    });
  }

  if (session.platformUser) {
    const user = session.platformUser;
    if (user.status !== "ACTIVE") return null;
    return buildPlatformPrincipal({
      userId: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      roles: user.roles.map((role) => role.role),
      mfaEnabled: user.mfaEnabled,
      mfaVerified: session.mfaVerifiedAt !== null,
      sessionId: session.id,
    });
  }

  if (session.trader) {
    const trader = session.trader;
    return buildTraderPrincipal({
      traderId: trader.id,
      email: trader.email,
      firstName: trader.firstName,
      lastName: trader.lastName,
      partnerId: trader.partnerId,
      sessionId: session.id,
    });
  }

  return null;
}

export async function revokeSession(db: Database, sessionId: string): Promise<void> {
  await db.session.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Housekeeping for the worker: drop sessions that expired over a day ago. */
export async function purgeExpiredSessions(db: Database): Promise<number> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const result = await db.session.deleteMany({ where: { expiresAt: { lt: cutoff } } });
  return result.count;
}
