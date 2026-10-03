import Link from "next/link";
import { notFound } from "next/navigation";

import { AiFollowup } from "@/components/leads/ai-followup";
import { FollowUpScheduler } from "@/components/leads/follow-up-scheduler";
import { LeadAutopilotToggle } from "@/components/leads/lead-autopilot-toggle";
import { LeadNotes } from "@/components/leads/lead-notes";
import { LeadStatusControl } from "@/components/leads/lead-status-control";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireBusinessContext } from "@/lib/business";
import type { AiMessage, Json, Lead, LeadActivity, LeadNote } from "@/lib/database.types";
import { formatCurrency, formatDate, formatPhone } from "@/lib/format";
import { daysOverdue, effectiveFollowUpDate, isDueToday, isOverdue, LEAD_STATUS_LABELS } from "@/lib/leads";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Lead · WinBack",
};

export default async function LeadDetailPage({ params }: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await params;
  const { business } = await requireBusinessContext();
  const supabase = await createClient();

  const { data: lead } = await supabase
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .eq("business_id", business.id)
    .maybeSingle();

  if (!lead) notFound();
  const typedLead = lead as Lead;

  const [{ data: notes }, { data: activity }, { data: messages }] = await Promise.all([
    supabase.from("lead_notes").select("*").eq("lead_id", leadId).order("created_at", { ascending: false }),
    supabase.from("lead_activity").select("*").eq("lead_id", leadId).order("created_at", { ascending: false }),
    supabase.from("ai_messages").select("*").eq("lead_id", leadId).order("created_at", { ascending: false }),
  ]);

  const timeline = buildTimeline(typedLead, (activity as LeadActivity[]) ?? [], (messages as AiMessage[]) ?? []);

  return (
    <div className="space-y-6">
      <Link href="/leads" className="inline-block text-sm font-medium text-indigo-600 hover:text-indigo-500">
        ← Back to leads
      </Link>

      <Card>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{typedLead.customer_name}</h1>
              <StatusBadge status={typedLead.status} />
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
              <a href={`tel:${typedLead.phone.replace(/\s/g, "")}`} className="hover:text-indigo-600">
                {formatPhone(typedLead.phone)}
              </a>
              <span>{typedLead.service}</span>
            </div>
            <p className="mt-1 text-xs text-slate-400">Created {formatDate(typedLead.created_at.slice(0, 10))}</p>
          </div>
          <LeadStatusControl leadId={typedLead.id} status={typedLead.status} />
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <AiFollowup lead={typedLead} />
          </Card>

          <Card>
            <h2 className="text-sm font-semibold text-slate-900">Notes</h2>
            <div className="mt-4">
              <LeadNotes leadId={typedLead.id} notes={(notes as LeadNote[]) ?? []} />
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <h2 className="text-sm font-semibold text-slate-900">Overview</h2>
            <dl className="mt-3 space-y-2.5 text-sm">
              <Row label="Status">{LEAD_STATUS_LABELS[typedLead.status]}</Row>
              <Row label="Estimate">{formatCurrency(Number(typedLead.estimate_amount), { cents: true })}</Row>
              <Row label="Follow-up count">{typedLead.follow_up_count}</Row>
              <Row label="Last contacted">
                {typedLead.last_follow_up_at ? formatDate(typedLead.last_follow_up_at.slice(0, 10)) : "—"}
              </Row>
              <Row label="Next follow-up">
                <NextFollowUp lead={typedLead} />
              </Row>
              <Row label="Autopilot">
                <LeadAutopilotToggle leadId={typedLead.id} paused={typedLead.autopilot_paused} />
              </Row>
              <Row label="Subscription">
                {typedLead.unsubscribe_status === "unsubscribed" ? (
                  <span className="text-rose-600">Unsubscribed</span>
                ) : (
                  <span className="text-slate-700">Subscribed</span>
                )}
              </Row>
            </dl>
          </Card>

          <Card>
            <h2 className="text-sm font-semibold text-slate-900">Follow-up</h2>
            <div className="mt-4">
              <FollowUpScheduler leadId={typedLead.id} status={typedLead.status} followUpDate={typedLead.follow_up_date} />
            </div>
          </Card>

          <Card>
            <h2 className="text-sm font-semibold text-slate-900">Activity</h2>
            {timeline.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">No activity yet.</p>
            ) : (
              <ol className="mt-4 space-y-4">
                {timeline.map((event, index) => (
                  <li key={index} className="relative pl-5">
                    <span className="absolute top-1.5 left-0 h-2 w-2 rounded-full bg-indigo-400" aria-hidden />
                    <p className="text-sm text-slate-800">{event.label}</p>
                    <p className="text-xs text-slate-400">{formatDateTime(event.at)}</p>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-800">{children}</dd>
    </div>
  );
}

function NextFollowUp({ lead }: { lead: Lead }) {
  const date = effectiveFollowUpDate(lead);
  if (!date) return <span className="text-slate-400">—</span>;
  if (isOverdue(date, lead.status)) {
    return (
      <span className="text-rose-600">
        {formatDate(date)} · {daysOverdue(date)}d overdue
      </span>
    );
  }
  if (isDueToday(date, lead.status)) return <span className="text-amber-600">{formatDate(date)} · today</span>;
  return <span>{formatDate(date)}</span>;
}

// --- Timeline ---------------------------------------------------------------

type TimelineEvent = { at: string; label: string };

function metaString(metadata: Json | null, key: string): string | null {
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    const value = (metadata as Record<string, Json | undefined>)[key];
    return typeof value === "string" ? value : null;
  }
  return null;
}

function statusLabel(value: string | null): string {
  if (value && value in LEAD_STATUS_LABELS) return LEAD_STATUS_LABELS[value as keyof typeof LEAD_STATUS_LABELS];
  return value ?? "unknown";
}

function activityLabel(event: LeadActivity): string {
  switch (event.type) {
    case "lead_created":
      return "Lead created";
    case "status_changed":
      return `Status changed to ${statusLabel(metaString(event.metadata, "to"))}`;
    case "followup_scheduled":
      return `Follow-up scheduled${metaString(event.metadata, "follow_up_date") ? ` for ${formatDate(metaString(event.metadata, "follow_up_date"))}` : ""}`;
    case "followup_cleared":
      return "Follow-up cleared";
    case "contacted":
      return "Logged a contact";
    case "note_added":
      return "Note added";
    case "autopilot_paused":
      return "Autopilot paused";
    case "autopilot_resumed":
      return "Autopilot resumed";
    default:
      return event.type.replace(/_/g, " ");
  }
}

function buildTimeline(lead: Lead, activity: LeadActivity[], messages: AiMessage[]): TimelineEvent[] {
  const events: TimelineEvent[] = activity.map((event) => ({ at: event.created_at, label: activityLabel(event) }));

  for (const message of messages) {
    events.push({ at: message.created_at, label: `AI follow-up drafted (${message.channel.toUpperCase()})` });
    if (message.approved_at) events.push({ at: message.approved_at, label: "AI follow-up approved" });
  }

  if (!activity.some((event) => event.type === "lead_created")) {
    events.push({ at: lead.created_at, label: "Lead created" });
  }
  return events.sort((a, b) => b.at.localeCompare(a.at));
}

function formatDateTime(value: string) {
  try {
    return new Date(value).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
}
