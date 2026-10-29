import "server-only";

import { GMAIL_SCOPES, type GmailOAuthConfig } from "@/lib/gmail/config";
import type { GmailMessage } from "@/lib/gmail/mime";

/**
 * Thin wrappers over Google's OAuth and Gmail REST endpoints, using fetch so
 * no Google SDK is needed. Access tokens are never stored: each sync or send
 * trades the encrypted refresh token for a fresh one-hour access token.
 */

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

/** Google said the refresh token is no longer valid (revoked, expired test grant, password change). */
export class GmailAuthRevokedError extends Error {
  constructor(detail: string) {
    super(`Google no longer accepts this connection: ${detail}`);
    this.name = "GmailAuthRevokedError";
  }
}

export function buildAuthUrl(input: {
  config: GmailOAuthConfig;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  loginHint?: string | null;
}): string {
  const params = new URLSearchParams({
    client_id: input.config.clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    scope: GMAIL_SCOPES.join(" "),
    // offline + consent: Google returns a refresh token every time, so a
    // reconnect always replaces a dead token with a working one.
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "false",
    state: input.state,
    code_challenge: input.codeChallenge,
    code_challenge_method: "S256",
  });
  if (input.loginHint) params.set("login_hint", input.loginHint);
  return `${AUTH_URL}?${params.toString()}`;
}

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  scope?: string;
  error?: string;
  error_description?: string;
};

async function postToken(body: Record<string, string>): Promise<TokenResponse> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
    cache: "no-store",
  });
  const data = (await response.json().catch(() => ({}))) as TokenResponse;
  if (!response.ok && !data.error) data.error = `http_${response.status}`;
  return data;
}

export async function exchangeCode(input: {
  config: GmailOAuthConfig;
  code: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<{ accessToken: string; refreshToken: string; scope: string }> {
  const data = await postToken({
    code: input.code,
    client_id: input.config.clientId,
    client_secret: input.config.clientSecret,
    redirect_uri: input.redirectUri,
    grant_type: "authorization_code",
    code_verifier: input.codeVerifier,
  });
  if (data.error || !data.access_token) {
    throw new Error(`Google refused the code: ${data.error ?? "no access token"} ${data.error_description ?? ""}`.trim());
  }
  if (!data.refresh_token) {
    throw new Error("Google did not return a refresh token.");
  }
  return { accessToken: data.access_token, refreshToken: data.refresh_token, scope: data.scope ?? "" };
}

export async function refreshAccessToken(config: GmailOAuthConfig, refreshToken: string): Promise<string> {
  const data = await postToken({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  if (data.error === "invalid_grant") {
    throw new GmailAuthRevokedError(data.error_description ?? data.error);
  }
  if (data.error || !data.access_token) {
    throw new Error(`Could not refresh the Gmail token: ${data.error ?? "no access token"}`);
  }
  return data.access_token;
}

/** Best effort: tells Google to forget the grant when a business disconnects. */
export async function revokeToken(token: string): Promise<void> {
  try {
    await fetch(REVOKE_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }).toString(),
      cache: "no-store",
    });
  } catch {
    // The local secret is deleted either way.
  }
}

async function gmail<T>(accessToken: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${GMAIL_API}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  if (response.status === 401) {
    throw new GmailAuthRevokedError("access token rejected");
  }
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Gmail API ${response.status}: ${text.slice(0, 300)}`);
  }
  return (await response.json()) as T;
}

export async function getProfileEmail(accessToken: string): Promise<string> {
  const profile = await gmail<{ emailAddress?: string }>(accessToken, "/profile");
  if (!profile.emailAddress) throw new Error("Gmail did not return the inbox address.");
  return profile.emailAddress.toLowerCase();
}

/** Ids of inbox messages newer than `afterEpochSeconds`, newest first. */
export async function listInboxMessageIds(
  accessToken: string,
  afterEpochSeconds: number,
  max: number,
): Promise<string[]> {
  const params = new URLSearchParams({
    q: `in:inbox -from:me -category:promotions -category:social after:${afterEpochSeconds}`,
    maxResults: String(max),
  });
  const data = await gmail<{ messages?: { id: string }[] }>(accessToken, `/messages?${params}`);
  return (data.messages ?? []).map((m) => m.id);
}

export async function getMessage(accessToken: string, id: string): Promise<GmailMessage> {
  return gmail<GmailMessage>(accessToken, `/messages/${encodeURIComponent(id)}?format=full`);
}

export async function sendRaw(
  accessToken: string,
  raw: string,
  threadId: string | null,
): Promise<{ id: string; threadId: string }> {
  return gmail<{ id: string; threadId: string }>(accessToken, "/messages/send", {
    method: "POST",
    body: JSON.stringify(threadId ? { raw, threadId } : { raw }),
  });
}
