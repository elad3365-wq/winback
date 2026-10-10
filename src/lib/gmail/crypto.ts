import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Authenticated encryption for Gmail refresh/access tokens before they are
 * stored in Supabase. Uses AES-256-GCM with a per-value random IV; the GCM auth
 * tag guarantees integrity. The key comes from the SERVER-ONLY
 * GMAIL_TOKEN_ENCRYPTION_KEY env var and never leaves the server.
 *
 * Stored format (all base64): `v1:<iv>:<authTag>:<ciphertext>`. The plaintext is
 * never logged; callers must never put a decrypted token into a response,
 * diagnostics, or an audit record.
 */

const FORMAT_VERSION = "v1";

/**
 * Derive a 32-byte key from the configured secret. Accepts a 32-byte base64 or
 * 64-char hex key directly; otherwise hashes the passphrase with SHA-256 so any
 * sufficiently random string works. Never returns or logs the key material.
 */
export function deriveKey(secret: string): Buffer {
  const s = secret.trim();
  if (/^[0-9a-fA-F]{64}$/.test(s)) return Buffer.from(s, "hex");
  try {
    const b = Buffer.from(s, "base64");
    if (b.length === 32) return b;
  } catch {
    // fall through to hashing
  }
  return createHash("sha256").update(s, "utf8").digest();
}

function keyFromEnv(): Buffer {
  const secret = process.env.GMAIL_TOKEN_ENCRYPTION_KEY?.trim();
  if (!secret) throw new Error("GMAIL_TOKEN_ENCRYPTION_KEY is not set.");
  return deriveKey(secret);
}

/** Encrypt a secret with an explicit 32-byte key (used directly by tests). */
export function encryptWithKey(plaintext: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [
    FORMAT_VERSION,
    iv.toString("base64"),
    authTag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

/** Decrypt a value produced by encryptWithKey using an explicit key. */
export function decryptWithKey(payload: string, key: Buffer): string {
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== FORMAT_VERSION) {
    throw new Error("Malformed encrypted payload.");
  }
  const [, ivB64, tagB64, ctB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(tagB64, "base64");
  const ciphertext = Buffer.from(ctB64, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}

/** Encrypt a secret using the configured GMAIL_TOKEN_ENCRYPTION_KEY. */
export function encryptSecret(plaintext: string): string {
  return encryptWithKey(plaintext, keyFromEnv());
}

/** Decrypt a value produced by encryptSecret. */
export function decryptSecret(payload: string): string {
  return decryptWithKey(payload, keyFromEnv());
}
