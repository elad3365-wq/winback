import { NextResponse, type NextRequest } from "next/server";

import { drainQueue } from "@/lib/ai/autopilot/worker";
import { isGmailFeatureEnabled } from "@/lib/gmail/config";
import { runGmailMaintenance } from "@/lib/gmail/maintenance";
import { isAutopilotConfigured } from "@/lib/supabase/admin";

/**
 * Daily Gmail maintenance cron (CRON_SECRET-protected, service role):
 *   1. Renew mailbox watches before they expire (keeps real-time push alive).
 *   2. Reconcile every mailbox via the History API — the fallback that catches
 *      any Pub/Sub notification that was dropped.
 *   3. Drain the task queue for anything the reconciliation enqueued.
 * Real-time work happens on the push webhook; this is the safety net. Kept as
 * one of the two Vercel-Hobby cron slots (the other is daily follow-ups).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

async function run(): Promise<NextResponse> {
  if (!isAutopilotConfigured()) {
    return NextResponse.json(
      { error: "Autopilot is not configured (need SUPABASE_SERVICE_ROLE_KEY and ANTHROPIC_API_KEY)." },
      { status: 503 },
    );
  }
  if (!isGmailFeatureEnabled()) {
    return NextResponse.json({ ok: true, skipped: "gmail_disabled" }, { status: 200 });
  }

  try {
    const maintenance = await runGmailMaintenance();
    const drained = await drainQueue(new Date(), 20);
    return NextResponse.json({ ok: true, maintenance, drained }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Maintenance failed." },
      { status: 503 },
    );
  }
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  return run();
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  return run();
}
