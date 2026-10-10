import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { gmailConfig } from "@/lib/gmail/config";
import { decryptSecret, encryptSecret } from "@/lib/gmail/crypto";
import { refreshAccessToken, revokeToken, type GoogleTokenResponse } from "@/lib/gmail/oauth";

/**
 * Tenant-scoped Gmail connection management. Every call takes the per-request,
 * RLS-bound Supabase client, so a caller can only ever read or write the
 * connection row for a business they belong to (and only the OWNER can write —
 * enforced by RLS in migration 0011). Tokens are stored ENCRYPTED and decrypted
 * only in-memory here; a plaintext token is never returned to a caller that
 * would persist or render it — `getAccessToken` hands it straight to the Gmail
 * API wrapper.
 */

type Db = SupabaseClient<Database>;

export type ConnectionStatus =
  | { connected: false }
  | { connected: true; email: string; connectedAt: string; scope: string | null };

/** The live (non-revoked) connection row for a business, or null. */
async function loadRow(supabase: Db, businessId: string) {
  const { data } = await supabase
    .from("business_gmail_connections")
    .select("*")
    .eq("business_id", businessId)
    .maybeSingle();
  if (!data || data.revoked_at) return null;
  return data;
}

/** Public, secret-free connection status for the settings UI. */
export async function getConnectionStatus(supabase: Db, businessId: string): Promise<ConnectionStatus> {
  const row = await loadRow(supabase, businessId);
  if (!row) return { connected: false };
  return {
    connected: true,
    email: row.google_account_email,
    connectedAt: row.created_at,
    scope: row.scope,
  };
}

/** Seconds-of-slack before expiry at which we proactively refresh. */
const REFRESH_SKEW_MS = 60_000;

function expiryFromExpiresIn(expiresIn: number | undefined): string | null {
  if (!expiresIn || !Number.isFinite(expiresIn)) return null;
  return new Date(Date.now() + expiresIn * 1000).toISOString();
}

/**
 * Persist tokens for a business after an OAuth code exchange (owner session).
 * Refresh token is kept if Google omits it on a reconnect. Stored encrypted.
 */
export async function storeConnection(
  supabase: Db,
  params: { businessId: string; userId: string; email: string; tokens: GoogleTokenResponse },
): Promise<void> {
  const { businessId, userId, email, tokens } = params;
  const existing = await supabase
    .from("business_gmail_connections")
    .select("refresh_token_encrypted")
    .eq("business_id", businessId)
    .maybeSingle();

  const refreshEncrypted = tokens.refresh_token
    ? encryptSecret(tokens.refresh_token)
    : (existing.data?.refresh_token_encrypted ?? null);

  const { error } = await supabase.from("business_gmail_connections").upsert(
    {
      business_id: businessId,
      google_account_email: email,
      access_token_encrypted: encryptSecret(tokens.access_token),
      refresh_token_encrypted: refreshEncrypted,
      access_token_expires_at: expiryFromExpiresIn(tokens.expires_in),
      scope: tokens.scope ?? null,
      connected_by: userId,
      revoked_at: null,
    },
    { onConflict: "business_id" },
  );
  if (error) throw new Error(`Could not save the Gmail connection: ${error.message}`);
}

/**
 * A valid access token for a business's mailbox, refreshing if it is expired or
 * about to expire. Throws if the business is not connected. The returned token
 * is for immediate use with the Gmail API — never store or log it.
 */
export async function getAccessToken(supabase: Db, businessId: string): Promise<string> {
  const row = await loadRow(supabase, businessId);
  if (!row) throw new Error("This business has not connected a Gmail account.");

  const expiresAt = row.access_token_expires_at ? Date.parse(row.access_token_expires_at) : 0;
  const stillFresh = expiresAt && expiresAt - Date.now() > REFRESH_SKEW_MS;
  if (stillFresh) {
    return decryptSecret(row.access_token_encrypted);
  }

  if (!row.refresh_token_encrypted) {
    // No way to refresh — force a reconnect.
    throw new Error("The Gmail connection has expired. Please reconnect the account.");
  }

  const refreshToken = decryptSecret(row.refresh_token_encrypted);
  const refreshed = await refreshAccessToken(gmailConfig(), refreshToken);

  await supabase
    .from("business_gmail_connections")
    .update({
      access_token_encrypted: encryptSecret(refreshed.access_token),
      access_token_expires_at: expiryFromExpiresIn(refreshed.expires_in),
      scope: refreshed.scope ?? row.scope,
    })
    .eq("business_id", businessId);

  return refreshed.access_token;
}

/**
 * Disconnect a business's mailbox: best-effort revoke at Google, then delete the
 * row so no token survives. Owner-only (enforced by RLS).
 */
export async function disconnect(supabase: Db, businessId: string): Promise<void> {
  const row = await loadRow(supabase, businessId);
  if (row) {
    try {
      if (row.refresh_token_encrypted) await revokeToken(decryptSecret(row.refresh_token_encrypted));
    } catch {
      // best-effort; still remove the local row
    }
  }
  await supabase.from("business_gmail_connections").delete().eq("business_id", businessId);
}
