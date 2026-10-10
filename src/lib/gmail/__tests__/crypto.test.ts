import { randomBytes } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { decryptSecret, decryptWithKey, deriveKey, encryptSecret, encryptWithKey } from "@/lib/gmail/crypto";

const savedKey = process.env.GMAIL_TOKEN_ENCRYPTION_KEY;
afterEach(() => {
  if (savedKey === undefined) delete process.env.GMAIL_TOKEN_ENCRYPTION_KEY;
  else process.env.GMAIL_TOKEN_ENCRYPTION_KEY = savedKey;
});

describe("deriveKey", () => {
  it("accepts 64-hex, base64-32, or hashes a passphrase — always 32 bytes", () => {
    expect(deriveKey("a".repeat(64)).length).toBe(32);
    expect(deriveKey(randomBytes(32).toString("base64")).length).toBe(32);
    expect(deriveKey("any sufficiently long passphrase").length).toBe(32);
  });
});

describe("encrypt/decrypt with explicit key", () => {
  it("round-trips a token", () => {
    const key = randomBytes(32);
    const token = "ya29.a0ExampleAccessToken-with_symbols.123";
    const enc = encryptWithKey(token, key);
    expect(enc.startsWith("v1:")).toBe(true);
    expect(enc).not.toContain(token); // ciphertext never contains the plaintext
    expect(decryptWithKey(enc, key)).toBe(token);
  });

  it("fails authentication when the ciphertext is tampered with", () => {
    const key = randomBytes(32);
    const enc = encryptWithKey("secret", key);
    const parts = enc.split(":");
    parts[3] = Buffer.from("tampered").toString("base64");
    expect(() => decryptWithKey(parts.join(":"), key)).toThrow();
  });

  it("rejects a malformed payload", () => {
    expect(() => decryptWithKey("not-a-valid-payload", randomBytes(32))).toThrow();
  });
});

describe("encryptSecret/decryptSecret via env key", () => {
  it("round-trips using GMAIL_TOKEN_ENCRYPTION_KEY", () => {
    process.env.GMAIL_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("hex");
    const enc = encryptSecret("refresh-token-value");
    expect(decryptSecret(enc)).toBe("refresh-token-value");
  });

  it("throws when the key is not configured", () => {
    delete process.env.GMAIL_TOKEN_ENCRYPTION_KEY;
    expect(() => encryptSecret("x")).toThrow(/GMAIL_TOKEN_ENCRYPTION_KEY/);
  });
});
