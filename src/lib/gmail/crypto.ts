import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Encrypts Gmail refresh tokens before they are written to the database, so a
 * leaked database row is useless without GMAIL_TOKEN_ENCRYPTION_KEY, which
 * lives only in the server's environment. AES-256-GCM: a fresh random IV per
 * value, and the auth tag rejects any ciphertext that was tampered with.
 *
 * Stored form: "v1:<iv>:<tag>:<ciphertext>", each part base64.
 *
 * Plain module (no "server-only") so it can be unit tested; nothing in the
 * browser ever imports it because the key is only in server env vars.
 */

const VERSION = "v1";

export class TokenKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TokenKeyError";
  }
}

/** Decodes a base64 key and insists on exactly 32 bytes (AES-256). */
export function parseTokenKey(raw: string | undefined | null): Buffer {
  const value = raw?.trim() ?? "";
  if (!value) {
    throw new TokenKeyError("GMAIL_TOKEN_ENCRYPTION_KEY is not set.");
  }
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) {
    throw new TokenKeyError(
      "GMAIL_TOKEN_ENCRYPTION_KEY must be 32 random bytes, base64 encoded (44 characters).",
    );
  }
  return key;
}

export function encryptToken(plaintext: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(
    ":",
  );
}

export function decryptToken(stored: string, key: Buffer): string {
  const [version, iv, tag, ciphertext] = stored.split(":");
  if (version !== VERSION || !iv || !tag || !ciphertext) {
    throw new Error("Unrecognised encrypted token format.");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
