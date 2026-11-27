import { NextResponse, type NextRequest } from "next/server";

import { isCronAuthorized } from "@/lib/security/cron-auth";

import { drainQueue } from "@/lib/ai/autopilot/worker";
import { isAutopilotConfigured } from "@/lib/supabase/admin";

/**
 * AI Autopilot background worker endpoint. Drains the ai_tasks queue via the
 * shared `drainQueue` (NOT an infinite loop): each invocation claims a bounded
 * batch atomically, executes, and records success / backoff / dead-letter.
 * Protected by CRON_SECRET; uses the service role. The push webhook calls the
 * same worker inline for real-time processing.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH = 20;

function authorized(request: NextRequest): boolean {
  return isCronAuthorized(request.headers.get("authorization"));
}

async function run(): Promise<NextResponse> {
  if (!isAutopilotConfigured()) {
    return NextResponse.json(
      { error: "Autopilot is not configured (need SUPABASE_SERVICE_ROLE_KEY and ANTHROPIC_API_KEY)." },
      { status: 503 },
    );
  }

  try {
    const summary = await drainQueue(new Date(), BATCH);
    return NextResponse.json(summary, { status: 200 });
  } catch (error) {
    // Most likely the ai_tasks table is not present yet (migration 0012 pending).
    console.error("[cron/ai-tasks] drain failed", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: "Could not read the task queue." },
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
