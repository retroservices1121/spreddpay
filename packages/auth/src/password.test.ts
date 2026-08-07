import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, generateToken, hashToken } from "./crypto";
import { hashPassword, verifyPassword } from "./password";

describe("password hashing", () => {
  it("accepts the correct password and rejects a wrong one", async () => {
    const hash = await hashPassword("SpreddPayDemo123!");
    await expect(verifyPassword("SpreddPayDemo123!", hash)).resolves.toBe(true);
    await expect(verifyPassword("SpreddPayDemo123", hash)).resolves.toBe(false);
  }, 20_000);

  it("salts, so the same password hashes differently every time", async () => {
    const [a, b] = await Promise.all([hashPassword("correct horse battery"), hashPassword("correct horse battery")]);
    expect(a).not.toBe(b);
  }, 20_000);

  it("never stores the password itself", async () => {
    const hash = await hashPassword("hunter2hunter2");
    expect(hash).not.toContain("hunter2");
    expect(hash.startsWith("scrypt$")).toBe(true);
  }, 20_000);

  it("returns false rather than throwing for missing or malformed hashes", async () => {
    await expect(verifyPassword("anything", null)).resolves.toBe(false);
    await expect(verifyPassword("anything", "")).resolves.toBe(false);
    await expect(verifyPassword("anything", "not-a-hash")).resolves.toBe(false);
    await expect(verifyPassword("anything", "bcrypt$1$2$3$4$5")).resolves.toBe(false);
  });

  it("refuses to hash a password that is too short", async () => {
    await expect(hashPassword("short")).rejects.toThrow();
  });
});

describe("secret encryption", () => {
  const key = "0".repeat(64);

  it("round-trips a secret", () => {
    const cipher = encryptSecret("whsec_partner_signing_key", key);
    expect(decryptSecret(cipher, key)).toBe("whsec_partner_signing_key");
  });

  it("produces different ciphertext each time", () => {
    expect(encryptSecret("same", key)).not.toBe(encryptSecret("same", key));
  });

  it("refuses a key of the wrong shape", () => {
    expect(() => encryptSecret("x", "too-short")).toThrow();
  });

  it("fails to decrypt with the wrong key rather than returning garbage", () => {
    const cipher = encryptSecret("secret", key);
    expect(() => decryptSecret(cipher, "1".repeat(64))).toThrow();
  });

  it("detects tampering via the auth tag", () => {
    const cipher = encryptSecret("secret", key);
    const parts = cipher.split(".");
    const tampered = [parts[0], parts[1], parts[2], Buffer.from("evil").toString("base64")].join(".");
    expect(() => decryptSecret(tampered, key)).toThrow();
  });
});

describe("token hashing", () => {
  it("stores only the hash, never the token", () => {
    const token = generateToken();
    const hash = hashToken(token);
    expect(hash).not.toBe(token);
    expect(hash).toHaveLength(64);
    expect(hashToken(token)).toBe(hash);
  });
});
