import { NextResponse, type NextRequest } from "next/server";

import { gmailSetupProblems } from "@/lib/gmail/config";
import { syncConnection } from "@/lib/gmail/service";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Scheduled inbox check for every connected business. Copies new mail and
 * writes AI reply DRAFTS for emails from known leads. It never sends anything:
 * sending happens only from a member's Approve and send click.
 *
 * Protected by CRON_SECRET, like /api/cron/followups. Each business is synced
 * on its own, so one broken connection never stops the others.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_CONNECTIONS_PER_RUN = 20;

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

async function run(): Promise<NextResponse> {
  const admin = createAdminClient();
  if (!admin || gmailSetupProblems().length > 0) {
    return NextResponse.json({ error: "Gmail sync is not configured." }, { status: 503 });
  }

  // Least recently checked first, so every business gets its turn.
  const { data: connections, error } = await admin
    .from("gmail_connections")
    .select("*")
    .eq("status", "connected")
    .order("last_synced_at", { ascending: true, nullsFirst: true })
    .limit(MAX_CONNECTIONS_PER_RUN);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const summary = { businesses: 0, imported: 0, drafted: 0, failed: 0 };
  for (const connection of connections ?? []) {
    const result = await syncConnection(admin, connection);
    summary.businesses++;
    summary.imported += result.imported;
    summary.drafted += result.drafted;
    if (result.error) summary.failed++;
  }
  return NextResponse.json(summary, { status: 200 });
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  return run();
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  return run();
}
