import Link from "next/link";

import { GettingStarted } from "@/components/dashboard/getting-started";
import { LeadsChart } from "@/components/dashboard/leads-chart";
import { StatTile } from "@/components/dashboard/stat-tile";
import { StatusBadge } from "@/components/ui/status-badge";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { requireBusinessContext } from "@/lib/business";
import type { Lead } from "@/lib/database.types";
import { formatDate, formatPhone } from "@/lib/format";
import { gettingStartedSteps, showGettingStarted } from "@/lib/getting-started";
import {
  buildDailySeries,
  dashboardMetrics,
  daysOverdue,
  effectiveFollowUpDate,
  isDueToday,
  isOverdue,
  LEAD_STATUS_LABELS,
} from "@/lib/leads";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Dashboard · WinBack",
};

export default async function DashboardPage() {
  const { user, business } = await requireBusinessContext();
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  const firstName =
    profile?.full_name?.trim().split(/\s+/)[0] || user.email?.split("@")[0] || "there";

  const { data: leads, error } = await supabase
    .from("leads")
    .select("*")
    .eq("business_id", business.id)
    .order("created_at", { ascending: false })
    .limit(2000);

  if (error) {
    console.error("[dashboard] could not load leads", error.message);
    return <Alert tone="error">Could not load your dashboard. Please refresh the page.</Alert>;
  }

  const allLeads = (leads ?? []) as Lead[];

  // First-run checklist. Each count is best-effort: a missing table (an older
  // database) just reads as "not done yet" instead of breaking the dashboard.
  const [drafts, reviewed, gmail] = await Promise.all([
    supabase.from("ai_messages").select("id", { count: "exact", head: true }).eq("business_id", business.id),
    supabase
      .from("ai_messages")
      .select("id", { count: "exact", head: true })
      .eq("business_id", business.id)
      .in("status", ["approved", "sent"]),
    supabase.from("business_gmail_connections").select("business_id").eq("business_id", business.id).maybeSingle(),
  ]);
  const steps = gettingStartedSteps({
    leadCount: allLeads.length,
    aiDraftCount: drafts.count ?? 0,
    reviewedDraftCount: reviewed.count ?? 0,
    gmailConnected: Boolean(gmail.data),
    firstLeadId: allLeads[0]?.id ?? null,
  });
  const metrics = dashboardMetrics(allLeads);
  const series = buildDailySeries(allLeads.map((lead) => lead.created_at), 30);

  const queue = allLeads
    .filter((lead) => effectiveFollowUpDate(lead) && isOpen(lead))
    .sort((a, b) => (effectiveFollowUpDate(a) ?? "").localeCompare(effectiveFollowUpDate(b) ?? ""))
    .slice(0, 8);

  const recent = allLeads.slice(0, 5);

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-indigo-600">Welcome, {firstName}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{business.name}</h1>
          <p className="mt-1 text-sm text-slate-500">Your pipeline at a glance and who needs a nudge today.</p>
        </div>
        <Link href="/leads" className="text-sm font-medium text-indigo-600 hover:text-indigo-500">
          Go to leads →
        </Link>
      </header>

      {showGettingStarted(steps) ? <GettingStarted steps={steps} /> : null}

      {metrics.total === 0 ? null : (
        <>
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            <StatTile label="Total leads" value={metrics.total} href="/leads" />
            <StatTile label="New" value={metrics.byStatus.new} tone="indigo" href="/leads?status=new" />
            <StatTile label="Needs follow-up" value={metrics.needsFollowUp} tone="amber" href="/leads?due=overdue" />
            <StatTile label={LEAD_STATUS_LABELS.interested} value={metrics.byStatus.interested} tone="indigo" href="/leads?status=interested" />
            <StatTile label={LEAD_STATUS_LABELS.recovered} value={metrics.byStatus.recovered} tone="emerald" href="/leads?status=recovered" />
            <StatTile label={LEAD_STATUS_LABELS.lost} value={metrics.byStatus.lost} href="/leads?status=lost" />
          </section>

          <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatTile label="Created this week" value={metrics.createdThisWeek} />
            <StatTile label="Follow-ups due today" value={metrics.dueToday} tone={metrics.dueToday > 0 ? "amber" : "default"} />
            <StatTile
              label="Overdue follow-ups"
              value={metrics.overdue}
              tone={metrics.overdue > 0 ? "rose" : "default"}
              href={metrics.overdue > 0 ? "/leads?due=overdue" : undefined}
            />
          </section>
          <section className="grid gap-6 lg:grid-cols-2">
            <LeadsChart points={series} />

            <Card>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900">Needs follow-up</h2>
                <Link href="/leads?due=overdue" className="text-xs font-medium text-indigo-600 hover:text-indigo-500">
                  View all
                </Link>
              </div>
              {queue.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500">
                  Nothing scheduled. Add a follow-up date to a lead and it shows up here.
                </p>
              ) : (
                <ul className="mt-3 divide-y divide-slate-100">
                  {queue.map((lead) => (
                    <li key={lead.id} className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <Link href={`/leads/${lead.id}`} className="truncate text-sm font-medium text-slate-900 hover:text-indigo-600">
                          {lead.customer_name}
                        </Link>
                        <p className="truncate text-xs text-slate-500">
                          {formatPhone(lead.phone)}
                          {lead.follow_up_count > 0 ? ` · ${lead.follow_up_count} follow-up${lead.follow_up_count === 1 ? "" : "s"}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <FollowUpTag lead={lead} />
                        <Link href={`/leads/${lead.id}`} className="text-xs font-medium text-indigo-600 hover:text-indigo-500">
                          Open lead →
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </section>

          <Card>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">Recent leads</h2>
              <Link href="/leads" className="text-xs font-medium text-indigo-600 hover:text-indigo-500">
                View all
              </Link>
            </div>
            <ul className="mt-3 divide-y divide-slate-100">
              {recent.map((lead) => (
                <li key={lead.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <Link href={`/leads/${lead.id}`} className="truncate text-sm font-medium text-slate-900 hover:text-indigo-600">
                      {lead.customer_name}
                    </Link>
                    <p className="truncate text-xs text-slate-500">
                      {lead.service} · {formatDate(lead.created_at.slice(0, 10))}
                    </p>
                  </div>
                  <StatusBadge status={lead.status} />
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}

function isOpen(lead: Lead) {
  return lead.status !== "recovered" && lead.status !== "lost" && lead.status !== "unsubscribed";
}

function FollowUpTag({ lead }: { lead: Lead }) {
  const date = effectiveFollowUpDate(lead);
  if (isOverdue(date, lead.status)) {
    return (
      <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 ring-1 ring-inset ring-rose-200">
        {daysOverdue(date)}d overdue
      </span>
    );
  }
  if (isDueToday(date, lead.status)) {
    return (
      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-200">
        Due today
      </span>
    );
  }
  return <span className="text-xs font-medium text-slate-600">{formatDate(date)}</span>;
}
