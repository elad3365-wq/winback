import "server-only";

import { GMAIL_REQUESTED_SCOPES, type GmailConfig } from "@/lib/gmail/config";

/**
 * Google OAuth 2.0 web-server flow helpers. Pure functions that take the config
 * explicitly so they can be unit-tested with a mocked fetch. No secret is ever
 * logged; the client secret is only sent in the token request body to Google.
 */

const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";

export type GoogleTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  id_token?: string;
};

/**
 * Build the Google consent URL. Uses access_type=offline (so Google returns a
 * refresh token), include_granted_scopes=true (incremental auth), and
 * prompt=consent (so a refresh token is re-issued on reconnect).
 */
export function buildAuthUrl(
  config: GmailConfig,
  state: string,
  scopes: string[] = GMAIL_REQUESTED_SCOPES,
): string {
  const url = new URL(GOOGLE_AUTH_ENDPOINT);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", scopes.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  return url.toString();
}

async function postForm(endpoint: string, body: Record<string, string>): Promise<Response> {
  return fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
    cache: "no-store",
  });
}

async function readTokenResponse(res: Response): Promise<GoogleTokenResponse> {
  const data = (await res.json().catch(() => null)) as
    | (GoogleTokenResponse & { error?: string; error_description?: string })
    | null;
  if (!res.ok || !data || !data.access_token) {
    // Surface Google's error CODE/description only — never request bodies/secrets.
    const code = data?.error ?? `http_${res.status}`;
    const desc = data?.error_description ? `: ${data.error_description}` : "";
    throw new Error(`Google token request failed (${code}${desc}).`);
  }
  return data;
}

/** Exchange an authorization code for tokens (access + refresh). */
export async function exchangeCodeForTokens(
  config: GmailConfig,
  code: string,
): Promise<GoogleTokenResponse> {
  const res = await postForm(GOOGLE_TOKEN_ENDPOINT, {
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    grant_type: "authorization_code",
  });
  return readTokenResponse(res);
}

/** Use a refresh token to obtain a fresh access token. */
export async function refreshAccessToken(
  config: GmailConfig,
  refreshToken: string,
): Promise<GoogleTokenResponse> {
  const res = await postForm(GOOGLE_TOKEN_ENDPOINT, {
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  return readTokenResponse(res);
}

/** Best-effort revoke of a token at Google (used on Disconnect). */
export async function revokeToken(token: string): Promise<boolean> {
  try {
    const res = await postForm(GOOGLE_REVOKE_ENDPOINT, { token });
    return res.ok;
  } catch {
    return false;
  }
}

/** Parse a space-separated scope string into a clean array. */
export function parseScopes(scope: string | undefined | null): string[] {
  if (!scope) return [];
  return scope
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
