import { describe, expect, it } from "vitest";
import { findRoleConflict, partnerRolePermissions } from "./permissions";

describe("findRoleConflict", () => {
  it("refuses creator + approver on one user", () => {
    const conflict = findRoleConflict(["PAYOUT_CREATOR", "PAYOUT_APPROVER"]);
    expect(conflict).not.toBeNull();
    expect(conflict?.roles).toEqual(["PAYOUT_CREATOR", "PAYOUT_APPROVER"]);
  });

  it("allows either role on its own", () => {
    expect(findRoleConflict(["PAYOUT_CREATOR"])).toBeNull();
    expect(findRoleConflict(["PAYOUT_APPROVER"])).toBeNull();
  });

  it("allows unrelated combinations", () => {
    expect(findRoleConflict(["PAYOUT_CREATOR", "ANALYST", "SUPPORT_AGENT"])).toBeNull();
  });

  it("exempts PARTNER_OWNER, which holds everything by definition", () => {
    // Forbidding the pair here would mean an owner could never approve. The
    // self-approval rule still blocks them approving their own high-value work.
    expect(findRoleConflict(["PARTNER_OWNER"])).toBeNull();
    expect(findRoleConflict(["PARTNER_OWNER", "PAYOUT_CREATOR", "PAYOUT_APPROVER"])).toBeNull();
    expect(partnerRolePermissions(["PARTNER_OWNER"]).has("payout:approve")).toBe(true);
    expect(partnerRolePermissions(["PARTNER_OWNER"]).has("payout:create")).toBe(true);
  });

  it("is order-independent", () => {
    expect(findRoleConflict(["PAYOUT_APPROVER", "PAYOUT_CREATOR"])).not.toBeNull();
  });
});
