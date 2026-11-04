import "server-only";

import { processHistory } from "@/lib/gmail/history";
import { renewWatchIfNeeded } from "@/lib/gmail/watch";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Daily Gmail upkeep for every connected mailbox, run by the maintenance cron:
 *   1. Renew any watch that's missing or near expiry (watches last ~7 days), so
 *      real-time push keeps flowing (requirement: renew at least every 7 days).
 *   2. Reconcile via the History API — the FALLBACK that catches any Pub/Sub
 *      notification that was dropped or never delivered, so no mail is missed.
 * Each mailbox is independent and best-effort: one failing mailbox never stops
 * the others. The maintenance cron then drains the queue for anything enqueued.
 */

export type MaintenanceSummary = {
  connections: number;
  renewed: number;
  reconciledStored: number;
  errors: number;
};

export async function runGmailMaintenance(): Promise<MaintenanceSummary> {
  const db = createAdminClient();
  if (!db) throw new Error("Gmail maintenance requires SUPABASE_SERVICE_ROLE_KEY to be configured.");

  const { data: connections } = await db
    .from("business_gmail_connections")
    .select("business_id, watch_expiration, revoked_at")
    .is("revoked_at", null);

  const summary: MaintenanceSummary = { connections: 0, renewed: 0, reconciledStored: 0, errors: 0 };
  const now = new Date();

  for (const conn of connections ?? []) {
    summary.connections++;
    try {
      if (await renewWatchIfNeeded(conn.business_id, conn.watch_expiration, now)) summary.renewed++;
    } catch {
      summary.errors++;
    }
    try {
      const res = await processHistory(conn.business_id);
      summary.reconciledStored += res.stored;
    } catch {
      summary.errors++;
    }
  }

  return summary;
}
