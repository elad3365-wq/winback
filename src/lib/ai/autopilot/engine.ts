import "server-only";

import { decideNextAction, type LeadFacts } from "@/lib/ai/autopilot/orchestrator-core";
import { DEFAULT_AUTONOMY_LEVEL, isAutonomyLevel, type AutonomyLevel } from "@/lib/ai/autopilot/autonomy";
import { crmUpdateForInbound } from "@/lib/ai/autopilot/crm";
import { estimateDraftCostUsd, withinActionLimit, withinSpendLimit } from "@/lib/ai/autopilot/limits";
import { validateOutboundDraft } from "@/lib/ai/autopilot/supervisor";
import { resolveFollowupModel } from "@/lib/ai/models";
import type { AiTask, Json } from "@/lib/database.types";
import {
  decideAutoSend,
  isAutomatedSender,
  isSensitiveInbound,
  replyDefersToHuman,
} from "@/lib/gmail/autosend";
import { generateReply, replyDiscountsAllowed, type ReplyInputs } from "@/lib/gmail/reply";
import { sendApprovedReply, sendingAllowedGlobally } from "@/lib/gmail/send";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * AI Autopilot execution engine. Runs one task to completion using the SERVICE
 * ROLE (the worker has already authorized the business by scoping on
 * business_id). It re-checks autonomy + emergency stop at execution time
 * (defence in depth) and produces only DRAFTS — it never sends. Reuses the
 * existing reply drafter and its discount/no-fabrication guardrails.
 */

function adminDb() {
  const a = createAdminClient();
  if (!a) throw new Error("AI Autopilot requires SUPABASE_SERVICE_ROLE_KEY to be configured.");
  return a;
}

type AutopilotConfig = {
  level: AutonomyLevel;
  emergencyStop: boolean;
  dailyActionLimit: number;
  dailySpendLimitUsd: number;
  sendAuthorized: boolean;
};

async function loadAutonomy(businessId: string): Promise<AutopilotConfig> {
  const { data } = await adminDb()
    .from("business_ai_autonomy")
    .select("level, emergency_stop, daily_action_limit, daily_spend_limit_usd, autopilot_send_authorized")
    .eq("business_id", businessId)
    .maybeSingle();
  if (!data) {
    return { level: DEFAULT_AUTONOMY_LEVEL, emergencyStop: false, dailyActionLimit: 200, dailySpendLimitUsd: 5, sendAuthorized: false };
  }
  return {
    level: isAutonomyLevel(data.level) ? data.level : DEFAULT_AUTONOMY_LEVEL,
    emergencyStop: Boolean(data.emergency_stop),
    dailyActionLimit: Number(data.daily_action_limit ?? 200),
    dailySpendLimitUsd: Number(data.daily_spend_limit_usd ?? 5),
    sendAuthorized: Boolean(data.autopilot_send_authorized),
  };
}

/** Count today's autopilot drafts for a business (for rate/spend enforcement). */
async function draftsToday(businessId: string): Promise<number> {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const { count } = await adminDb()
    .from("ai_audit_log")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .eq("event", "autopilot_reply_drafted")
    .gte("created_at", start.toISOString());
  return count ?? 0;
}

function daysSince(iso: string | null): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

export type TaskOutcome = { result: "drafted" | "sent" | "unsubscribed" | "skipped" | "noop"; detail?: string };

/** Dispatch a task by type. Unknown types are a successful no-op. */
export async function executeTask(task: AiTask): Promise<TaskOutcome> {
  switch (task.type) {
    case "inbound_email":
      return executeInboundEmail(task);
    default:
      return { result: "noop", detail: `No handler for task type ${task.type}.` };
  }
}

/**
 * An inbound customer email arrived: let the orchestrator decide, then act —
 * record an unsubscribe, or draft a reply for owner approval. Never sends.
 */
