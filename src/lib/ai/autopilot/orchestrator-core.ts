/**
 * AI Manager / Orchestrator core (Phase 2 agent #1) — pure routing.
 *
 * Given a business/customer event and the business's autonomy context, it picks
 * the responsible agent and the next action, folds in the sales signals and the
 * retention cadence rules, runs the action through the autonomy policy, and
 * decides whether it must go to the owner. No side effects: the execution engine
 * takes this decision and enqueues/performs it (subject to the same policy).
 */

import {
  decideAutonomy,
  HIGH_IMPACT_ACTIONS,
  type AgentAction,
  type AutonomyContext,
  type AutonomyResult,
} from "@/lib/ai/autopilot/autonomy";
import { canReengage } from "@/lib/ai/autopilot/retention";
import { classifyIntent, scoreOpportunity, type BuyingIntent } from "@/lib/ai/autopilot/scoring";
import { requiresHumanReview } from "@/lib/ai/autopilot/supervisor";
import type { LeadStatus } from "@/lib/database.types";
import { isUnsubscribeRequest } from "@/lib/gmail/reply-detection";

export type LeadFacts = {
  status: LeadStatus;
  estimateAmount: number;
  daysSinceLastContact: number;
  followUpCount: number;
  unsubscribed: boolean;
};

export type AutopilotEvent =
  | { kind: "new_lead"; lead: LeadFacts }
  | { kind: "inbound_email"; lead: LeadFacts; messageText: string }
  | { kind: "stalled_deal"; lead: LeadFacts }
  | { kind: "inactive_customer"; lead: LeadFacts };

export type OrchestrationContext = {
  autonomy: AutonomyContext;
  maxFollowups: number;
  /** Agent confidence for the proposed action, 0..1 (defaults to 1 for deterministic routing). */
  confidence?: number;
};

export type AgentName = "sales" | "crm" | "communication" | "retention";

export type NextAction = {
  agent: AgentName;
  action: AgentAction;
  intent?: BuyingIntent;
  score?: number;
  autonomy: AutonomyResult;
  requiresApproval: boolean;
  priority: number; // 0..100, higher = sooner
  reason: string;
};

function finalize(
  agent: AgentName,
  action: AgentAction,
  ctx: OrchestrationContext,
  priority: number,
  reason: string,
  extra?: { intent?: BuyingIntent; score?: number },
): NextAction {
  const autonomy = decideAutonomy(action, ctx.autonomy);
  const requiresApproval = requiresHumanReview({
    autonomyDecision: autonomy.decision,
    confidence: ctx.confidence ?? 1,
    highImpact: HIGH_IMPACT_ACTIONS.has(action),
  });
  return { agent, action, autonomy, requiresApproval, priority, reason, ...extra };
}

export function decideNextAction(event: AutopilotEvent, ctx: OrchestrationContext): NextAction {
  switch (event.kind) {
    case "inbound_email": {
      // A customer reply. Unsubscribe is an internal CRM stop; otherwise draft a reply.
      if (isUnsubscribeRequest(event.messageText)) {
        return finalize("communication", "update_crm", ctx, 95, "Customer requested to unsubscribe.");
      }
      const intent = classifyIntent(event.messageText);
      const score = scoreOpportunity({
        estimateAmount: event.lead.estimateAmount,
        status: event.lead.status,
        daysSinceLastContact: event.lead.daysSinceLastContact,
        intent,
      });
      const priority = intent === "high" ? 90 : intent === "medium" ? 70 : 55;
      return finalize("communication", "draft_reply", ctx, priority, `Customer replied (intent: ${intent}).`, {
        intent,
        score,
      });
    }

    case "new_lead": {
      const intent = classifyIntent(null); // no message yet
      const score = scoreOpportunity({
        estimateAmount: event.lead.estimateAmount,
        status: event.lead.status,
        daysSinceLastContact: event.lead.daysSinceLastContact,
        intent: "low",
      });
      return finalize("sales", "draft_followup", ctx, Math.min(80, 40 + Math.round(score / 2)), "New lead to engage.", {
        intent,
        score,
      });
    }

    case "stalled_deal": {
      const score = scoreOpportunity({
        estimateAmount: event.lead.estimateAmount,
        status: event.lead.status,
        daysSinceLastContact: event.lead.daysSinceLastContact,
        intent: "low",
      });
      return finalize("sales", "draft_followup", ctx, 50, "Open deal has gone quiet — recommend a follow-up.", {
        score,
      });
    }

    case "inactive_customer": {
      const eligibility = canReengage({
        status: event.lead.status,
        unsubscribed: event.lead.unsubscribed,
        followUpCount: event.lead.followUpCount,
        maxFollowups: ctx.maxFollowups,
        daysSinceLastContact: event.lead.daysSinceLastContact,
      });
      if (!eligibility.allowed) {
        // Nothing outward: record the assessment only (read-only, no approval needed).
        return finalize("retention", "summarize", ctx, 10, `No re-engagement: ${eligibility.reason}`);
      }
      return finalize("retention", "draft_followup", ctx, 30, "Inactive customer eligible for a win-back touch.");
    }
  }
}
