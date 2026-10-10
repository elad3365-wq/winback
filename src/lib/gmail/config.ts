import "server-only";

/**
 * Per-business Gmail integration config for the WinBack customer app.
 *
 * This is a SEPARATE Google OAuth client from WinBack Ops — these env vars live
 * in the customer app's own project and must never be shared with Ops. Every
 * value is read on the SERVER only; the client secret and token-encryption key
 * must never appear in NEXT_PUBLIC_* vars, UI, logs, or diagnostics.
 *
 * Scopes are the NARROWEST that cover the product:
 *   - gmail.readonly — read the business's own inbox messages + profile.
 *   - gmail.send     — send the approved reply.
 * We do NOT request https://mail.google.com/ or gmail.modify.
 *
 * The whole feature is gated behind WINBACK_GMAIL_ENABLED so it stays inert
 * until an operator explicitly turns it on AND the OAuth/encryption vars exist.
 */

export const GMAIL_SCOPE_READONLY = "https://www.googleapis.com/auth/gmail.readonly";
export const GMAIL_SCOPE_SEND = "https://www.googleapis.com/auth/gmail.send";

/** The scopes requested during OAuth — least privilege for read + reply. */
export const GMAIL_REQUESTED_SCOPES = [GMAIL_SCOPE_READONLY, GMAIL_SCOPE_SEND];

export type GmailConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  encryptionKey: string;
};

export type GmailConfigField =
  | "GOOGLE_GMAIL_CLIENT_ID"
  | "GOOGLE_GMAIL_CLIENT_SECRET"
  | "GOOGLE_GMAIL_REDIRECT_URI"
  | "GMAIL_TOKEN_ENCRYPTION_KEY";

function trimmed(name: GmailConfigField): string {
  return process.env[name]?.trim() ?? "";
}

/** True when the four required Gmail OAuth/encryption vars are all present. */
export function isGmailConfigured(): boolean {
  return (
    Boolean(trimmed("GOOGLE_GMAIL_CLIENT_ID")) &&
    Boolean(trimmed("GOOGLE_GMAIL_CLIENT_SECRET")) &&
    Boolean(trimmed("GOOGLE_GMAIL_REDIRECT_URI")) &&
    Boolean(trimmed("GMAIL_TOKEN_ENCRYPTION_KEY"))
  );
}

/** The names (never values) of any required Gmail config vars that are missing. */
export function gmailMissingConfig(): GmailConfigField[] {
  const fields: GmailConfigField[] = [
    "GOOGLE_GMAIL_CLIENT_ID",
    "GOOGLE_GMAIL_CLIENT_SECRET",
    "GOOGLE_GMAIL_REDIRECT_URI",
    "GMAIL_TOKEN_ENCRYPTION_KEY",
  ];
  return fields.filter((f) => !trimmed(f));
}

/** Read the Gmail config, throwing a safe (secret-free) error if incomplete. */
export function gmailConfig(): GmailConfig {
  const missing = gmailMissingConfig();
  if (missing.length > 0) {
    throw new Error(`Gmail is not configured (missing ${missing.join(", ")}).`);
  }
  return {
    clientId: trimmed("GOOGLE_GMAIL_CLIENT_ID"),
    clientSecret: trimmed("GOOGLE_GMAIL_CLIENT_SECRET"),
    redirectUri: trimmed("GOOGLE_GMAIL_REDIRECT_URI"),
    encryptionKey: trimmed("GMAIL_TOKEN_ENCRYPTION_KEY"),
  };
}

/**
 * Master feature flag. The per-business Gmail UI and routes do nothing unless
 * this is explicitly "true" AND the OAuth/encryption vars are present. Default
 * OFF so production and un-provisioned environments are unaffected.
 */
export function isGmailFeatureEnabled(): boolean {
  return process.env.WINBACK_GMAIL_ENABLED?.trim() === "true" && isGmailConfigured();
}
