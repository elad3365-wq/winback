import { NextResponse, type NextRequest } from "next/server";

import { isCronAuthorized } from "@/lib/security/cron-auth";

import { isWithinBusinessHours } from "@/lib/ai/business-hours";
import { generateFollowup } from "@/lib/ai/anthropic";
import {
  buildFollowupPrompt,
  discountsAllowed,
  mentionsDiscount,
  sanitizeDiscounts,
  verifiedFactsText,
  type FollowupInputs,
} from "@/lib/ai/followup";
import { canGenerateDraft, resolveAiPolicy, utcDayStartIso } from "@/lib/ai/guard";
import { AiBudgetError } from "@/lib/ai/budget";
import { resolveFollowupModel } from "@/lib/ai/models";
import { reviewDraft } from "@/lib/ai/review";
import { delayMinutesForFollowup } from "@/lib/autopilot";
import type { Json, LeadStatus } from "@/lib/database.types";
import { AUTOPILOT_STOP_STATUSES } from "@/lib/leads";
import { createAdminClient, isAutopilotConfigured } from "@/lib/supabase/admin";

/**
 * AI Autopilot scheduler. Runs on a cron, finds leads whose next follow-up is
 * due, and GENERATES A DRAFT for each — it never sends anything. Every draft
 * waits for human approval. Protected by CRON_SECRET; uses the service-role
 * client because it works across all businesses without a user session.
 *
 * Production-quality behaviour:
 * - skips unsubscribed / paused / lost / recovered / interested / call_requested
 * - stops at maximum_followups (advances the lead to "cold")
 * - respects (coarse) business hours — off-hours leads are retried, not dropped
 * - idempotent: one autopilot draft per (lead, follow-up number)
 * - writes an audit row for every decision
 * - honours the per-business AI controls (business_ai_autonomy): AI "off",
 *   emergency stop, daily action limit and daily spend limit. A blocked lead
 *   stays due, so drafting resumes once the owner lifts the stop / the day
 *   rolls over.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH = 100;

function authorized(request: NextRequest): boolean {
  return isCronAuthorized(request.headers.get("authorization"));
}

function followupStatus(n: number): LeadStatus {
  if (n <= 1) return "followup_1";
  if (n === 2) return "followup_2";
  return "followup_3";
}

async function run(): Promise<NextResponse> {
  const admin = createAdminClient();
  if (!admin || !isAutopilotConfigured()) {
    return NextResponse.json(
      { error: "Autopilot is not configured (need SUPABASE_SERVICE_ROLE_KEY and ANTHROPIC_API_KEY)." },
      { status: 503 },
    );
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const summary = {
    processed: 0,
    drafted: 0,
    advancedToCold: 0,
    skipped: {} as Record<string, number>,
  };
  const bump = (key: string) => {
    summary.skipped[key] = (summary.skipped[key] ?? 0) + 1;
  };

  const { data: due, error } = await admin
    .from("leads")
    .select("*")
    .not("next_follow_up_at", "is", null)
    .lte("next_follow_up_at", nowIso)
    .eq("autopilot_paused", false)
    .eq("unsubscribe_status", "subscribed")
    .order("next_follow_up_at", { ascending: true })
    .limit(BATCH);

  if (error) {
    console.error("[cron/followups] due scan failed", error.message);
    return NextResponse.json({ error: "Could not scan due leads." }, { status: 500 });
  }
  if (!due || due.length === 0) {
    return NextResponse.json({ ...summary, message: "nothing due" }, { status: 200 });
  }

  const businessIds = [...new Set(due.map((lead) => lead.business_id))];
  const dayStart = utcDayStartIso(now);
  const [
    { data: settingsRows },
    { data: businessRows },
    { data: autonomyRows },
    { data: knowledgeRows },
    { data: todaysDrafts },
  ] = await Promise.all([
    admin.from("business_ai_settings").select("*").in("business_id", businessIds),
    admin
      .from("businesses")
      .select("id, name, business_type, custom_business_type, currency")
      .in("id", businessIds),
    admin
      .from("business_ai_autonomy")
      .select("business_id, level, emergency_stop, daily_action_limit, daily_spend_limit_usd")
      .in("business_id", businessIds),
    admin
      .from("business_knowledge")
      .select("business_id, title, content")
      .in("business_id", businessIds)
      .eq("approved", true)
      .order("created_at", { ascending: true }),
    admin
      .from("ai_messages")
      .select("business_id, source")
      .in("business_id", businessIds)
      .gte("created_at", dayStart),
  ]);
  const settingsById = new Map((settingsRows ?? []).map((s) => [s.business_id, s]));
  const businessById = new Map((businessRows ?? []).map((b) => [b.id, b]));
  const autonomyById = new Map((autonomyRows ?? []).map((a) => [a.business_id, a]));
  const knowledgeById = new Map<string, string[]>();
  for (const k of knowledgeRows ?? []) {
    const list = knowledgeById.get(k.business_id) ?? [];
    if (list.length < 25) list.push(k.title ? `${k.title}: ${k.content}` : k.content);
    knowledgeById.set(k.business_id, list);
  }
  // Running per-business counts for today's limits (updated as we draft).
  const draftsToday = new Map<string, { all: number; automatic: number }>();
  for (const row of todaysDrafts ?? []) {
    const c = draftsToday.get(row.business_id) ?? { all: 0, automatic: 0 };
    c.all++;
    if (row.source === "autopilot") c.automatic++;
    draftsToday.set(row.business_id, c);
  }
  const model = resolveFollowupModel();

  for (const lead of due) {
    summary.processed++;
    const audit = async (event: string, detail: Json, aiMessageId: string | null = null) => {
      await admin.from("ai_audit_log").insert({
        business_id: lead.business_id,
        lead_id: lead.id,
        ai_message_id: aiMessageId,
        event,
        detail,
      });
    };

    try {
      // Stop states: halt autopilot for this lead entirely.
      if (AUTOPILOT_STOP_STATUSES.includes(lead.status) || lead.status === "cold") {
        await admin.from("leads").update({ next_follow_up_at: null }).eq("id", lead.id);
        bump("stopped_status");
        await audit("skipped_stop_status", { status: lead.status });
        continue;
      }

      const settings = settingsById.get(lead.business_id);
      const business = businessById.get(lead.business_id);
      if (!settings || !business || !settings.autopilot_enabled) {
        await admin.from("leads").update({ next_follow_up_at: null }).eq("id", lead.id);
        bump("autopilot_off");
        await audit("skipped_autopilot_off", {});
        continue;
      }

      // Reached the cap → the sequence is over.
      if (lead.follow_up_count >= settings.maximum_followups) {
        await admin
          .from("leads")
          .update({ status: "cold", next_follow_up_at: null })
          .eq("id", lead.id);
        summary.advancedToCold++;
        await audit("advanced_to_cold", { follow_up_count: lead.follow_up_count });
        continue;
      }

      // Respect business hours: leave it due and retry on a later run.
      if (!isWithinBusinessHours(settings.business_hours, now)) {
        bump("business_hours");
        await audit("skipped_business_hours", {});
        continue;
      }

      // Per-business AI controls. Leave the lead due so it resumes later.
      const counts = draftsToday.get(lead.business_id) ?? { all: 0, automatic: 0 };
      const guard = canGenerateDraft({
        policy: resolveAiPolicy(autonomyById.get(lead.business_id) ?? null),
        trigger: "automatic",
        draftsToday: counts.all,
        automaticDraftsToday: counts.automatic,
        model,
      });
      if (!guard.ok) {
        bump(guard.reason);
        await audit(`skipped_${guard.reason}`, {});
        continue;
      }

      const nextNumber = lead.follow_up_count + 1;

      // Idempotency: never create a second autopilot draft for the same step.
      const { data: existing } = await admin
        .from("ai_messages")
        .select("id")
        .eq("lead_id", lead.id)
        .eq("source", "autopilot")
        .eq("followup_number", nextNumber)
        .in("status", ["draft", "edited", "approved", "sent"])
        .limit(1)
        .maybeSingle();

      if (existing) {
        bump("duplicate_prevented");
        await audit("duplicate_prevented", { followup_number: nextNumber }, existing.id);
      } else {
        const inputs: FollowupInputs = {
          customerName: lead.customer_name,
          service: lead.service,
          estimateAmount: Number(lead.estimate_amount) || 0,
          currency: business.currency || "USD",
          leadStatus: lead.status,
          businessName: business.name,
          businessType: business.business_type ?? business.custom_business_type ?? null,
          financingAvailable: settings.financing_available,
          paymentPlansAvailable: settings.payment_plans_available,
          maximumDiscountPercent: settings.maximum_discount_percent,
          aiCanOfferDiscounts: settings.ai_can_offer_discounts,
          businessHours: settings.business_hours,
          additionalRules: settings.additional_rules,
          channel: "sms",
          tone: settings.tone,
          knowledge: knowledgeById.get(lead.business_id) ?? [],
        };

        let generatedText: string;
        let aiModel: string;
        try {
          const generated = await generateFollowup(inputs, {
            db: admin,
            businessId: lead.business_id,
            source: "autopilot_followup",
          });
          generatedText = generated.content;
          aiModel = generated.model;
        } catch (cause) {
          if (cause instanceof AiBudgetError) {
            // Leave the lead due: drafting resumes when the budget allows.
            bump(`budget_${cause.reason}`);
            await audit("skipped_ai_budget", { reason: cause.reason });
            continue;
          }
          bump("generation_error");
          await audit("generation_error", { message: String(cause).slice(0, 300) });
          continue;
        }
        // Count the spend even if the output is unusable — the call was paid for.
        draftsToday.set(lead.business_id, { all: counts.all + 1, automatic: counts.automatic + 1 });

        const allowDiscount = discountsAllowed(inputs);
        const sanitized = sanitizeDiscounts(generatedText, allowDiscount);
        const review = reviewDraft(sanitized.text, {
          estimateAmount: inputs.estimateAmount,
          discountsAllowed: allowDiscount,
          maximumDiscountPercent: inputs.maximumDiscountPercent,
          financingAvailable: inputs.financingAvailable,
          paymentPlansAvailable: inputs.paymentPlansAvailable,
          verifiedText: verifiedFactsText(inputs),
        });
        const message = review.text;
        if (!message) {
          bump("empty_message");
          await audit("empty_message", {});
          continue;
        }

        const { data: saved } = await admin
          .from("ai_messages")
          .insert({
            business_id: lead.business_id,
            lead_id: lead.id,
            channel: "sms",
            status: "draft",
            source: "autopilot",
            followup_number: nextNumber,
            message,
            ai_model: aiModel,
            discount_offered: allowDiscount && mentionsDiscount(message),
            prompt_inputs: {
              ...inputs,
              prompt: buildFollowupPrompt(inputs),
              review_flags: review.flags,
            },
          })
          .select("id")
          .single();

        summary.drafted++;
        await audit("draft_generated", { followup_number: nextNumber }, saved?.id ?? null);
      }

      // Advance the lead's schedule. The last step schedules a final cold-check
      // that the next run turns into "cold" via the cap branch above.
      const reachedMax = nextNumber >= settings.maximum_followups;
      const nextDelay = reachedMax
        ? delayMinutesForFollowup(settings, 3)
        : delayMinutesForFollowup(settings, nextNumber + 1);
      const nextAt = new Date(now.getTime() + nextDelay * 60_000).toISOString();

      await admin
        .from("leads")
        .update({
          status: followupStatus(nextNumber),
          follow_up_count: nextNumber,
          last_follow_up_at: nowIso,
          next_follow_up_at: nextAt,
        })
        .eq("id", lead.id);
    } catch (cause) {
      bump("error");
      try {
        await audit("run_error", { message: String(cause) });
      } catch {
        // best-effort audit
      }
    }
  }

  return NextResponse.json(summary, { status: 200 });
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  return run();
}

// Allow a manual trigger with the same secret.
export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  return run();
}
