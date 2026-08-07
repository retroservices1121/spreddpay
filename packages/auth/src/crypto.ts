/**
 * AES-256-GCM for secrets at rest: partner webhook signing secrets, provider
 * credentials, MFA seeds. Key comes from ENCRYPTION_KEY (32 bytes, hex).
 *
 * Format: v1.<iv b64>.<tag b64>.<ciphertext b64>. The version prefix is there so
 * a future key rotation can decrypt old values while writing new ones.
 */

import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const VERSION = "v1";

function keyFrom(hexKey: string): Buffer {
  if (!/^[0-9a-fA-F]{64}$/.test(hexKey)) {
    throw new Error("ENCRYPTION_KEY must be 64 hex characters (32 bytes).");
  }
  return Buffer.from(hexKey, "hex");
}

export function encryptSecret(plaintext: string, hexKey: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, keyFrom(hexKey), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(
    ".",
  );
}

export function decryptSecret(payload: string, hexKey: string): string {
  const parts = payload.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("Unrecognised ciphertext format.");
  }
  const [, ivB64, tagB64, dataB64] = parts;
  const decipher = createDecipheriv(
    ALGORITHM,
    keyFrom(hexKey),
    Buffer.from(ivB64 ?? "", "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64 ?? "", "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64 ?? "", "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/** Opaque token for sessions and API keys. */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/**
 * Sessions and API keys are stored as SHA-256 of the token, not the token.
 * A database leak then yields nothing usable.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
