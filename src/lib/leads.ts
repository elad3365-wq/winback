import type { Lead, LeadStatus } from "@/lib/database.types";

export const LEAD_STATUSES: LeadStatus[] = [
  "new",
  "followup_1",
  "followup_2",
  "followup_3",
  "cold",
  "follow_up_needed",
  "contacted",
  "interested",
  "call_requested",
  "recovered",
  "lost",
  "paused",
  "unsubscribed",
];

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: "New",
  followup_1: "Follow-up 1",
  followup_2: "Follow-up 2",
  followup_3: "Follow-up 3",
  cold: "Cold",
  follow_up_needed: "Follow-up needed",
  contacted: "Contacted",
  interested: "Interested",
  call_requested: "Call requested",
  recovered: "Recovered",
  lost: "Lost",
  paused: "Paused",
  unsubscribed: "Unsubscribed",
};

/**
 * Tailwind classes per status. Kept here so the badge looks the same wherever
 * a status is rendered.
 */
export const LEAD_STATUS_STYLES: Record<LeadStatus, string> = {
  new: "bg-slate-100 text-slate-700 ring-slate-200",
  followup_1: "bg-amber-50 text-amber-700 ring-amber-200",
  followup_2: "bg-amber-50 text-amber-700 ring-amber-200",
  followup_3: "bg-amber-50 text-amber-700 ring-amber-200",
  cold: "bg-slate-100 text-slate-500 ring-slate-200",
  follow_up_needed: "bg-amber-50 text-amber-700 ring-amber-200",
  contacted: "bg-sky-50 text-sky-700 ring-sky-200",
  interested: "bg-violet-50 text-violet-700 ring-violet-200",
  call_requested: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  recovered: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  lost: "bg-rose-50 text-rose-700 ring-rose-200",
  paused: "bg-slate-100 text-slate-600 ring-slate-200",
  unsubscribed: "bg-rose-50 text-rose-700 ring-rose-200",
};

/** Leads that are being actively worked, i.e. not yet won or written off. */
export const ACTIVE_FOLLOW_UP_STATUSES: LeadStatus[] = [
  "follow_up_needed",
  "contacted",
  "interested",
  "followup_1",
  "followup_2",
  "followup_3",
  "call_requested",
];

/** The autopilot follow-up progression, in order. */
export const AUTOPILOT_PROGRESSION: LeadStatus[] = [
  "new",
  "followup_1",
  "followup_2",
  "followup_3",
  "cold",
];

/** Statuses the autopilot must never touch (stop states). */
export const AUTOPILOT_STOP_STATUSES: LeadStatus[] = [
  "interested",
  "recovered",
  "lost",
  "call_requested",
  "paused",
  "unsubscribed",
];

export function isLeadStatus(value: unknown): value is LeadStatus {
  return typeof value === "string" && (LEAD_STATUSES as string[]).includes(value);
}

export type LeadStats = {
  totalLeads: number;
  activeFollowUps: number;
  recoveredCustomers: number;
  recoveredRevenue: number;
};

export function calculateLeadStats(leads: Lead[]): LeadStats {
  const recovered = leads.filter((lead) => lead.status === "recovered");

  return {
    totalLeads: leads.length,
    activeFollowUps: leads.filter((lead) => ACTIVE_FOLLOW_UP_STATUSES.includes(lead.status)).length,
    recoveredCustomers: recovered.length,
    recoveredRevenue: recovered.reduce((total, lead) => total + Number(lead.estimate_amount ?? 0), 0),
  };
}

// ---------------------------------------------------------------------------
// CRM pipeline + dashboard helpers (pure, so they are easy to test)
// ---------------------------------------------------------------------------

export type PipelineStageKey = "new" | "contacted" | "follow_up" | "interested" | "recovered" | "lost";

/**
 * The CRM pipeline columns. Each lead keeps its EXACT status in the DB; the
 * follow-up progression (followup_1..3, cold, etc.) simply renders under the
 * "Follow-up" column. `dropStatus` is the status assigned when a card is dragged
 * into that column.
 */
export const PIPELINE_STAGES: {
  key: PipelineStageKey;
  label: string;
  dropStatus: LeadStatus;
  accent: string;
}[] = [
  { key: "new", label: "New", dropStatus: "new", accent: "bg-slate-400" },
  { key: "contacted", label: "Contacted", dropStatus: "contacted", accent: "bg-sky-400" },
  { key: "follow_up", label: "Follow-up", dropStatus: "follow_up_needed", accent: "bg-amber-400" },
  { key: "interested", label: "Interested", dropStatus: "interested", accent: "bg-violet-400" },
  { key: "recovered", label: "Recovered", dropStatus: "recovered", accent: "bg-emerald-500" },
  { key: "lost", label: "Lost", dropStatus: "lost", accent: "bg-rose-400" },
];

