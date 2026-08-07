import { describe, expect, it } from "vitest";
import { AppError } from "@spreddpay/contracts";
import {
  assertNotSelfApproval,
  buildPartnerPrincipal,
  buildPlatformPrincipal,
  buildTraderPrincipal,
  hasPermission,
  requirePartnerAccess,
  requirePermission,
  requireTraderSelf,
  type Principal,
} from "./principal";

function partner(roles: Parameters<typeof buildPartnerPrincipal>[0]["roles"], partnerId = "p1"): Principal {
  return buildPartnerPrincipal({
    userId: "u1",
    email: "user@example.com",
    firstName: "Jordan",
    lastName: "Blake",
    partnerId,
    roles,
    mfaEnabled: false,
    sessionId: "s1",
  });
}

function trader(traderId = "t1", partnerId = "p1"): Principal {
  return buildTraderPrincipal({
    traderId,
    email: "trader@example.com",
    firstName: "Alex",
    lastName: "Morgan",
    partnerId,
    sessionId: "s2",
  });
}

describe("RBAC — partner roles", () => {
  it("gives PAYOUT_CREATOR the ability to create but not approve", () => {
    const principal = partner(["PAYOUT_CREATOR"]);
    expect(hasPermission(principal, "payout:create")).toBe(true);
    expect(hasPermission(principal, "payout:approve")).toBe(false);
    expect(() => requirePermission(principal, "payout:approve")).toThrow(AppError);
  });

  it("gives PAYOUT_APPROVER the ability to approve but not create", () => {
    const principal = partner(["PAYOUT_APPROVER"]);
    expect(hasPermission(principal, "payout:approve")).toBe(true);
    expect(hasPermission(principal, "payout:create")).toBe(false);
  });

  it("gives READ_ONLY no mutating permission at all", () => {
    const principal = partner(["READ_ONLY"]);
    for (const permission of [
      "payout:create",
      "payout:approve",
      "payout:cancel",
      "trader:invite",
      "card:manage",
      "branding:manage",
      "team:manage",
    ] as const) {
      expect(hasPermission(principal, permission)).toBe(false);
    }
    expect(hasPermission(principal, "payout:read")).toBe(true);
  });

  it("unions permissions across multiple roles", () => {
    const principal = partner(["PAYOUT_CREATOR", "PAYOUT_APPROVER"]);
    expect(hasPermission(principal, "payout:create")).toBe(true);
    expect(hasPermission(principal, "payout:approve")).toBe(true);
  });

  it("gives PARTNER_OWNER everything", () => {
    const principal = partner(["PARTNER_OWNER"]);
    for (const permission of [
      "payout:create",
      "payout:approve",
      "team:manage",
      "apikey:manage",
      "branding:manage",
    ] as const) {
      expect(hasPermission(principal, permission)).toBe(true);
    }
  });

  it("grants a trader no partner permissions whatsoever", () => {
    const principal = trader();
    expect(principal.permissions.size).toBe(0);
    expect(() => requirePermission(principal, "payout:read")).toThrow(AppError);
  });

  it("does not leak platform permissions into partner roles", () => {
    const principal = partner(["PARTNER_OWNER"]);
    expect(hasPermission(principal, "platform:partner:write")).toBe(false);
    expect(hasPermission(principal, "platform:system:manage")).toBe(false);
  });
});

describe("tenant isolation — principal guards", () => {
  it("lets a partner user reach only their own partner", () => {
    const principal = partner(["PARTNER_OWNER"], "partner-a");
    expect(() => requirePartnerAccess(principal, "partner-a")).not.toThrow();
    expect(() => requirePartnerAccess(principal, "partner-b")).toThrow(AppError);
  });

  it("blocks a trader from another partner's data", () => {
    const principal = trader("t1", "partner-a");
    expect(() => requirePartnerAccess(principal, "partner-b")).toThrow(AppError);
  });

  it("lets a platform operator cross tenants only with an explicit permission", () => {
    const operator = buildPlatformPrincipal({
      userId: "op1",
      email: "ops@spreddpay.com",
      firstName: "Sam",
      lastName: "Okoye",
      roles: ["OPERATIONS"],
      mfaEnabled: true,
      sessionId: "s3",
    });
    expect(() => requirePartnerAccess(operator, "any-partner")).not.toThrow();

    const noAccess = buildPlatformPrincipal({
      userId: "op2",
      email: "nobody@spreddpay.com",
      firstName: "No",
      lastName: "Access",
      roles: [],
      mfaEnabled: false,
      sessionId: "s4",
    });
    expect(() => requirePartnerAccess(noAccess, "any-partner")).toThrow(AppError);
  });

  it("stops a trader reading another trader's records", () => {
    const principal = trader("trader-a");
    expect(() => requireTraderSelf(principal, "trader-a")).not.toThrow();
    expect(() => requireTraderSelf(principal, "trader-b")).toThrow(AppError);
  });

  it("lets a partner user with trader:read view any of their own traders", () => {
    const principal = partner(["SUPPORT_AGENT"]);
    expect(() => requireTraderSelf(principal, "any-trader")).not.toThrow();
  });
});

describe("dual approval", () => {
  const creator = partner(["PAYOUT_CREATOR", "PAYOUT_APPROVER"]);

  it("blocks the creator from approving their own high-value payout", () => {
    expect(() =>
      assertNotSelfApproval({
        principal: creator,
        initiatedByUserId: creator.userId,
        requiresDualApproval: true,
      }),
    ).toThrow(AppError);

    try {
      assertNotSelfApproval({
        principal: creator,
        initiatedByUserId: creator.userId,
        requiresDualApproval: true,
      });
    } catch (error) {
      expect((error as AppError).code).toBe("SELF_APPROVAL_FORBIDDEN");
    }
  });

  it("allows a different approver on a high-value payout", () => {
    expect(() =>
      assertNotSelfApproval({
        principal: creator,
        initiatedByUserId: "someone-else",
        requiresDualApproval: true,
      }),
    ).not.toThrow();
  });

  it("allows self-approval below the threshold", () => {
    expect(() =>
      assertNotSelfApproval({
        principal: creator,
        initiatedByUserId: creator.userId,
        requiresDualApproval: false,
      }),
    ).not.toThrow();
  });
});
