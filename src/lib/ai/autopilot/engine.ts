import "server-only";

import { decideNextAction, type LeadFacts } from "@/lib/ai/autopilot/orchestrator-core";
import { DEFAULT_AUTONOMY_LEVEL, isAutonomyLevel, type AutonomyLevel } from "@/lib/ai/autopilot/autonomy";
import type { AiTask, Json } from "@/lib/database.types";
import { generateReply, type ReplyInputs } from "@/lib/gmail/reply";
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

async function loadAutonomy(businessId: string): Promise<{ level: AutonomyLevel; emergencyStop: boolean }> {
  const { data } = await adminDb()
    .from("business_ai_autonomy")
    .select("level, emergency_stop")
    .eq("business_id", businessId)
    .maybeSingle();
  if (!data) return { level: DEFAULT_AUTONOMY_LEVEL, emergencyStop: false };
  return {
    level: isAutonomyLevel(data.level) ? data.level : DEFAULT_AUTONOMY_LEVEL,
    emergencyStop: Boolean(data.emergency_stop),
  };
}

function daysSince(iso: string | null): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

export type TaskOutcome = { result: "drafted" | "unsubscribed" | "skipped" | "noop"; detail?: string };

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

  await audit("autopilot_reply_drafted", { message_id: messageId, reply_id: saved?.id ?? null });
  return { result: "drafted", detail: saved?.id };
}
