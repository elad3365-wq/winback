import "server-only";

import { listInboxMessages } from "@/lib/gmail/api";
import { getAccessToken } from "@/lib/gmail/connection";
import { ingestMessage } from "@/lib/gmail/ingest";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Pull recent INBOX messages for a business's connected mailbox and store any
 * not seen before (via the shared, loop-safe `ingestMessage`). Written with the
 * SERVICE ROLE, so this must only run after the caller has authorized the
 * business. Idempotent: a message is stored at most once even under a race.
 *
 * This is the reliable FALLBACK path — the push/history path is the real-time
 * one, and the daily maintenance cron calls history reconciliation which seeds
 * itself from here on first run.
 */

export type SyncResult = { fetched: number; stored: number; skipped: number };

export async function syncInbox(businessId: string, opts: { maxResults?: number } = {}): Promise<SyncResult> {
  const db = createAdminClient();
  if (!db) throw new Error("Inbox sync requires SUPABASE_SERVICE_ROLE_KEY to be configured.");

  const { data: conn } = await db
    .from("business_gmail_connections")
    .select("google_account_email")
    .eq("business_id", businessId)
    .maybeSingle();

  const accessToken = await getAccessToken(businessId);
  const list = await listInboxMessages(accessToken, { maxResults: opts.maxResults ?? 25 });
  const ids = (list.messages ?? []).map((m) => m.id);

  let stored = 0;
  let skipped = 0;
  for (const id of ids) {
    const outcome = await ingestMessage(db, businessId, accessToken, id, conn?.google_account_email ?? null);
    if (outcome === "stored") stored++;
    else skipped++;
  }

  return { fetched: ids.length, stored, skipped };
}
