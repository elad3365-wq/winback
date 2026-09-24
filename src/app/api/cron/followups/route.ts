import { NextResponse, type NextRequest } from "next/server";

import { isWithinBusinessHours } from "@/lib/ai/business-hours";
import { generateFollowup } from "@/lib/ai/anthropic";
import {
  buildFollowupPrompt,
  discountsAllowed,
  sanitizeDiscounts,
  type FollowupInputs,
} from "@/lib/ai/followup";
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
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH = 100;

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false; // never run unprotected
  return request.headers.get("authorization") === `Bearer ${secret}`;
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!due || due.length === 0) {
    return NextResponse.json({ ...summary, message: "nothing due" }, { status: 200 });
  }

  const businessIds = [...new Set(due.map((lead) => lead.business_id))];
  const [{ data: settingsRows }, { data: businessRows }] = await Promise.all([
    admin.from("business_ai_settings").select("*").in("business_id", businessIds),
    admin
      .from("businesses")
      .select("id, name, business_type, custom_business_type, currency")
      .in("id", businessIds),
  ]);
  const settingsById = new Map((settingsRows ?? []).map((s) => [s.business_id, s]));
  const businessById = new Map((businessRows ?? []).map((b) => [b.id, b]));

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

      const nextNumber = lead.follow_up_count + 1;

      // Idempotency: never create a second autopilot draft for the same step.
      const { data: existing } = await admin
        .from("ai_messages")
        .select("id")
        .eq("lead_id", lead.id)
        .eq("source", "autopilot")
        .eq("followup_number", nextNumber)
        .in("status", ["draft", "approved", "sent"])
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
        };

        let generatedText: string;
        let aiModel: string;
        try {
          const generated = await generateFollowup(inputs);
          generatedText = generated.content;
          aiModel = generated.model;
        } catch (cause) {
          bump("generation_error");
          await audit("generation_error", { message: String(cause) });
          continue;
        }

        const allowDiscount = discountsAllowed(inputs);
        const { text: message, mentionedDiscount } = sanitizeDiscounts(generatedText, allowDiscount);
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
            discount_offered: allowDiscount && mentionedDiscount,
            prompt_inputs: { ...inputs, prompt: buildFollowupPrompt(inputs) },
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
