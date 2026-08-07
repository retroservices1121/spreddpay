import type { FastifyInstance, FastifyRequest } from "fastify";
import { SESSION_COOKIE } from "@spreddpay/config";
import { AppError } from "@spreddpay/contracts";
import { loadPrincipal, requireMfa, type Principal } from "@spreddpay/auth";
import type { AppContext } from "../context";

declare module "fastify" {
  interface FastifyRequest {
    principal: Principal | null;
  }
}

/**
 * Resolves the session cookie into a Principal on every request. Routes then
 * call `requireAuth(request)` — there is no route that reads the cookie itself.
 */
export async function registerAuth(app: FastifyInstance, context: AppContext): Promise<void> {
  app.decorateRequest("principal", null);

  app.addHook("onRequest", async (request) => {
    const token = request.cookies[SESSION_COOKIE];
    request.principal = token ? await loadPrincipal(context.db, token) : null;
  });
}

export function requireAuth(request: FastifyRequest): Principal {
  if (!request.principal) {
    throw AppError.unauthenticated();
  }
  return request.principal;
}

/** Partner-portal routes. Platform operators are allowed through for support. */
export function requirePartnerUser(request: FastifyRequest): Principal {
  const principal = requireAuth(request);
  if (principal.kind === "TRADER") {
    throw AppError.forbidden("This endpoint is not available to traders.");
  }
  return principal;
}

export function requireTrader(request: FastifyRequest): Principal {
  const principal = requireAuth(request);
  if (principal.kind !== "TRADER") {
    throw AppError.forbidden("This endpoint is only available to traders.");
  }
  return principal;
}

/**
 * Platform-operator routes.
 *
 * Enforces the second factor as well as the role. The admin portal is publicly
 * reachable and reaches every partner's data, so a password alone must not be
 * sufficient — and an operator who has never enrolled is refused rather than
 * grandfathered, or "never set it up" becomes the way around it.
 *
 * The MFA routes themselves deliberately use `requireAuth`, not this, or there
 * would be no way to enrol.
 */
export function requirePlatformUser(request: FastifyRequest): Principal {
  const principal = requireAuth(request);
  if (principal.kind !== "PLATFORM_USER") {
    throw AppError.forbidden("This endpoint is only available to Spredd Pay operators.");
  }
  requireMfa(principal);
  return principal;
}

export function clientContext(request: FastifyRequest): {
  ipAddress: string | null;
  userAgent: string | null;
} {
  return {
    ipAddress: request.ip ?? null,
    userAgent: request.headers["user-agent"] ?? null,
  };
}
