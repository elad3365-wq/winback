import Link from "next/link";

import { AutopilotControl } from "@/components/settings/autopilot-control";
import { Badge, type Tone } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { AUTONOMY_LABELS } from "@/lib/ai/autopilot/autonomy";
import { getAutonomy } from "@/lib/ai/autopilot/store";
import { requireOnboardedContext } from "@/lib/business";
import type { AiTaskStatus } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "AI Control Center · WinBack" };

const TASK_TONE: Record<AiTaskStatus, Tone> = {
  queued: "neutral",
  running: "blue",
  done: "green",
  failed: "amber",
  dead: "red",
};

function when(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

export default async function AutopilotControlCenterPage() {
  const { business } = await requireOnboardedContext();
  const supabase = await createClient();

  const autonomy = await getAutonomy(supabase, business.id);

  // All of these fail-open to empty if migration 0012 isn't applied yet.
  const [{ data: tasks }, { count: pendingApprovals }, { data: activity }] = await Promise.all([
    supabase
      .from("ai_tasks")
      .select("id, type, status, priority, attempts, run_after, last_error, created_at")
      .eq("business_id", business.id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("business_email_replies")
      .select("id", { count: "exact", head: true })
      .eq("business_id", business.id)
      .in("status", ["draft", "edited", "approved"]),
    supabase
      .from("ai_audit_log")
      .select("id, event, detail, created_at")
      .eq("business_id", business.id)
      .order("created_at", { ascending: false })
      .limit(15),
  ]);

  const taskRows = tasks ?? [];
  const counts = taskRows.reduce<Record<string, number>>((acc, t) => {
    acc[t.status] = (acc[t.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">AI Control Center</h1>
        <p className="mt-1 text-sm text-slate-500">
          Your AI Autopilot: autonomy, the emergency stop, what it&apos;s working on, and what&apos;s waiting for you.
        </p>
      </header>

      {/* Status strip */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm">
        <span className="text-slate-600">Autonomy:</span>
        <Badge tone={autonomy.level === "off" ? "neutral" : autonomy.emergencyStop ? "red" : "blue"}>
          {AUTONOMY_LABELS[autonomy.level].split(" — ")[0]}
        </Badge>
        <span className="text-slate-600">Emergency stop:</span>
        <Badge tone={autonomy.emergencyStop ? "red" : "green"}>{autonomy.emergencyStop ? "ON" : "off"}</Badge>
        <span className="ml-auto">
          <Link href="/settings/email" className="font-medium text-indigo-600 hover:text-indigo-500">
            Pending approvals: {pendingApprovals ?? 0}
          </Link>
        </span>
      </div>

      <AutopilotControl level={autonomy.level} emergencyStop={autonomy.emergencyStop} />

      {/* Agent task queue */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Agent task queue</h2>
          <span className="text-xs text-slate-500">
            {["queued", "running", "done", "failed", "dead"].map((s) => `${counts[s] ?? 0} ${s}`).join(" · ")}
          </span>
        </div>
        {taskRows.length === 0 ? (
          <Card>
            <p className="p-5 text-sm text-slate-500">
              No AI tasks yet. Once migration <code>0012</code> is applied and a mailbox is connected, new emails queue
              work here.
            </p>
          </Card>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2">When</th>
                  <th className="px-4 py-2">Type</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2 text-right">Attempts</th>
                  <th className="px-4 py-2">Last error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {taskRows.map((t) => (
                  <tr key={t.id}>
                    <td className="px-4 py-2 text-slate-500">{when(t.created_at)}</td>
                    <td className="px-4 py-2 text-slate-700">{t.type}</td>
                    <td className="px-4 py-2">
                      <Badge tone={TASK_TONE[t.status]}>{t.status}</Badge>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{t.attempts}</td>
                    <td className="px-4 py-2 text-xs text-rose-600">{t.last_error ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Activity feed */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-900">Recent AI activity</h2>
        {(activity ?? []).length === 0 ? (
          <Card>
            <p className="p-5 text-sm text-slate-500">No AI activity recorded yet.</p>
          </Card>
        ) : (
          <ul className="space-y-2">
            {(activity ?? []).map((a) => (
              <li key={a.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                <span className="font-medium text-slate-800">{a.event}</span>
                <span className="ml-auto text-xs text-slate-400">{when(a.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
