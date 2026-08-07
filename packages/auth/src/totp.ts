/**
 * TOTP (RFC 6238) on Node's crypto.
 *
 * Implemented here rather than pulled in, because it is ~80 lines of well-
 * specified arithmetic and the RFC publishes test vectors — so it can be
 * verified rather than trusted. It also keeps the dependency surface of the
 * thing guarding operator access as small as possible.
 *
 * Compatible with Google Authenticator, 1Password, Authy: SHA-1, 6 digits,
 * 30-second step.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const DIGITS = 6;
const STEP_SECONDS = 30;

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** RFC 4648 base32, no padding — the encoding authenticator apps expect. */
export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/=+$/, "").replace(/\s/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];

  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) throw new Error(`Invalid base32 character "${char}".`);
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A new random secret, base32-encoded. 20 bytes = 160 bits, per the RFC. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/**
 * HOTP for a specific counter. Exported so the RFC 4226/6238 test vectors can
 * be asserted directly.
 */
export function hotp(secret: Buffer, counter: number, digits = DIGITS, algorithm = "sha1"): string {
  const buffer = Buffer.alloc(8);
  // Counter is a 64-bit big-endian integer. Node's writeBigUInt64BE keeps this
  // exact past 2^53, which a Number-based shift would not.
  buffer.writeBigUInt64BE(BigInt(counter));

  const digest = createHmac(algorithm, secret).update(buffer).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff);

  return (binary % 10 ** digits).toString().padStart(digits, "0");
}

export function totp(
  secretBase32: string,
  atMs: number = Date.now(),
  step = STEP_SECONDS,
): string {
  const counter = Math.floor(atMs / 1000 / step);
  return hotp(base32Decode(secretBase32), counter);
}

/**
 * Verify a submitted code.
 *
 * `window` allows one step either side by default, which absorbs ordinary clock
 * drift between the server and the user's phone. It is compared in constant
 * time — a timing oracle on a six-digit code is a small but free win to close.
 */
export function verifyTotp(
  secretBase32: string,
  token: string,
  options: { atMs?: number; window?: number; step?: number } = {},
): boolean {
  const atMs = options.atMs ?? Date.now();
  const window = options.window ?? 1;
  const step = options.step ?? STEP_SECONDS;

  const candidate = token.replace(/\s/g, "");
  if (!/^\d{6}$/.test(candidate)) return false;

  const secret = base32Decode(secretBase32);
  const counter = Math.floor(atMs / 1000 / step);

  let matched = false;
  for (let drift = -window; drift <= window; drift += 1) {
    const expected = hotp(secret, counter + drift);
    // No early return: checking every candidate keeps the work constant
    // regardless of which step matched.
    const a = Buffer.from(expected);
    const b = Buffer.from(candidate);
    if (a.length === b.length && timingSafeEqual(a, b)) matched = true;
  }
  return matched;
}

/**
 * The otpauth:// URI an authenticator app scans.
 *
 * `issuer` appears as the account label, so operators can tell Spredd Pay apart
 * from everything else in their app.
 */
export function totpEnrollmentUri(input: {
  secret: string;
  accountName: string;
  issuer?: string;
}): string {
  const issuer = input.issuer ?? "Spredd Pay";
  const label = encodeURIComponent(`${issuer}:${input.accountName}`);
  const params = new URLSearchParams({
    secret: input.secret,
    issuer,
    algorithm: "SHA1",
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
