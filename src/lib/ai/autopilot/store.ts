import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { DEFAULT_AUTONOMY_LEVEL, isAutonomyLevel, type AutonomyLevel } from "@/lib/ai/autopilot/autonomy";
import { isClaimable, onAttemptFailed, orderQueue } from "@/lib/ai/autopilot/tasks";
import type { AiTask, Database, Json } from "@/lib/database.types";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Data layer for the AI Autopilot engine. Autonomy is owner-managed and read
 * under the user session (RLS); the task QUEUE is written and advanced only by
 * the SERVICE ROLE (users can read it for the dashboard but never enqueue or
 * mutate it — see migration 0012). Pure queue mechanics live in `tasks.ts`;
 * this module is the thin DB wrapper around them.
 */

type Db = SupabaseClient<Database>;

function adminDb(): Db {
  const a = createAdminClient();
  if (!a) throw new Error("AI Autopilot requires SUPABASE_SERVICE_ROLE_KEY to be configured.");
  return a;
}

export type AutonomyState = { level: AutonomyLevel; emergencyStop: boolean };

/** Current autonomy for a business; defaults to DRAFT (never silently upgraded). */
export async function getAutonomy(userClient: Db, businessId: string): Promise<AutonomyState> {
  const { data } = await userClient
    .from("business_ai_autonomy")
    .select("level, emergency_stop")
    .eq("business_id", businessId)
    .maybeSingle();
  if (!data) return { level: DEFAULT_AUTONOMY_LEVEL, emergencyStop: false };
  return {
    level: isAutonomyLevel(data.level) ? data.level : DEFAULT_AUTONOMY_LEVEL,
    emergencyStop: Boolean(data.emergency_stop),
  };
}

/** Owner updates autonomy level and/or the emergency-stop switch (RLS owner-only). */
export async function setAutonomy(
  userClient: Db,
  businessId: string,
  patch: { level?: AutonomyLevel; emergencyStop?: boolean },
): Promise<void> {
  const row: { business_id: string; level?: AutonomyLevel; emergency_stop?: boolean } = { business_id: businessId };
  if (patch.level !== undefined) row.level = patch.level;
  if (patch.emergencyStop !== undefined) row.emergency_stop = patch.emergencyStop;
  const { error } = await userClient.from("business_ai_autonomy").upsert(row, { onConflict: "business_id" });
  if (error) throw new Error(error.message);
}

/**
 * Enqueue a task idempotently. The unique (business_id, dedupe_key) constraint
 * makes a duplicate a no-op (returns enqueued:false) instead of a second job.
 * Service-role write.
 */
export async function enqueueTask(params: {
  businessId: string;
  type: string;
  dedupeKey: string;
  payload?: Json;
  priority?: number;
  leadId?: string | null;
  runAfter?: string;
}): Promise<{ enqueued: boolean; id?: string }> {
  const { data, error } = await adminDb()
    .from("ai_tasks")
    .insert({
      business_id: params.businessId,
      type: params.type,
      dedupe_key: params.dedupeKey,
      payload: params.payload ?? null,
      priority: params.priority ?? 50,
      lead_id: params.leadId ?? null,
      run_after: params.runAfter,
    })
    .select("id")
    .maybeSingle();
  if (error) return { enqueued: false }; // unique violation → already queued
  return { enqueued: true, id: data?.id };
}

/** Claimable tasks for the worker, highest priority first. Service-role read. */
export async function listRunnableTasks(now: Date, limit = 20): Promise<AiTask[]> {
  const { data } = await adminDb()
    .from("ai_tasks")
    .select("*")
    .in("status", ["queued", "running"])
    .lte("run_after", now.toISOString())
    .limit(limit * 3);
  const rows = (data ?? []).filter((t) =>
    isClaimable({ status: t.status, runAfter: t.run_after, lockedAt: t.locked_at }, now),
  );
  return orderQueue(rows.map((t) => ({ ...t, priority: t.priority, runAfter: t.run_after }))).slice(0, limit) as AiTask[];
}

/**
 * Atomically claim a task (queued→running). Returns true only if THIS worker won
 * the row, so two workers never run the same task. Service-role write.
 */
export async function claimTask(taskId: string, now: Date): Promise<boolean> {
  const { data } = await adminDb()
    .from("ai_tasks")
    .update({ status: "running", locked_at: now.toISOString() })
    .eq("id", taskId)
    .eq("status", "queued")
    .select("id")
    .maybeSingle();
  return Boolean(data);
}

export async function completeTask(taskId: string): Promise<void> {
  await adminDb().from("ai_tasks").update({ status: "done", locked_at: null }).eq("id", taskId);
}

/** Record a failed attempt: reschedule with backoff, or dead-letter. */
export async function failTask(task: AiTask, now: Date, errorMessage: string): Promise<void> {
  const outcome = onAttemptFailed({ attempts: task.attempts, maxAttempts: task.max_attempts }, now);
  await adminDb()
    .from("ai_tasks")
    .update({
      status: outcome.status,
      attempts: outcome.attempts,
      run_after: outcome.runAfter ?? task.run_after,
      locked_at: null,
      last_error: errorMessage.slice(0, 500),
    })
    .eq("id", task.id);
}
