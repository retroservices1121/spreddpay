import type { FastifyInstance, FastifyRequest } from "fastify";
import { SESSION_COOKIE } from "@spreddpay/config";
import { AppError } from "@spreddpay/contracts";
import { loadPrincipal, type Principal } from "@spreddpay/auth";
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

export function requirePlatformUser(request: FastifyRequest): Principal {
  const principal = requireAuth(request);
  if (principal.kind !== "PLATFORM_USER") {
    throw AppError.forbidden("This endpoint is only available to SpreddPay operators.");
  }
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
