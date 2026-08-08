import { describe, expect, it } from "vitest";
import { PAYOUT_STATUSES, TRADER_STATUSES, CARD_STATUSES } from "./enums";
import {
  assertCardTransition,
  assertPayoutTransition,
  assertTraderTransition,
  canTransition,
  InvalidTransitionError,
  isPayoutTerminal,
  PAYOUT_TRANSITIONS,
  TRADER_HAPPY_PATH,
  TRADER_TRANSITIONS,
  CARD_TRANSITIONS,
  traderCanReceivePayout,
} from "./state-machines";

describe("payout state machine", () => {
  it("walks the documented happy path", () => {
    const path = [
      "DRAFT",
      "PENDING_APPROVAL",
      "APPROVED",
      "FUNDING_PENDING",
      "SUBMITTED_TO_PROVIDER",
      "PROCESSING",
      "COMPLETED",
    ] as const;

    for (let i = 0; i < path.length - 1; i += 1) {
      expect(() => assertPayoutTransition(path[i]!, path[i + 1]!)).not.toThrow();
    }
  });

  it("refuses to skip approval", () => {
    expect(() => assertPayoutTransition("DRAFT", "APPROVED")).toThrow(InvalidTransitionError);
    expect(() => assertPayoutTransition("DRAFT", "COMPLETED")).toThrow(InvalidTransitionError);
    expect(() => assertPayoutTransition("PENDING_APPROVAL", "SUBMITTED_TO_PROVIDER")).toThrow(
      InvalidTransitionError,
    );
  });

  it("refuses to move a payout backwards", () => {
    expect(() => assertPayoutTransition("COMPLETED", "PROCESSING")).toThrow(InvalidTransitionError);
    expect(() => assertPayoutTransition("APPROVED", "DRAFT")).toThrow(InvalidTransitionError);
  });

  it("locks terminal states", () => {
    for (const status of ["REJECTED", "CANCELLED", "REVERSED"] as const) {
      expect(isPayoutTerminal(status)).toBe(true);
      for (const target of PAYOUT_STATUSES) {
        expect(canTransition(PAYOUT_TRANSITIONS, status, target)).toBe(false);
      }
    }
  });

  it("allows a completed payout to be reversed but nothing else", () => {
    expect(canTransition(PAYOUT_TRANSITIONS, "COMPLETED", "REVERSED")).toBe(true);
    expect(canTransition(PAYOUT_TRANSITIONS, "COMPLETED", "FAILED")).toBe(false);
  });

  it("lets manual review return a payout to the flow", () => {
    expect(canTransition(PAYOUT_TRANSITIONS, "MANUAL_REVIEW", "COMPLETED")).toBe(true);
    expect(canTransition(PAYOUT_TRANSITIONS, "MANUAL_REVIEW", "CANCELLED")).toBe(true);
  });

  it("defines a transition list for every status", () => {
    for (const status of PAYOUT_STATUSES) {
      expect(PAYOUT_TRANSITIONS[status]).toBeDefined();
    }
  });

  it("never lists a target that is not a real status", () => {
    for (const targets of Object.values(PAYOUT_TRANSITIONS)) {
      for (const target of targets) {
        expect(PAYOUT_STATUSES).toContain(target);
      }
    }
  });
});

describe("trader onboarding state machine", () => {
  it("walks the documented happy path end to end", () => {
    for (let i = 0; i < TRADER_HAPPY_PATH.length - 1; i += 1) {
      expect(() =>
        assertTraderTransition(TRADER_HAPPY_PATH[i]!, TRADER_HAPPY_PATH[i + 1]!),
      ).not.toThrow();
    }
  });

  it("cannot skip KYC to reach an account", () => {
    expect(() => assertTraderTransition("INVITED", "PROVIDER_ACCOUNT_ACTIVE")).toThrow(
      InvalidTransitionError,
    );
    expect(() => assertTraderTransition("TERMS_PENDING", "KYC_APPROVED")).toThrow(
      InvalidTransitionError,
    );
  });

  it("treats rejection and unsupported countries as terminal", () => {
    for (const status of ["KYC_REJECTED", "COUNTRY_UNSUPPORTED", "CARD_INELIGIBLE"] as const) {
      expect(TRADER_TRANSITIONS[status]).toHaveLength(0);
    }
  });

  it("only lets a trader receive a payout once Rain holds an active account", () => {
    expect(traderCanReceivePayout("PROVIDER_ACCOUNT_ACTIVE")).toBe(true);
    expect(traderCanReceivePayout("VIRTUAL_CARD_ACTIVE")).toBe(true);

    for (const status of [
      "INVITED",
      "TERMS_PENDING",
      "KYC_PENDING",
      "KYC_APPROVED",
      "KYC_REJECTED",
      "ACCOUNT_RESTRICTED",
      "MANUAL_REVIEW",
    ] as const) {
      expect(traderCanReceivePayout(status)).toBe(false);
    }
  });

  it("defines a transition list for every status", () => {
    for (const status of TRADER_STATUSES) {
      expect(TRADER_TRANSITIONS[status]).toBeDefined();
    }
  });
});

describe("card state machine", () => {
  it("supports freeze and unfreeze", () => {
    expect(() => assertCardTransition("ACTIVE", "FROZEN")).not.toThrow();
    expect(() => assertCardTransition("FROZEN", "ACTIVE")).not.toThrow();
  });

  it("refuses to unfreeze a card that is not frozen", () => {
    expect(() => assertCardTransition("CANCELLED", "ACTIVE")).toThrow(InvalidTransitionError);
    expect(() => assertCardTransition("PENDING", "FROZEN")).toThrow(InvalidTransitionError);
  });

  it("treats cancellation as final", () => {
    expect(CARD_TRANSITIONS.CANCELLED).toHaveLength(0);
    for (const status of CARD_STATUSES) {
      expect(canTransition(CARD_TRANSITIONS, "CANCELLED", status)).toBe(false);
    }
  });
});
