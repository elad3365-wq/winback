import "server-only";

import { parseTokenKey } from "@/lib/gmail/crypto";

/**
 * Server-only Gmail settings, all read from environment variables that elad
 * sets in Vercel. None of them has a NEXT_PUBLIC_ prefix, so none reaches the
 * browser.
 *
 *   GOOGLE_GMAIL_CLIENT_ID / GOOGLE_GMAIL_CLIENT_SECRET
 *       The Google OAuth client WinBack uses to ask for inbox access.
 *   GMAIL_TOKEN_ENCRYPTION_KEY
 *       32 random bytes, base64. Encrypts refresh tokens at rest.
 *   GMAIL_SENDING_ENABLED
 *       Must be exactly "true" before an approved draft can be sent. Anything
 *       else (or unset) keeps WinBack read-only: inbox sync and AI drafts work,
 *       the Approve and send button explains that sending is switched off.
 */

/** Read the inbox, and send only the replies a person approves. Nothing else. */
export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
] as const;

export type GmailOAuthConfig = { clientId: string; clientSecret: string };

export function getGmailOAuthConfig(): GmailOAuthConfig | null {
  const clientId = process.env.GOOGLE_GMAIL_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_GMAIL_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function getTokenKey(): Buffer {
  return parseTokenKey(process.env.GMAIL_TOKEN_ENCRYPTION_KEY);
}

/** Everything needed to connect an inbox: OAuth client, token key and the service role. */
export function gmailSetupProblems(): string[] {
  const problems: string[] = [];
  if (!getGmailOAuthConfig()) problems.push("GOOGLE_GMAIL_CLIENT_ID and GOOGLE_GMAIL_CLIENT_SECRET");
  try {
    getTokenKey();
  } catch {
    problems.push("GMAIL_TOKEN_ENCRYPTION_KEY");
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) problems.push("SUPABASE_SERVICE_ROLE_KEY");
  return problems;
}

export function isGmailSendingEnabled(): boolean {
  return process.env.GMAIL_SENDING_ENABLED?.trim() === "true";
}

/** The path Google sends the browser back to. Under /auth so the proxy lets the `code` through. */
export const GMAIL_CALLBACK_PATH = "/auth/gmail/callback";