async function executeInboundEmail(task: AiTask): Promise<TaskOutcome> {
  const db = adminDb();
  const businessId = task.business_id;
  const messageId = (task.payload as { messageId?: string } | null)?.messageId;
  if (!messageId) return { result: "noop", detail: "Missing messageId." };

  const autonomy = await loadAutonomy(businessId);
  if (autonomy.level === "off") return { result: "skipped", detail: "Autonomy is off." };
  if (autonomy.emergencyStop) return { result: "skipped", detail: "Emergency stop active." };

  const { data: message } = await db
    .from("business_email_messages")
    .select("*")
    .eq("id", messageId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (!message || message.direction !== "inbound") return { result: "noop", detail: "No inbound message." };

  const [{ data: business }, { data: settings }, leadRes] = await Promise.all([
    db.from("businesses").select("id, name, business_type, custom_business_type, currency").eq("id", businessId).maybeSingle(),
    db.from("business_ai_settings").select("*").eq("business_id", businessId).maybeSingle(),
    message.lead_id
      ? db.from("leads").select("*").eq("id", message.lead_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (!business) return { result: "noop", detail: "No business." };

  const lead = leadRes.data;
  const facts: LeadFacts = {
    status: lead?.status ?? "new",
    estimateAmount: Number(lead?.estimate_amount) || 0,
    daysSinceLastContact: daysSince(lead?.last_follow_up_at ?? lead?.created_at ?? null),
    followUpCount: lead?.follow_up_count ?? 0,
    unsubscribed: lead?.unsubscribe_status === "unsubscribed",
  };

  const decision = decideNextAction(
    { kind: "inbound_email", lead: facts, messageText: message.body_text ?? message.snippet ?? "" },
    {
      autonomy: { level: autonomy.level, emergencyStop: autonomy.emergencyStop, sendingEnabled: false },
      maxFollowups: settings?.maximum_followups ?? 3,
    },
  );

  const audit = async (event: string, detail: Json) => {
    await db.from("ai_audit_log").insert({ business_id: businessId, lead_id: message.lead_id, event, detail });
  };

  // Unsubscribe → mark the linked lead; no reply.
  if (decision.action === "update_crm") {
    if (message.lead_id) {
      await db
        .from("leads")
        .update({ unsubscribe_status: "unsubscribed", next_follow_up_at: null })
        .eq("id", message.lead_id)
        .eq("business_id", businessId);
    }
    await audit("autopilot_unsubscribe", { message_id: messageId });
    return { result: "unsubscribed" };
  }

  if (decision.action !== "draft_reply") {
    await audit("autopilot_noop", { message_id: messageId, action: decision.action });
    return { result: "noop", detail: decision.action };
  }

  // Idempotency: don't create a second active draft for this message.
  const { data: existing } = await db
    .from("business_email_replies")
    .select("id")
    .eq("business_id", businessId)
    .eq("message_id", messageId)
    .in("status", ["draft", "edited", "approved"])
    .limit(1)
    .maybeSingle();
  if (existing) return { result: "skipped", detail: "Active draft already exists." };

  // Per-business rate + AI-spend limits (Phase 3): stop before paying for a draft
  // once today's caps are reached.
  const usedToday = await draftsToday(businessId);
  const estCost = estimateDraftCostUsd(resolveFollowupModel());
  if (!withinActionLimit(usedToday, autonomy.dailyActionLimit)) {
    await audit("autopilot_rate_limited", { message_id: messageId, used_today: usedToday, limit: autonomy.dailyActionLimit });
    return { result: "skipped", detail: "Daily action limit reached." };
  }
  if (!withinSpendLimit(usedToday * estCost, estCost, autonomy.dailySpendLimitUsd)) {
    await audit("autopilot_spend_limited", { message_id: messageId, limit_usd: autonomy.dailySpendLimitUsd });
    return { result: "skipped", detail: "Daily AI spend limit reached." };
  }

  // Verified business memory (Phase 4): approved knowledge the AI may cite.
  const { data: knowledgeRows } = await db
    .from("business_knowledge")
    .select("title, content")
    .eq("business_id", businessId)
    .eq("approved", true)
    .limit(25);
  const knowledge = (knowledgeRows ?? []).map((k) => (k.title ? `${k.title}: ${k.content}` : k.content));

  const inputs: ReplyInputs = {
    businessName: business.name,
    businessType: business.business_type ?? business.custom_business_type ?? null,
    financingAvailable: settings?.financing_available ?? false,
    paymentPlansAvailable: settings?.payment_plans_available ?? false,
    maximumDiscountPercent: settings?.maximum_discount_percent ?? 0,
    aiCanOfferDiscounts: settings?.ai_can_offer_discounts ?? false,
    businessHours: settings?.business_hours ?? null,
    additionalRules: settings?.additional_rules ?? null,
    tone: settings?.tone ?? "professional",
    currency: business.currency || "USD",
    inbound: { fromName: message.from_address, subject: message.subject, bodyText: message.body_text ?? message.snippet ?? "" },
    lead: lead ? { customerName: lead.customer_name, service: lead.service, estimateAmount: Number(lead.estimate_amount) || 0 } : null,
    knowledge,
  };

  const generated = await generateReply(inputs);
  if (!generated.content) {
    await audit("autopilot_empty_reply", { message_id: messageId });
    return { result: "noop", detail: "Empty reply." };
  }

  const { data: saved } = await db
    .from("business_email_replies")
    .insert({
      business_id: businessId,
      message_id: messageId,
      lead_id: message.lead_id,
      status: "draft",
      body: generated.content,
      ai_model: generated.model,
      discount_offered: generated.discountOffered,
      prompt_inputs: { source: "autopilot", inbound_subject: message.subject },
    })
    .select("id")
    .maybeSingle();

  // CRM auto-update (Phase 2): advance the lead stage from detected intent and
  // pause its follow-up sequence (the customer engaged). Internal action only.
  if (lead && message.lead_id) {
    const crm = crmUpdateForInbound({ intent: decision.intent ?? "low", currentStatus: lead.status });
    if (Object.keys(crm).length > 0) {
      await db.from("leads").update(crm).eq("id", message.lead_id).eq("business_id", businessId);
      await db.from("lead_activity").insert({
        business_id: businessId,
        lead_id: message.lead_id,
        type: "autopilot_crm_update",
        metadata: { message_id: messageId, intent: decision.intent ?? "low", ...crm },
      });
    }
  }

  // Autonomous send decision (full automation). A reply is only put on the wire
  // when the owner is at AUTOPILOT, has authorized real sending, the environment
  // allows sending, and the draft is safe/confident/answering. Everything else —
  // the pilot default — leaves the draft for owner approval (DRAFT behaviour).
  const autoSend = decideAutoSend({
    globalSendEnabled: sendingAllowedGlobally(),
    autopilot: autonomy.level === "autopilot",
    ownerAuthorizedSending: autonomy.sendAuthorized,
    emergencyStop: autonomy.emergencyStop,
    recipientUnsubscribed: facts.unsubscribed,
    automatedSender: isAutomatedSender(message.from_address),
    sensitive: isSensitiveInbound(message.body_text ?? message.snippet ?? ""),
    draftValid: validateOutboundDraft(generated.content, "send_email", {
      discountsAllowed: replyDiscountsAllowed(inputs),
      recipientUnsubscribed: facts.unsubscribed,
    }).ok,
    defersToHuman: replyDefersToHuman(generated.content),
  });

  await audit("autopilot_reply_drafted", {
    message_id: messageId,
    reply_id: saved?.id ?? null,
    auto_send: autoSend.send,
    hold_reason: autoSend.send ? null : autoSend.reason,
  });

  if (saved?.id && autoSend.send) {
    const sent = await sendApprovedReply({ businessId, replyId: saved.id, approve: true, approvedBy: null });
    if (sent.ok) {
      await audit("autopilot_reply_sent", {
        message_id: messageId,
        reply_id: saved.id,
        gmail_message_id: sent.gmailMessageId,
      });
      if (message.lead_id) {
        await db.from("lead_activity").insert({
          business_id: businessId,
          lead_id: message.lead_id,
          type: "autopilot_reply_sent",
          metadata: { message_id: messageId, reply_id: saved.id },
        });
      }
      return { result: "sent", detail: saved.id };
    }
    await audit("autopilot_send_failed", {
      message_id: messageId,
      reply_id: saved.id,
      reason: sent.error.slice(0, 200),
      code: sent.code ?? null,
    });
  }

  return { result: "drafted", detail: saved?.id };
}
