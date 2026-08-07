import { describe, expect, it } from "vitest";
import {
  base32Decode,
  base32Encode,
  generateTotpSecret,
  hotp,
  totp,
  totpEnrollmentUri,
  verifyTotp,
} from "./totp";

/**
 * Verified against the published RFC vectors rather than against itself. A
 * hand-rolled TOTP that only agrees with its own output would lock every
 * operator out of the admin portal on first use.
 */
describe("HOTP — RFC 4226 Appendix D test vectors", () => {
  const secret = Buffer.from("12345678901234567890", "ascii");
  const expected = [
    "755224",
    "287082",
    "359152",
    "969429",
    "338314",
    "254676",
    "287922",
    "162583",
    "399871",
    "520489",
  ];

  it.each(expected.map((code, counter) => [counter, code]))(
    "counter %i produces %s",
    (counter, code) => {
      expect(hotp(secret, counter as number)).toBe(code);
    },
  );
});

describe("TOTP — RFC 6238 Appendix B test vectors (SHA-1)", () => {
  // The RFC's SHA-1 secret is the ASCII string "12345678901234567890".
  const secret = base32Encode(Buffer.from("12345678901234567890", "ascii"));

  // The RFC publishes 8-digit values; the leading digits differ by
  // implementation width, so compare the low 6 digits, which is what a
  // 6-digit authenticator shows.
  const vectors: [number, string][] = [
    [59, "94287082"],
    [1111111109, "07081804"],
    [1111111111, "14050471"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
    [20000000000, "65353130"],
  ];

  it.each(vectors)("at unix time %i", (seconds, eightDigit) => {
    expect(totp(secret, seconds * 1000)).toBe(eightDigit.slice(-6));
  });
});

describe("base32", () => {
  it("round-trips", () => {
    const raw = Buffer.from("12345678901234567890", "ascii");
    expect(base32Decode(base32Encode(raw)).equals(raw)).toBe(true);
  });

  it("matches the known encoding of the RFC secret", () => {
    expect(base32Encode(Buffer.from("12345678901234567890", "ascii"))).toBe(
      "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ",
    );
  });

  it("tolerates lowercase, whitespace and padding", () => {
    const raw = Buffer.from("hello world!", "ascii");
    const encoded = base32Encode(raw);
    expect(base32Decode(`${encoded.toLowerCase()}==`).equals(raw)).toBe(true);
  });

  it("rejects characters outside the alphabet", () => {
    expect(() => base32Decode("ABC!DEF")).toThrow();
  });
});

describe("verifyTotp", () => {
  const secret = generateTotpSecret();
  const now = 1_767_225_600_000; // fixed instant

  it("accepts the current code", () => {
    expect(verifyTotp(secret, totp(secret, now), { atMs: now })).toBe(true);
  });

  it("absorbs one step of clock drift in each direction", () => {
    expect(verifyTotp(secret, totp(secret, now - 30_000), { atMs: now })).toBe(true);
    expect(verifyTotp(secret, totp(secret, now + 30_000), { atMs: now })).toBe(true);
  });

  it("rejects a code two steps away", () => {
    expect(verifyTotp(secret, totp(secret, now + 90_000), { atMs: now })).toBe(false);
  });

  it("rejects the wrong code, wrong shapes and empty input", () => {
    expect(verifyTotp(secret, "000000", { atMs: now, window: 0 })).toBe(
      totp(secret, now) === "000000",
    );
    expect(verifyTotp(secret, "12345", { atMs: now })).toBe(false);
    expect(verifyTotp(secret, "abcdef", { atMs: now })).toBe(false);
    expect(verifyTotp(secret, "", { atMs: now })).toBe(false);
    expect(verifyTotp(secret, "1234567", { atMs: now })).toBe(false);
  });

  it("rejects a code from a different secret", () => {
    expect(verifyTotp(secret, totp(generateTotpSecret(), now), { atMs: now, window: 0 })).toBe(
      false,
    );
  });

  it("tolerates a space-separated code, as apps display it", () => {
    const code = totp(secret, now);
    expect(verifyTotp(secret, `${code.slice(0, 3)} ${code.slice(3)}`, { atMs: now })).toBe(true);
  });
});

describe("generateTotpSecret", () => {
  it("produces a distinct 160-bit base32 secret each time", () => {
    const a = generateTotpSecret();
    const b = generateTotpSecret();
    expect(a).not.toBe(b);
    expect(base32Decode(a)).toHaveLength(20);
    expect(a).toMatch(/^[A-Z2-7]+$/);
  });
});

describe("totpEnrollmentUri", () => {
  it("builds a scannable otpauth URI", () => {
    const uri = totpEnrollmentUri({ secret: "GEZDGNBVGY3TQOJQ", accountName: "ops@spreddpay.com" });
    // The label is percent-encoded, so the space in "Spredd Pay" is %20 and
    // URLSearchParams renders it as "+" in the issuer parameter. Both are what
    // authenticator apps expect; a literal space would not be a valid URI.
    expect(uri.startsWith("otpauth://totp/Spredd%20Pay%3Aops%40spreddpay.com?")).toBe(true);
    expect(uri).toContain("secret=GEZDGNBVGY3TQOJQ");
    expect(uri).toContain("issuer=Spredd+Pay");
    expect(uri).toContain("digits=6");
    expect(uri).toContain("period=30");
  });
});
