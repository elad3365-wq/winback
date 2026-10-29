import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { headers } from "next/headers";

import { GMAIL_CALLBACK_PATH } from "@/lib/gmail/config";

/**
 * The short-lived cookie that ties Google's redirect back to the click that
 * started it: a random state (CSRF), the PKCE verifier, the business being
 * connected and the exact redirect URI. httpOnly, ten minutes, and only sent to
 * the callback path.
 */

export const GMAIL_OAUTH_COOKIE = "winback_gmail_oauth";

export type GmailOAuthState = {
  state: string;
  verifier: string;
  businessId: string;
  redirectUri: string;
};

export function newOAuthState(businessId: string, redirectUri: string) {
  const state = randomBytes(24).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const value: GmailOAuthState = { state, verifier, businessId, redirectUri };
  return { value, challenge };
}

export const GMAIL_OAUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: GMAIL_CALLBACK_PATH,
  maxAge: 10 * 60,
};

export function readOAuthState(raw: string | undefined): GmailOAuthState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Partial<GmailOAuthState>;
    if (!parsed.state || !parsed.verifier || !parsed.businessId || !parsed.redirectUri) return null;
    return parsed as GmailOAuthState;
  } catch {
    return null;
  }
}

export function encodeOAuthState(value: GmailOAuthState): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

/**
 * The callback on the host this request arrived on. Unlike getSiteUrl(), a
 * preview deployment keeps its own domain here, so connecting Gmail on a
 * preview comes back to that preview, never to production.
 */
export async function gmailRedirectUri(): Promise<string> {
  const list = await headers();
  const host = list.get("x-forwarded-host") ?? list.get("host") ?? "localhost:3000";
  const proto =
    list.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
    (/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) ? "http" : "https");
  return `${proto}://${host}${GMAIL_CALLBACK_PATH}`;
}