const STAGE_OF_STATUS: Record<LeadStatus, PipelineStageKey> = {
  new: "new",
  contacted: "contacted",
  follow_up_needed: "follow_up",
  followup_1: "follow_up",
  followup_2: "follow_up",
  followup_3: "follow_up",
  cold: "follow_up",
  paused: "follow_up",
  interested: "interested",
  call_requested: "interested",
  recovered: "recovered",
  lost: "lost",
  unsubscribed: "lost",
};

export function stageForStatus(status: LeadStatus): PipelineStageKey {
  return STAGE_OF_STATUS[status];
}

/** Statuses where no follow-up is expected (never flagged overdue/due). */
export const CLOSED_STATUSES: LeadStatus[] = ["recovered", "lost", "unsubscribed", "paused"];

/** Today as a UTC YYYY-MM-DD string. */
export function todayIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** The effective next-follow-up calendar date: autopilot's, else the manual one. */
export function effectiveFollowUpDate(lead: Pick<Lead, "next_follow_up_at" | "follow_up_date">): string | null {
  if (lead.next_follow_up_at) return lead.next_follow_up_at.slice(0, 10);
  return lead.follow_up_date;
}

export function isOverdue(date: string | null, status: LeadStatus, now: Date = new Date()): boolean {
  if (!date || CLOSED_STATUSES.includes(status)) return false;
  return date < todayIso(now);
}

export function isDueToday(date: string | null, status: LeadStatus, now: Date = new Date()): boolean {
  if (!date || CLOSED_STATUSES.includes(status)) return false;
  return date === todayIso(now);
}

export function daysOverdue(date: string | null, now: Date = new Date()): number {
  if (!date) return 0;
  const due = Date.parse(`${date}T00:00:00Z`);
  const today = Date.parse(`${todayIso(now)}T00:00:00Z`);
  if (!Number.isFinite(due) || due >= today) return 0;
  return Math.round((today - due) / 86_400_000);
}

export function leadIsOverdue(lead: Lead, now: Date = new Date()): boolean {
  return isOverdue(effectiveFollowUpDate(lead), lead.status, now);
}

export function leadIsDueToday(lead: Lead, now: Date = new Date()): boolean {
  return isDueToday(effectiveFollowUpDate(lead), lead.status, now);
}

export type DashboardMetrics = {
  total: number;
  byStatus: Record<LeadStatus, number>;
  needsFollowUp: number;
  createdThisWeek: number;
  dueToday: number;
  overdue: number;
};

export function dashboardMetrics(leads: Lead[], now: Date = new Date()): DashboardMetrics {
  const byStatus = Object.fromEntries(LEAD_STATUSES.map((s) => [s, 0])) as Record<LeadStatus, number>;
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();

  let createdThisWeek = 0;
  let dueToday = 0;
  let overdue = 0;

  for (const lead of leads) {
    if (lead.status in byStatus) byStatus[lead.status] += 1;
    if (lead.created_at >= weekAgo) createdThisWeek += 1;
    const date = effectiveFollowUpDate(lead);
    if (isDueToday(date, lead.status, now)) dueToday += 1;
    if (isOverdue(date, lead.status, now)) overdue += 1;
  }

  return {
    total: leads.length,
    byStatus,
    needsFollowUp: dueToday + overdue,
    createdThisWeek,
    dueToday,
    overdue,
  };
}

export type DailyPoint = { date: string; count: number };

/** Count of leads created per day for the last `days` days (oldest first). */
export function buildDailySeries(createdAts: string[], days: number, now: Date = new Date()): DailyPoint[] {
  const buckets = new Map<string, number>();
  for (let i = days - 1; i >= 0; i -= 1) {
    buckets.set(new Date(now.getTime() - i * 86_400_000).toISOString().slice(0, 10), 0);
  }
  const earliest = [...buckets.keys()][0];
  for (const createdAt of createdAts) {
    const day = createdAt.slice(0, 10);
    if (day >= earliest && buckets.has(day)) buckets.set(day, (buckets.get(day) ?? 0) + 1);
  }
  return [...buckets.entries()].map(([date, count]) => ({ date, count }));
}

export type LeadSort = "newest" | "oldest" | "follow_up" | "recent_contact";

export function sortLeads(leads: Lead[], sort: LeadSort): Lead[] {
  const copy = [...leads];
  switch (sort) {
    case "oldest":
      return copy.sort((a, b) => a.created_at.localeCompare(b.created_at));
    case "follow_up":
      return copy.sort((a, b) => {
        const da = effectiveFollowUpDate(a);
        const db = effectiveFollowUpDate(b);
        if (!da && !db) return 0;
        if (!da) return 1;
        if (!db) return -1;
        return da.localeCompare(db);
      });
    case "recent_contact":
      return copy.sort((a, b) => (b.last_follow_up_at ?? "").localeCompare(a.last_follow_up_at ?? ""));
    case "newest":
    default:
      return copy.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
}
