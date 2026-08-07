import { describe, expect, it } from "vitest";
import { parseAmountToMinor, sumMinor } from "@spreddpay/contracts";
import { InvalidPostingError, UnbalancedEntryError, validatePostings } from "./entry";
import {
  payoutApprovedPostings,
  payoutCompletedPostings,
} from "./recipes";
import type { PostingInput } from "./entry";

/**
 * The ledger rule the whole reporting layer rests on: every entry balances.
 * These tests assert it directly rather than through the database, so a broken
 * recipe fails in milliseconds instead of at reconciliation time.
 */
function totals(postings: readonly PostingInput[]) {
  const debits = sumMinor(
    postings.filter((posting) => posting.direction === "DEBIT").map((p) => p.amountMinor),
  );
  const credits = sumMinor(
    postings.filter((posting) => posting.direction === "CREDIT").map((p) => p.amountMinor),
  );
  return { debits, credits };
}

describe("validatePostings", () => {
  it("accepts a balanced two-sided entry", () => {
    const result = validatePostings([
      { account: "PARTNER_PAYOUTS_PENDING", direction: "DEBIT", amountMinor: 100n },
      { account: "USER_RESERVED_REPORTING", direction: "CREDIT", amountMinor: 100n },
    ]);
    expect(result).toEqual({ debits: 100n, credits: 100n });
  });

  it("rejects an entry that does not balance", () => {
    expect(() =>
      validatePostings([
        { account: "PARTNER_PAYOUTS_PENDING", direction: "DEBIT", amountMinor: 100n },
        { account: "USER_RESERVED_REPORTING", direction: "CREDIT", amountMinor: 99n },
      ]),
    ).toThrow(UnbalancedEntryError);
  });

  it("reports the exact difference so the error is actionable", () => {
    try {
      validatePostings([
        { account: "PARTNER_PAYOUTS_PENDING", direction: "DEBIT", amountMinor: 100n },
        { account: "USER_RESERVED_REPORTING", direction: "CREDIT", amountMinor: 97n },
      ]);
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(UnbalancedEntryError);
      expect((error as UnbalancedEntryError).debits).toBe(100n);
      expect((error as UnbalancedEntryError).credits).toBe(97n);
      expect((error as Error).message).toContain("difference 3");
    }
  });

  it("rejects a single-sided entry", () => {
    expect(() =>
      validatePostings([
        { account: "ADJUSTMENTS", direction: "DEBIT", amountMinor: 100n },
      ]),
    ).toThrow(InvalidPostingError);
  });

  it("rejects zero and negative amounts — direction carries the sign", () => {
    expect(() =>
      validatePostings([
        { account: "ADJUSTMENTS", direction: "DEBIT", amountMinor: 0n },
        { account: "SPREDDPAY_REVENUE", direction: "CREDIT", amountMinor: 0n },
      ]),
    ).toThrow(InvalidPostingError);

    expect(() =>
      validatePostings([
        { account: "ADJUSTMENTS", direction: "DEBIT", amountMinor: -100n },
        { account: "SPREDDPAY_REVENUE", direction: "CREDIT", amountMinor: -100n },
      ]),
    ).toThrow(InvalidPostingError);
  });

  it("rejects an account outside the chart of accounts", () => {
    expect(() =>
      validatePostings([
        // @ts-expect-error deliberately outside LedgerAccountCode
        { account: "MADE_UP_ACCOUNT", direction: "DEBIT", amountMinor: 100n },
        { account: "ADJUSTMENTS", direction: "CREDIT", amountMinor: 100n },
      ]),
    ).toThrow(InvalidPostingError);
  });

  it("balances a four-sided entry", () => {
    expect(() =>
      validatePostings([
        { account: "USER_RESERVED_REPORTING", direction: "DEBIT", amountMinor: 100n },
        { account: "USER_AVAILABLE_REPORTING", direction: "CREDIT", amountMinor: 100n },
        { account: "PARTNER_PAYOUTS_COMPLETED", direction: "DEBIT", amountMinor: 100n },
        { account: "PARTNER_PAYOUTS_PENDING", direction: "CREDIT", amountMinor: 100n },
      ]),
    ).not.toThrow();
  });
});

describe("payout recipes", () => {
  const amount = parseAmountToMinor("4850.00", "USDC");

  it("balances the approval entry", () => {
    const postings = payoutApprovedPostings(amount, "USDC");
    expect(() => validatePostings(postings)).not.toThrow();
    const { debits, credits } = totals(postings);
    expect(debits).toBe(credits);
    expect(debits).toBe(amount);
  });

  it("balances the completion entry", () => {
    const postings = payoutCompletedPostings(amount, "USDC");
    expect(() => validatePostings(postings)).not.toThrow();
    const { debits, credits } = totals(postings);
    expect(debits).toBe(credits);
    // Completion touches both the reservation and the in-flight pair.
    expect(debits).toBe(amount * 2n);
  });

  it("moves the trader's claim from reserved to available on completion", () => {
    const postings = payoutCompletedPostings(amount, "USDC");
    const reserved = postings.find((p) => p.account === "USER_RESERVED_REPORTING");
    const available = postings.find((p) => p.account === "USER_AVAILABLE_REPORTING");

    expect(reserved?.direction).toBe("DEBIT");
    expect(available?.direction).toBe("CREDIT");
    expect(reserved?.amountMinor).toBe(available?.amountMinor);
  });

  it("stays balanced for an amount that would break a float", () => {
    const awkward = parseAmountToMinor("0.070001", "USDC");
    const postings = payoutCompletedPostings(awkward, "USDC");
    const { debits, credits } = totals(postings);
    expect(debits).toBe(credits);
  });
});
