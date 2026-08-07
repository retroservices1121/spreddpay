import { describe, expect, it } from "vitest";
import { toCsv, toMoneyDto } from "./index";

describe("toMoneyDto", () => {
  it("keeps minor units exact as a string and formats separately", () => {
    const dto = toMoneyDto(4_850_000_000n, "USDC");
    expect(dto.amountMinor).toBe("4850000000");
    expect(dto.display).toBe("4,850.00 USDC");
    // The exact value survives the round trip; the display value is lossy by design.
    expect(BigInt(dto.amountMinor)).toBe(4_850_000_000n);
  });

  it("does not lose precision above Number.MAX_SAFE_INTEGER", () => {
    const huge = 9_007_199_254_740_993n; // MAX_SAFE_INTEGER + 2
    expect(BigInt(toMoneyDto(huge, "USDC").amountMinor)).toBe(huge);
  });
});

describe("toCsv", () => {
  it("returns an empty string for no rows", () => {
    expect(toCsv([])).toBe("");
  });

  it("writes a header row from the first record", () => {
    const csv = toCsv([{ id: "a", amount: "1.00" }]);
    expect(csv.split("\n")[0]).toBe("id,amount");
  });

  it("quotes values containing commas, quotes or newlines", () => {
    const csv = toCsv([
      { merchant: 'Smith, Jones & Co', note: 'said "hello"', detail: "line1\nline2" },
    ]);
    const row = csv.split("\n")[1];
    expect(row).toContain('"Smith, Jones & Co"');
    expect(row).toContain('"said ""hello"""');
  });

  it("renders dates as ISO strings", () => {
    const csv = toCsv([{ occurredAt: new Date("2026-01-15T09:00:00.000Z") }]);
    expect(csv).toContain("2026-01-15T09:00:00.000Z");
  });

  it("renders null and undefined as empty, not the word 'null'", () => {
    const csv = toCsv([{ a: null, b: undefined, c: "x" }]);
    expect(csv.split("\n")[1]).toBe(",,x");
  });
});
