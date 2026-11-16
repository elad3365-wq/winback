/**
 * AI Business Analyst core (Phase 2 agent #6) — pure funnel / performance
 * analytics over the data WinBack already stores, so the daily/weekly summaries
 * are deterministic and testable.
 */

import type { LeadStatus } from "@/lib/database.types";

export type FunnelInput = { status: LeadStatus; estimateAmount: number }[];

export type FunnelMetrics = {
  total: number;
  contacted: number;
  interested: number;
  recovered: number;
  lost: number;
  contactRate: number; // contacted / total
  interestRate: number; // interested / total
  recoveryRate: number; // recovered / total
  recoveredRevenue: number;
};

const CONTACTED_PLUS: LeadStatus[] = [
  "contacted",
  "follow_up_needed",
  "followup_1",
  "followup_2",
  "followup_3",
  "interested",
  "call_requested",
  "recovered",
  "lost",
];

function rate(n: number, d: number): number {
  return d > 0 ? Math.round((n / d) * 1000) / 1000 : 0;
}

export function funnelMetrics(leads: FunnelInput): FunnelMetrics {
  const total = leads.length;
  const contacted = leads.filter((l) => CONTACTED_PLUS.includes(l.status)).length;
  const interested = leads.filter((l) => l.status === "interested" || l.status === "call_requested").length;
  const recoveredLeads = leads.filter((l) => l.status === "recovered");
  const recovered = recoveredLeads.length;
  const lost = leads.filter((l) => l.status === "lost").length;
  return {
    total,
    contacted,
    interested,
    recovered,
    lost,
    contactRate: rate(contacted, total),
    interestRate: rate(interested, total),
    recoveryRate: rate(recovered, total),
    recoveredRevenue: recoveredLeads.reduce((s, l) => s + (Number(l.estimateAmount) || 0), 0),
  };
}

export type AiPerformanceInput = {
  drafted: number;
  approved: number;
  sent: number;
  discarded: number;
};

export type AiPerformance = AiPerformanceInput & {
  approvalRate: number; // approved / drafted
  sendRate: number; // sent / approved
};

export function aiPerformance(i: AiPerformanceInput): AiPerformance {
  return {
    ...i,
    approvalRate: rate(i.approved, i.drafted),
    sendRate: rate(i.sent, i.approved),
  };
}

/** Average first-response time (minutes) from paired inbound→first-draft timestamps. */
export function averageResponseMinutes(pairs: { inboundAt: number; respondedAt: number }[]): number | null {
  const deltas = pairs
    .filter((p) => Number.isFinite(p.inboundAt) && Number.isFinite(p.respondedAt) && p.respondedAt >= p.inboundAt)
    .map((p) => (p.respondedAt - p.inboundAt) / 60_000);
  if (deltas.length === 0) return null;
  return Math.round((deltas.reduce((a, b) => a + b, 0) / deltas.length) * 10) / 10;
}

export type BusinessSummary = {
  period: "daily" | "weekly";
  funnel: FunnelMetrics;
  ai: AiPerformance;
  avgResponseMinutes: number | null;
  highlights: string[];
};

/** Assemble a structured summary + plain-language highlights. */
export function buildSummary(
  period: "daily" | "weekly",
  funnel: FunnelMetrics,
  ai: AiPerformance,
  avgResponseMinutes: number | null,
): BusinessSummary {
  const highlights: string[] = [];
  highlights.push(`${funnel.total} leads tracked; ${funnel.recovered} recovered ($${funnel.recoveredRevenue.toLocaleString()}).`);
  if (ai.drafted > 0) highlights.push(`${ai.drafted} AI drafts, ${Math.round(ai.approvalRate * 100)}% approved.`);
  if (avgResponseMinutes !== null) highlights.push(`Avg first response: ${avgResponseMinutes} min.`);
  if (funnel.recoveryRate > 0) highlights.push(`Recovery rate: ${Math.round(funnel.recoveryRate * 100)}%.`);
  return { period, funnel, ai, avgResponseMinutes, highlights };
}
