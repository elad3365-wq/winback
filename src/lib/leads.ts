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
