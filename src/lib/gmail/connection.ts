import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { gmailConfig } from "@/lib/gmail/config";
import { decryptSecret, encryptSecret } from "@/lib/gmail/crypto";
import { refreshAccessToken, revokeToken, type GoogleTokenResponse } from "@/lib/gmail/oauth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Tenant-scoped Gmail connection management.
 *
 * SECURITY: the encrypted token columns are server-only — authenticated users
 * have no SELECT/INSERT/UPDATE on them (see migration 0011). All token
 * read/write/refresh/disconnect therefore runs through the SERVICE ROLE (admin)
 * client here, never the user session. Callers must authorize the business
 * first (owner/membership) before invoking these — the admin client bypasses
 * RLS, so these functions always filter explicitly by business_id. A decrypted
 * token is only ever handed to the Gmail API wrapper and never returned to a
 * caller that would persist or render it.
 *
 * `getConnectionStatus` is the one read safe for the user session: it selects
 * only non-secret status columns (which authenticated may read under RLS).
 */

type Db = SupabaseClient<Database>;

export type ConnectionStatus =
  | { connected: false }
  | { connected: true; email: string; connectedAt: string; scope: string | null };

function adminDb(): Db {
  const a = createAdminClient();
  if (!a) {
    throw new Error("Gmail server operations require SUPABASE_SERVICE_ROLE_KEY to be configured.");
  }
  return a;
}

/** Public, secret-free connection status for the settings UI (user session, RLS). */
export async function getConnectionStatus(userClient: Db, businessId: string): Promise<ConnectionStatus> {
  const { data } = await userClient
    .from("business_gmail_connections")
    .select("google_account_email, scope, created_at, revoked_at")
    .eq("business_id", businessId)
    .maybeSingle();
  if (!data || data.revoked_at) return { connected: false };
  return { connected: true, email: data.google_account_email, connectedAt: data.created_at, scope: data.scope };
}

/** Full (token-bearing) row via the service role. Server-only. */
async function loadRow(businessId: string) {
  const { data } = await adminDb()
    .from("business_gmail_connections")
    .select("*")
    .eq("business_id", businessId)
    .maybeSingle();
  if (!data || data.revoked_at) return null;
  return data;
}

const REFRESH_SKEW_MS = 60_000;

function expiryFromExpiresIn(expiresIn: number | undefined): string | null {
  if (!expiresIn || !Number.isFinite(expiresIn)) return null;
  return new Date(Date.now() + expiresIn * 1000).toISOString();
}

/**
 * Persist tokens after an OAuth code exchange. Caller must have verified the
 * user is the business OWNER. Written with the service role (users have no
 * write access to token columns). Refresh token kept if Google omits it.
 */
export async function storeConnection(params: {
  businessId: string;
  userId: string;
  email: string;
  tokens: GoogleTokenResponse;
}): Promise<void> {
  const { businessId, userId, email, tokens } = params;
  const db = adminDb();

  const existing = await db
    .from("business_gmail_connections")
    .select("refresh_token_encrypted")
    .eq("business_id", businessId)
    .maybeSingle();

  const refreshEncrypted = tokens.refresh_token
    ? encryptSecret(tokens.refresh_token)
    : (existing.data?.refresh_token_encrypted ?? null);

  const { error } = await db.from("business_gmail_connections").upsert(
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
 * A valid access token for a business's mailbox, refreshing if expired. Server-
 * only (service role). The returned token is for immediate Gmail API use —
 * never store or log it. Caller must have authorized the business.
 */
export async function getAccessToken(businessId: string): Promise<string> {
  const row = await loadRow(businessId);
  if (!row) throw new Error("This business has not connected a Gmail account.");

  const expiresAt = row.access_token_expires_at ? Date.parse(row.access_token_expires_at) : 0;
  if (expiresAt && expiresAt - Date.now() > REFRESH_SKEW_MS) {
    return decryptSecret(row.access_token_encrypted);
  }
  if (!row.refresh_token_encrypted) {
    throw new Error("The Gmail connection has expired. Please reconnect the account.");
  }

  const refreshed = await refreshAccessToken(gmailConfig(), decryptSecret(row.refresh_token_encrypted));
  await adminDb()
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
 * row. Server-only (service role). Caller must have verified OWNER.
 */
export async function disconnect(businessId: string): Promise<void> {
  const row = await loadRow(businessId);
  if (row?.refresh_token_encrypted) {
    try {
      await revokeToken(decryptSecret(row.refresh_token_encrypted));
    } catch {
      // best-effort; still remove the local row
    }
  }
  await adminDb().from("business_gmail_connections").delete().eq("business_id", businessId);
}
