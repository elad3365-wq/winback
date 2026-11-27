import { timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { drainQueue } from "@/lib/ai/autopilot/worker";
import { gmailPushToken, isGmailFeatureEnabled, isGmailPushConfigured } from "@/lib/gmail/config";
import { processHistory } from "@/lib/gmail/history";
import { escapeLikePattern, parsePubSubPush } from "@/lib/gmail/parse";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Gmail → Pub/Sub → WinBack push webhook. Google Cloud Pub/Sub POSTs here every
 * time a watched mailbox changes; we pull the new mail via the History API and
 * process it immediately (real-time, not waiting for the daily cron).
 *
 * SECURITY: the endpoint is authenticated by a high-entropy shared secret the
 * push subscription carries as `?token=…` (constant-time compared). Without an
 * exact match the request is rejected. The emailAddress in the envelope is used
 * only to find the matching connection; all data access is service-role and
 * scoped by business_id. We ACK (2xx) malformed/unknown payloads so Pub/Sub
 * doesn't hammer us with retries, and only 401 a bad token.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function tokenMatches(provided: string | null): boolean {
  const expected = gmailPushToken();
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  // Inert unless the feature and push are configured. ACK so Pub/Sub stops.
  if (!isGmailFeatureEnabled() || !isGmailPushConfigured()) {
    return NextResponse.json({ ok: true, ignored: "not_configured" }, { status: 200 });
  }

  if (!tokenMatches(request.nextUrl.searchParams.get("token"))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as unknown;
  const note = parsePubSubPush(body);
  if (!note) return NextResponse.json({ ok: true, ignored: "malformed" }, { status: 200 });

  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: "Service role not configured." }, { status: 503 });

  const email = note.emailAddress.trim().toLowerCase();
  // Case-insensitive exact match. The same mailbox may be connected to more
  // than one business (an owner with two workspaces) — process each of them.
  const { data: conns, error: lookupError } = await db
    .from("business_gmail_connections")
    .select("business_id, revoked_at")
    .ilike("google_account_email", escapeLikePattern(email))
    .is("revoked_at", null);
  if (lookupError) {
    console.error("[gmail/push] connection lookup failed", lookupError.message);
    return NextResponse.json({ error: "Lookup failed." }, { status: 500 });
  }
  if (!conns || conns.length === 0) return NextResponse.json({ ok: true, ignored: "unknown_mailbox" }, { status: 200 });

  let stored = 0;
  let failed = 0;
  for (const conn of conns) {
    try {
      const history = await processHistory(conn.business_id);
      stored += history.stored;
    } catch (error) {
      failed++;
      console.error("[gmail/push] history processing failed", error instanceof Error ? error.message : error);
    }
  }
  // Every mailbox failed → transient: 500 so Pub/Sub retries with backoff (the
  // daily cron reconciles too). Error details stay in the server log.
  if (failed === conns.length) return NextResponse.json({ error: "Processing failed." }, { status: 500 });

  try {
    // Trigger the worker immediately so a reply draft is ready in seconds.
    const drained = await drainQueue(new Date(), 10);
    return NextResponse.json({ ok: true, businesses: conns.length, stored, failed, drained }, { status: 200 });
  } catch (error) {
    // Mail is stored and queued; the cron drains it later. ACK to avoid retries.
    console.error("[gmail/push] queue drain failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: true, businesses: conns.length, stored, failed, drained: null }, { status: 200 });
  }
}
