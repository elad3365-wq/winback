import "server-only";

import { executeTask } from "@/lib/ai/autopilot/engine";
import { claimTask, completeTask, failTask, listRunnableTasks } from "@/lib/ai/autopilot/store";

/**
 * Drain a bounded batch of due tasks from the ai_tasks queue. This is the ONE
 * worker body, shared by the scheduled cron and the real-time push webhook (so a
 * notification processes immediately instead of waiting for the daily cron).
 * Never an infinite loop: it claims each task atomically (so two workers never
 * run the same one), executes it, and records success / backoff / dead-letter.
 */

export type DrainSummary = {
  processed: number;
  drafted: number;
  sent: number;
  skipped: number;
  failed: number;
};

export async function drainQueue(now: Date, batch = 20): Promise<DrainSummary> {
  const summary: DrainSummary = { processed: 0, drafted: 0, sent: 0, skipped: 0, failed: 0 };

  const tasks = await listRunnableTasks(now, batch);
  for (const task of tasks) {
    if (!(await claimTask(task.id, now))) continue; // another worker took it
    summary.processed++;
    try {
      const outcome = await executeTask(task);
      await completeTask(task.id);
      if (outcome.result === "sent") summary.sent++;
      else if (outcome.result === "drafted") summary.drafted++;
      else summary.skipped++;
    } catch (error) {
      summary.failed++;
      await failTask(task, now, error instanceof Error ? error.message : String(error));
    }
  }

  return summary;
}
