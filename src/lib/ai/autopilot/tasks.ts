/**
 * Autonomous execution-engine helpers (Phase 3) — pure task-queue mechanics:
 * exponential backoff, next-run scheduling, dead-letter detection, priority
 * ordering, and claimability. The persistence (an `ai_tasks` table) and the
 * worker that calls these live elsewhere; keeping the mechanics pure makes
 * retry/idempotency behavior unit-testable without a database.
 *
 * NOTE: the worker runs on a cron / queue consumer — never an infinite loop
 * inside a request handler.
 */

export type TaskStatus = "queued" | "running" | "done" | "failed" | "dead";

export type QueueTask = {
  id: string;
  businessId: string;
  status: TaskStatus;
  priority: number; // higher runs first
  runAfter: string; // ISO; earliest time it may run
  attempts: number;
  maxAttempts: number;
  lockedAt: string | null; // ISO when a worker claimed it
};

const DEFAULT_BASE_MS = 30_000; // 30s
const MAX_BACKOFF_MS = 6 * 60 * 60_000; // cap at 6h

/** Exponential backoff with a cap: base * 2^(attempt-1), attempt is 1-based. */
export function backoffMs(attempt: number, baseMs = DEFAULT_BASE_MS): number {
  const n = Math.max(1, Math.floor(attempt));
  const raw = baseMs * 2 ** (n - 1);
  return Math.min(MAX_BACKOFF_MS, raw);
}

/** When a task should next run after its `attempt`-th failure. */
export function nextRunAt(now: Date, attempt: number, baseMs = DEFAULT_BASE_MS): string {
  return new Date(now.getTime() + backoffMs(attempt, baseMs)).toISOString();
}

/** A task is dead-lettered once it has used up its attempts. */
export function isDead(attempts: number, maxAttempts: number): boolean {
  return attempts >= maxAttempts;
}

/** How long a running lock may be held before it is considered stale (worker crash). */
export const LOCK_TTL_MS = 5 * 60_000;

/**
 * Whether a worker may claim this task now: queued (or running with a stale
 * lock), its run_after has arrived, and it is not already done/dead.
 */
export function isClaimable(task: Pick<QueueTask, "status" | "runAfter" | "lockedAt">, now: Date): boolean {
  if (task.status === "done" || task.status === "dead" || task.status === "failed") return false;
  if (Date.parse(task.runAfter) > now.getTime()) return false;
  if (task.status === "running") {
    if (!task.lockedAt) return true;
    return now.getTime() - Date.parse(task.lockedAt) > LOCK_TTL_MS; // reclaim a stale lock
  }
  return task.status === "queued";
}

/** Order the runnable queue: highest priority first, then oldest run_after. */
export function orderQueue<T extends Pick<QueueTask, "priority" | "runAfter">>(tasks: T[]): T[] {
  return [...tasks].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return Date.parse(a.runAfter) - Date.parse(b.runAfter);
  });
}

/**
 * Compute the outcome of a failed attempt: either reschedule with backoff, or
 * dead-letter when attempts are exhausted. Returned fields are a DB update.
 */
export function onAttemptFailed(
  task: Pick<QueueTask, "attempts" | "maxAttempts">,
  now: Date,
  baseMs = DEFAULT_BASE_MS,
): { status: TaskStatus; attempts: number; runAfter?: string; lockedAt: null } {
  const attempts = task.attempts + 1;
  if (isDead(attempts, task.maxAttempts)) {
    return { status: "dead", attempts, lockedAt: null };
  }
  return { status: "queued", attempts, runAfter: nextRunAt(now, attempts, baseMs), lockedAt: null };
}
