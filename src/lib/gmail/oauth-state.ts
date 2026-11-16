import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { deriveKey } from "@/lib/gmail/crypto";

/**
 * Stateless, signed OAuth `state` parameter for the Gmail connect flow. It binds
 * the round trip to one business (and the user who started it) and carries a
 * nonce + timestamp, HMAC-signed with a key derived from
 * GMAIL_TOKEN_ENCRYPTION_KEY. This defeats CSRF (an attacker can't forge a valid
 * state) and mix-ups (the callback only ever writes the business named in the
 * signed state), without needing a DB table.
 *
 * Format: base64url(JSON payload) + "." + base64url(HMAC-SHA256 of that payload).
 */

const MAX_AGE_MS = 10 * 60_000; // a consent round trip should take well under 10 min

export type OAuthState = {
  businessId: string;
  userId: string;
  iat: number; // ms epoch
  nonce: string;
};

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function signingKey(): Buffer {
  const secret = process.env.GMAIL_TOKEN_ENCRYPTION_KEY?.trim();
  if (!secret) throw new Error("GMAIL_TOKEN_ENCRYPTION_KEY is not set.");
  // Namespaced so the state-signing key is not literally the encryption key.
  return deriveKey(`oauth-state:${secret}`);
}

function sign(payloadB64: string): string {
  return b64url(createHmac("sha256", signingKey()).update(payloadB64).digest());
}

/** Create a signed state string for a connect attempt. */
export function createState(businessId: string, userId: string): string {
  const payload: OAuthState = { businessId, userId, iat: Date.now(), nonce: randomBytes(12).toString("hex") };
  const payloadB64 = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  return `${payloadB64}.${sign(payloadB64)}`;
}

/**
 * Verify a state string and return its payload, or null if the signature is
 * invalid, malformed, or expired. Never throws on bad input.
 */
export function verifyState(state: string | null | undefined): OAuthState | null {
  if (!state || typeof state !== "string") return null;
  const dot = state.indexOf(".");
  if (dot <= 0) return null;
  const payloadB64 = state.slice(0, dot);
  const sig = state.slice(dot + 1);

  const expected = sign(payloadB64);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let payload: OAuthState;
  try {
    payload = JSON.parse(fromB64url(payloadB64).toString("utf8")) as OAuthState;
  } catch {
    return null;
  }
  if (!payload || typeof payload.businessId !== "string" || typeof payload.iat !== "number") return null;
  if (Date.now() - payload.iat > MAX_AGE_MS) return null;
  return payload;
}
