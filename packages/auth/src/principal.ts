/**
 * The authenticated caller.
 *
 * A Principal is what every guard reasons about. It carries the tenant it
 * belongs to and the permissions its roles grant, resolved once at session
 * load — route handlers never re-derive permissions from roles.
 */

import type {
  PartnerPermission,
  PartnerRoleName,
  Permission,
  PlatformPermission,
  PlatformRoleName,
} from "@spreddpay/contracts";
import { AppError, partnerRolePermissions, platformRolePermissions } from "@spreddpay/contracts";

export type PrincipalKind = "PARTNER_USER" | "PLATFORM_USER" | "TRADER";

export interface Principal {
  kind: PrincipalKind;
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  /** Null for platform operators, who are not tenant-scoped. */
  partnerId: string | null;
  /** Set only for traders. */
  traderId: string | null;
  partnerRoles: readonly PartnerRoleName[];
  platformRoles: readonly PlatformRoleName[];
  permissions: ReadonlySet<Permission>;
  mfaEnabled: boolean;
  sessionId: string;
}

export function buildPartnerPrincipal(input: {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  partnerId: string;
  roles: readonly PartnerRoleName[];
  mfaEnabled: boolean;
  sessionId: string;
}): Principal {
  return {
    kind: "PARTNER_USER",
    userId: input.userId,
    email: input.email,
    firstName: input.firstName,
    lastName: input.lastName,
    partnerId: input.partnerId,
    traderId: null,
    partnerRoles: input.roles,
    platformRoles: [],
    permissions: partnerRolePermissions(input.roles) as ReadonlySet<Permission>,
    mfaEnabled: input.mfaEnabled,
    sessionId: input.sessionId,
  };
}

export function buildPlatformPrincipal(input: {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: readonly PlatformRoleName[];
  mfaEnabled: boolean;
  sessionId: string;
}): Principal {
  return {
    kind: "PLATFORM_USER",
    userId: input.userId,
    email: input.email,
    firstName: input.firstName,
    lastName: input.lastName,
    partnerId: null,
    traderId: null,
    partnerRoles: [],
    platformRoles: input.roles,
    permissions: platformRolePermissions(input.roles) as ReadonlySet<Permission>,
    mfaEnabled: input.mfaEnabled,
    sessionId: input.sessionId,
  };
}

export function buildTraderPrincipal(input: {
  traderId: string;
  email: string;
  firstName: string;
  lastName: string;
  partnerId: string;
  sessionId: string;
}): Principal {
  return {
    kind: "TRADER",
    userId: input.traderId,
    email: input.email,
    firstName: input.firstName,
    lastName: input.lastName,
    partnerId: input.partnerId,
    traderId: input.traderId,
    partnerRoles: [],
    platformRoles: [],
    // Traders hold no partner or platform permissions. Their access is granted
    // by the /me routes, each of which scopes to principal.traderId.
    permissions: new Set<Permission>(),
    mfaEnabled: false,
    sessionId: input.sessionId,
  };
}

// ------------------------------------------------------------------- guards

export function hasPermission(principal: Principal, permission: Permission): boolean {
  return principal.permissions.has(permission);
}

export function requirePermission(principal: Principal, permission: Permission): void {
  if (!hasPermission(principal, permission)) {
    throw AppError.forbidden(`This action requires the "${permission}" permission.`);
  }
}

export function requireAnyPermission(
  principal: Principal,
  permissions: readonly Permission[],
): void {
  if (!permissions.some((permission) => principal.permissions.has(permission))) {
    throw AppError.forbidden(`This action requires one of: ${permissions.join(", ")}.`);
  }
}

/**
 * Tenant guard. A partner user or trader may only touch their own partner's
 * data; a platform operator may cross tenants but only with an explicit
 * platform read permission.
 */
export function requirePartnerAccess(principal: Principal, partnerId: string): void {
  if (principal.kind === "PLATFORM_USER") {
    requirePermission(principal, "platform:partner:read" as PlatformPermission);
    return;
  }
  if (principal.partnerId !== partnerId) {
    throw AppError.forbidden("You do not have access to this partner.");
  }
}

/** A trader may only read their own records. */
export function requireTraderSelf(principal: Principal, traderId: string): void {
  if (principal.kind === "TRADER") {
    if (principal.traderId !== traderId) {
      throw AppError.forbidden("You do not have access to this trader.");
    }
    return;
  }
  if (principal.kind === "PARTNER_USER") {
    requirePermission(principal, "trader:read" as PartnerPermission);
    return;
  }
  requirePermission(principal, "platform:partner:read" as PlatformPermission);
}

/**
 * Dual approval, from TECHNICAL_README section 8: "payout creators cannot
 * approve their own high-value payouts."
 *
 * Applied whenever the payout is flagged as requiring dual approval, which the
 * payout engine sets at creation from the partner's threshold. Below the
 * threshold a single approver — including the creator — is sufficient.
 */
export function assertNotSelfApproval(input: {
  principal: Principal;
  initiatedByUserId: string;
  requiresDualApproval: boolean;
}): void {
  if (!input.requiresDualApproval) return;
  if (input.principal.userId === input.initiatedByUserId) {
    throw new AppError(
      "SELF_APPROVAL_FORBIDDEN",
      "A payout above the dual-approval threshold must be approved by someone other than the user who created it.",
    );
  }
}
