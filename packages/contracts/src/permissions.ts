/**
 * The permission matrix. Roles are coarse and user-facing; permissions are fine
 * and code-facing. Every guard in the API checks a permission, never a role, so
 * adding a role never means hunting through route handlers.
 */

import type { PartnerRoleName, PlatformRoleName } from "./enums";

export const PARTNER_PERMISSIONS = [
  "trader:read",
  "trader:invite",
  "trader:write",
  "payout:read",
  "payout:create",
  "payout:approve",
  "payout:cancel",
  "card:read",
  "card:manage",
  "transaction:read",
  "transaction:export",
  "revenue:read",
  "report:read",
  "branding:manage",
  "apikey:manage",
  "webhook:manage",
  "team:manage",
  "settings:manage",
  "support:manage",
] as const;
export type PartnerPermission = (typeof PARTNER_PERMISSIONS)[number];

export const PLATFORM_PERMISSIONS = [
  "platform:partner:read",
  "platform:partner:write",
  "platform:program:manage",
  "platform:user:manage",
  "platform:payout:read",
  "platform:payout:intervene",
  "platform:manual_operation:manage",
  "platform:provider_event:read",
  "platform:reconciliation:manage",
  "platform:revenue:read",
  "platform:revenue:manage",
  "platform:support:manage",
  "platform:audit:read",
  "platform:system:manage",
] as const;
export type PlatformPermission = (typeof PLATFORM_PERMISSIONS)[number];

export type Permission = PartnerPermission | PlatformPermission;

const READ_ONLY_PARTNER: readonly PartnerPermission[] = [
  "trader:read",
  "payout:read",
  "card:read",
  "transaction:read",
  "report:read",
];

export const PARTNER_ROLE_PERMISSIONS: Readonly<
  Record<PartnerRoleName, readonly PartnerPermission[]>
> = Object.freeze({
  PARTNER_OWNER: PARTNER_PERMISSIONS,
  PARTNER_ADMIN: [
    ...READ_ONLY_PARTNER,
    "trader:invite",
    "trader:write",
    "payout:create",
    "payout:approve",
    "payout:cancel",
    "card:manage",
    "transaction:export",
    "revenue:read",
    "branding:manage",
    "webhook:manage",
    "team:manage",
    "settings:manage",
    "support:manage",
  ],
  PAYOUT_CREATOR: [...READ_ONLY_PARTNER, "payout:create", "payout:cancel"],
  PAYOUT_APPROVER: [...READ_ONLY_PARTNER, "payout:approve"],
  SUPPORT_AGENT: [...READ_ONLY_PARTNER, "card:manage", "support:manage"],
  ANALYST: [...READ_ONLY_PARTNER, "transaction:export", "revenue:read"],
  READ_ONLY: READ_ONLY_PARTNER,
});

const READ_ONLY_PLATFORM: readonly PlatformPermission[] = [
  "platform:partner:read",
  "platform:payout:read",
  "platform:provider_event:read",
  "platform:revenue:read",
  "platform:audit:read",
];

export const PLATFORM_ROLE_PERMISSIONS: Readonly<
  Record<PlatformRoleName, readonly PlatformPermission[]>
> = Object.freeze({
  SUPER_ADMIN: PLATFORM_PERMISSIONS,
  OPERATIONS: [
    ...READ_ONLY_PLATFORM,
    "platform:partner:write",
    "platform:program:manage",
    "platform:payout:intervene",
    "platform:manual_operation:manage",
    "platform:reconciliation:manage",
    "platform:support:manage",
  ],
  SUPPORT: [...READ_ONLY_PLATFORM, "platform:support:manage"],
  FINANCE: [...READ_ONLY_PLATFORM, "platform:revenue:manage", "platform:reconciliation:manage"],
  READ_ONLY: READ_ONLY_PLATFORM,
});

export function partnerRolePermissions(
  roles: readonly PartnerRoleName[],
): ReadonlySet<PartnerPermission> {
  const granted = new Set<PartnerPermission>();
  for (const role of roles) {
    for (const permission of PARTNER_ROLE_PERMISSIONS[role] ?? []) granted.add(permission);
  }
  return granted;
}

export function platformRolePermissions(
  roles: readonly PlatformRoleName[],
): ReadonlySet<PlatformPermission> {
  const granted = new Set<PlatformPermission>();
  for (const role of roles) {
    for (const permission of PLATFORM_ROLE_PERMISSIONS[role] ?? []) granted.add(permission);
  }
  return granted;
}
