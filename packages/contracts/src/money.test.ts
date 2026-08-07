import { describe, expect, it } from "vitest";
import {
  allocate,
  applyBasisPoints,
  formatMinor,
  formatMoney,
  MoneyError,
  parseAmountToMinor,
  sumMinor,
} from "./money";

/**
 * Money is the thing this platform cannot get wrong. These tests pin down the
 * two rules that matter: nothing ever becomes a float, and splits always add
 * back up to the whole.
 */
describe("parseAmountToMinor", () => {
  it("parses whole and fractional USDC to six minor places", () => {
    expect(parseAmountToMinor("4850", "USDC")).toBe(4_850_000_000n);
    expect(parseAmountToMinor("4850.00", "USDC")).toBe(4_850_000_000n);
    expect(parseAmountToMinor("0.000001", "USDC")).toBe(1n);
  });

  it("parses the amounts a float would ruin", () => {
    // 0.1 + 0.2 !== 0.3 in IEEE-754. In minor units it is exact.
    const tenth = parseAmountToMinor("0.1", "USDC");
    const fifth = parseAmountToMinor("0.2", "USDC");
    expect(tenth + fifth).toBe(parseAmountToMinor("0.3", "USDC"));
  });

  it("keeps precision far beyond Number.MAX_SAFE_INTEGER", () => {
    const huge = parseAmountToMinor("99999999999.999999", "USDC");
    expect(huge).toBe(99_999_999_999_999_999n);
    expect(huge > BigInt(Number.MAX_SAFE_INTEGER)).toBe(true);
    // Round-trips exactly; a Number would not.
    expect(formatMinor(huge, "USDC")).toBe("99999999999.999999");
  });

  it("strips thousands separators", () => {
    expect(parseAmountToMinor("4,850.50", "USDC")).toBe(4_850_500_000n);
  });

  it("rejects more precision than the asset supports", () => {
    expect(() => parseAmountToMinor("1.0000001", "USDC")).toThrow(MoneyError);
    expect(() => parseAmountToMinor("1.001", "USD")).toThrow(MoneyError);
  });

  it("rejects nonsense", () => {
    expect(() => parseAmountToMinor("abc", "USDC")).toThrow(MoneyError);
    expect(() => parseAmountToMinor("", "USDC")).toThrow(MoneyError);
    expect(() => parseAmountToMinor("1.2.3", "USDC")).toThrow(MoneyError);
  });

  it("rejects unknown assets rather than guessing decimals", () => {
    expect(() => parseAmountToMinor("1", "DOGE")).toThrow(MoneyError);
  });
});

describe("formatMoney", () => {
  it("groups thousands and trims to display precision", () => {
    expect(formatMoney(4_850_000_000n, "USDC")).toBe("4,850.00 USDC");
    expect(formatMoney(8_423n, "USD")).toBe("84.23 USD");
  });

  it("handles negatives and zero", () => {
    expect(formatMoney(-1_500_000n, "USDC")).toBe("-1.50 USDC");
    expect(formatMoney(0n, "USDC")).toBe("0.00 USDC");
  });

  it("truncates for display without changing the stored value", () => {
    // 1.239999 displays as 1.23; the underlying minor units are untouched.
    expect(formatMoney(1_239_999n, "USDC")).toBe("1.23 USDC");
    expect(formatMinor(1_239_999n, "USDC")).toBe("1.239999");
  });
});

describe("applyBasisPoints", () => {
  it("computes a share exactly", () => {
    expect(applyBasisPoints(4_850_000_000n, 250)).toBe(121_250_000n); // 2.5%
    expect(applyBasisPoints(100n, 10_000)).toBe(100n); // 100%
    expect(applyBasisPoints(100n, 0)).toBe(0n);
  });

  it("rejects fractional or negative basis points", () => {
    expect(() => applyBasisPoints(100n, 1.5)).toThrow(MoneyError);
    expect(() => applyBasisPoints(100n, -1)).toThrow(MoneyError);
  });
});

describe("allocate", () => {
  it("splits evenly when it divides cleanly", () => {
    expect(allocate(1000n, [50, 50])).toEqual([500n, 500n]);
  });

  it("never loses or invents a minor unit", () => {
    // 100 / 3 does not divide; the remainder must land somewhere, once.
    const parts = allocate(100n, [1, 1, 1]);
    expect(sumMinor(parts)).toBe(100n);
    expect(parts).toEqual([34n, 33n, 33n]);
  });

  it("gives the rounding remainder to the largest weight", () => {
    const parts = allocate(1_000_001n, [7000, 2000, 1000]);
    expect(sumMinor(parts)).toBe(1_000_001n);
    expect(parts[0]).toBeGreaterThan(parts[1] ?? 0n);
  });

  it("survives a three-way split of a realistic payout", () => {
    const gross = parseAmountToMinor("4850.00", "USDC");
    const parts = allocate(gross, [6000, 3000, 1000]);
    expect(sumMinor(parts)).toBe(gross);
  });

  it("rejects empty or non-positive weights", () => {
    expect(() => allocate(100n, [])).toThrow(MoneyError);
    expect(() => allocate(100n, [0, 0])).toThrow(MoneyError);
  });
});
