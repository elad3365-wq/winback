import "server-only";

import { getProfile, stopWatch, watchMailbox } from "@/lib/gmail/api";
import { gmailPushTopic } from "@/lib/gmail/config";
import { getAccessToken } from "@/lib/gmail/connection";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Gmail push-watch lifecycle. A Gmail watch (users.watch) tells Google to
 * publish a Pub/Sub notification whenever the mailbox changes; it expires after
 * ~7 days, so it must be renewed regularly (the daily maintenance cron does
 * this well before expiry). All writes go through the SERVICE ROLE — the caller
 * must have authorized the business first. `needsRenewal` is pure for testing.
 */

const DEFAULT_RENEW_WITHIN_MS = 2 * 24 * 60 * 60 * 1000; // renew when <2 days left

function adminDb() {
  const a = createAdminClient();
  if (!a) throw new Error("Gmail watch requires SUPABASE_SERVICE_ROLE_KEY to be configured.");
  return a;
}

/** True when a watch is missing, unparsable, or within the renewal window. */
export function needsRenewal(
  expiration: string | null,
  now: Date,
  thresholdMs: number = DEFAULT_RENEW_WITHIN_MS,
): boolean {
  if (!expiration) return true;
  const t = Date.parse(expiration);
  if (!Number.isFinite(t)) return true;
  return t - now.getTime() <= thresholdMs;
}

export type WatchState = { historyId: string; expiration: string };

/**
 * Register/refresh a mailbox watch against the configured Pub/Sub topic. Seeds
 * the history cursor (history_id) when it's not already set, so the first
 * notification has a valid startHistoryId. Returns null when push isn't
 * configured (no topic) — callers then rely on cron reconciliation.
 */
export async function startWatch(businessId: string): Promise<WatchState | null> {
  const topic = gmailPushTopic();
  if (!topic) return null;

  const accessToken = await getAccessToken(businessId);
  const result = await watchMailbox(accessToken, topic);
  // Gmail returns expiration as epoch-millis (string). Store as timestamptz.
  const expMs = Number(result.expiration);
  const expirationIso = Number.isFinite(expMs) ? new Date(expMs).toISOString() : null;

  const db = adminDb();
  const { data: conn } = await db
    .from("business_gmail_connections")
    .select("history_id")
    .eq("business_id", businessId)
    .maybeSingle();

  const nowIso = new Date().toISOString();
  const patch: {
    watch_expiration: string | null;
    watch_topic: string;
    watch_last_renewed_at: string;
    history_id?: string;
  } = { watch_expiration: expirationIso, watch_topic: topic, watch_last_renewed_at: nowIso };
  if (!conn?.history_id) patch.history_id = result.historyId;

  await db.from("business_gmail_connections").update(patch).eq("business_id", businessId);
  return { historyId: result.historyId, expiration: expirationIso ?? "" };
}

/** Renew the watch if it's missing or near expiry. Returns true if it renewed. */
export async function renewWatchIfNeeded(
  businessId: string,
  expiration: string | null,
  now: Date,
): Promise<boolean> {
  if (!gmailPushTopic()) return false;
  if (!needsRenewal(expiration, now)) return false;
  await startWatch(businessId);
  return true;
}

/** Stop the mailbox watch (best-effort) and clear local watch state. */
export async function stopWatchForBusiness(businessId: string): Promise<void> {
  try {
    const accessToken = await getAccessToken(businessId);
    await stopWatch(accessToken);
  } catch {
    // best-effort — clear local state regardless
  }
  await adminDb()
    .from("business_gmail_connections")
    .update({ watch_expiration: null, watch_topic: null })
    .eq("business_id", businessId);
}

/** Current mailbox historyId from Gmail (used to seed the cursor after a reset). */
export async function currentHistoryId(businessId: string): Promise<string | null> {
  try {
    const accessToken = await getAccessToken(businessId);
    const profile = await getProfile(accessToken);
    return profile.historyId ?? null;
  } catch {
    return null;
  }
}
