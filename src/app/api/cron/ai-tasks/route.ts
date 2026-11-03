import { NextResponse, type NextRequest } from "next/server";

import { executeTask } from "@/lib/ai/autopilot/engine";
import { claimTask, completeTask, failTask, listRunnableTasks } from "@/lib/ai/autopilot/store";
import { isAutopilotConfigured } from "@/lib/supabase/admin";

/**
 * AI Autopilot background worker. Runs on a cron (NOT an infinite loop in a
 * request handler): each invocation drains a bounded batch of due tasks from the
 * ai_tasks queue, claiming each atomically (so two workers never run the same
 * task), executing it, and recording success / backoff / dead-letter. Protected
 * by CRON_SECRET; uses the service role. Produces only drafts — never sends.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH = 20;

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

  const now = new Date();
  const summary = { processed: 0, drafted: 0, skipped: 0, failed: 0, dead: 0 };

  let tasks;
  try {
    tasks = await listRunnableTasks(now, BATCH);
  } catch (error) {
    // Most likely the ai_tasks table is not present yet (migration 0012 pending).
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not read the task queue." },
      { status: 503 },
    );
  }

  for (const task of tasks) {
    if (!(await claimTask(task.id, now))) continue; // another worker took it
    summary.processed++;
    try {
      const outcome = await executeTask(task);
      await completeTask(task.id);
      if (outcome.result === "drafted") summary.drafted++;
      else summary.skipped++;
    } catch (error) {
      summary.failed++;
      await failTask(task, now, error instanceof Error ? error.message : String(error));
    }
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
