import "server-only";

import { GmailApiError, getProfile, listHistory } from "@/lib/gmail/api";
import { getAccessToken } from "@/lib/gmail/connection";
import { ingestMessage } from "@/lib/gmail/ingest";
import { syncInbox } from "@/lib/gmail/sync";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Reliable new-mail retrieval via the Gmail History API. Given a mailbox's
 * stored history cursor (business_gmail_connections.history_id), list every
 * message added since then and ingest each. The push webhook calls this on a
 * Pub/Sub notification; the maintenance cron calls it for every mailbox as a
 * FALLBACK that catches notifications Pub/Sub dropped.
 *
 * Correctness details:
 *   - No cursor yet → seed via a bounded inbox sync, then record the current
 *     profile historyId so the next run is incremental.
 *   - Cursor too old (Gmail 404 on history.list) → the cursor expired; fall
 *     back to a bounded inbox sync and reseed the cursor.
 *   - The cursor only advances after messages are ingested, so a mid-run failure
 *     is retried next time rather than silently skipping mail.
 */

const MAX_HISTORY_PAGES = 10;

function adminDb() {
  const a = createAdminClient();
  if (!a) throw new Error("History sync requires SUPABASE_SERVICE_ROLE_KEY to be configured.");
  return a;
}

export type HistoryResult = {
  mode: "incremental" | "seeded" | "reset" | "noop";
  stored: number;
  skipped: number;
  self: number;
  newHistoryId: string | null;
};

async function recordCursor(businessId: string, historyId: string | null): Promise<void> {
  await adminDb()
    .from("business_gmail_connections")
    .update({
      ...(historyId ? { history_id: historyId } : {}),
      last_synced_at: new Date().toISOString(),
    })
    .eq("business_id", businessId);
}

export async function processHistory(businessId: string): Promise<HistoryResult> {
  const db = adminDb();
  const { data: conn } = await db
    .from("business_gmail_connections")
    .select("google_account_email, history_id, revoked_at")
    .eq("business_id", businessId)
    .maybeSingle();
  if (!conn || conn.revoked_at) return { mode: "noop", stored: 0, skipped: 0, self: 0, newHistoryId: null };

  const accessToken = await getAccessToken(businessId);
  const mailbox = conn.google_account_email;

  // No cursor → seed from a bounded inbox sync and record the current historyId.
  if (!conn.history_id) {
    const res = await syncInbox(businessId, { maxResults: 25 });
    const profile = await getProfile(accessToken).catch(() => null);
    await recordCursor(businessId, profile?.historyId ?? null);
    return { mode: "seeded", stored: res.stored, skipped: res.skipped, self: 0, newHistoryId: profile?.historyId ?? null };
  }

  // Incremental: walk history.list from the stored cursor.
  const addedIds = new Set<string>();
  let pageToken: string | undefined;
  let latestHistoryId: string | null = conn.history_id;
  try {
    for (let page = 0; page < MAX_HISTORY_PAGES; page++) {
      const res = await listHistory(accessToken, { startHistoryId: conn.history_id, pageToken });
      if (res.historyId) latestHistoryId = res.historyId;
      for (const h of res.history ?? []) {
        for (const m of h.messagesAdded ?? []) {
          const labels = m.message.labelIds ?? [];
          if (labels.includes("SENT") || labels.includes("DRAFT")) continue;
          addedIds.add(m.message.id);
        }
      }
      if (!res.nextPageToken) break;
      pageToken = res.nextPageToken;
    }
  } catch (error) {
    // 404 ⇒ the startHistoryId is too old / expired. Reset: bounded resync +
    // reseed the cursor from the current profile.
    if (error instanceof GmailApiError && error.status === 404) {
      const res = await syncInbox(businessId, { maxResults: 25 });
      const profile = await getProfile(accessToken).catch(() => null);
      await recordCursor(businessId, profile?.historyId ?? null);
      return { mode: "reset", stored: res.stored, skipped: res.skipped, self: 0, newHistoryId: profile?.historyId ?? null };
    }
    throw error;
  }

  let stored = 0;
  let skipped = 0;
  let self = 0;
  for (const id of addedIds) {
    const outcome = await ingestMessage(db, businessId, accessToken, id, mailbox);
    if (outcome === "stored") stored++;
    else if (outcome === "self") self++;
    else skipped++;
  }

  // Advance the cursor only after ingest, so a failure is retried next run.
  await recordCursor(businessId, latestHistoryId);
  return { mode: "incremental", stored, skipped, self, newHistoryId: latestHistoryId };
}
