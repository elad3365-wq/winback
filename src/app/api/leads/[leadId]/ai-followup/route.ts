import { NextResponse, type NextRequest } from "next/server";

import {
  AiNotConfiguredError,
  generateFollowup,
  isAiConfigured,
} from "@/lib/ai/anthropic";
import {
  buildFollowupPrompt,
  discountsAllowed,
  sanitizeDiscounts,
  type FollowupInputs,
} from "@/lib/ai/followup";
import { createClient } from "@/lib/supabase/server";

// Uses the Anthropic SDK and the request cookies, so it must run on Node.js and
// never be cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Abuse protection: how many drafts one business may generate per rolling
// minute. Generous for a human clicking "Generate", low enough to cap the API
// bill if the endpoint is hammered.
const RATE_LIMIT_PER_MINUTE = 20;

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status });
}

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ leadId: string }> },
) {
  const { leadId } = await ctx.params;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return json({ error: "You need to be signed in." }, 401);
  }

  // Fail fast with a clear message rather than a provider error if the key is
  // missing on this deployment.
  if (!isAiConfigured()) {
    return json(
      { error: "AI is not configured yet. Add the ANTHROPIC_API_KEY environment variable." },
      503,
    );
  }

  const body = (await request.json().catch(() => ({}))) as { channel?: unknown };
  const channel: "sms" | "email" = body.channel === "email" ? "email" : "sms";

  // RLS makes this return a row only when the caller belongs to the lead's
  // business, so this both loads the lead and authorizes the request.
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .maybeSingle();

  if (leadError) {
    return json({ error: "Could not load the lead." }, 500);
  }
  if (!lead) {
    return json({ error: "Lead not found." }, 404);
  }

  const [{ data: business }, { data: settings }] = await Promise.all([
    supabase
      .from("businesses")
      .select("id, name, business_type, custom_business_type, currency")
      .eq("id", lead.business_id)
      .maybeSingle(),
    supabase
      .from("business_ai_settings")
      .select("*")
      .eq("business_id", lead.business_id)
      .maybeSingle(),
  ]);

  if (!business) {
    return json({ error: "Could not load your business." }, 500);
  }

  // Rate limit: count this business's drafts in the last minute.
  const windowStart = new Date(Date.now() - 60_000).toISOString();
  const { count } = await supabase
    .from("ai_messages")
    .select("id", { count: "exact", head: true })
    .eq("business_id", lead.business_id)
    .gte("created_at", windowStart);

  if ((count ?? 0) >= RATE_LIMIT_PER_MINUTE) {
    return json(
      { error: "You're generating messages very quickly. Give it a moment and try again." },
      429,
    );
  }

  // Missing settings are treated as the most conservative case: no financing,
  // no payment plans, and no discounts — so nothing is ever offered that the
  // business did not explicitly turn on.
  const inputs: FollowupInputs = {
    customerName: lead.customer_name,
    service: lead.service,
    estimateAmount: Number(lead.estimate_amount) || 0,
    currency: business.currency || "USD",
    leadStatus: lead.status,
    businessName: business.name,
    businessType: business.business_type ?? business.custom_business_type ?? null,
    financingAvailable: settings?.financing_available ?? false,
    paymentPlansAvailable: settings?.payment_plans_available ?? false,
    maximumDiscountPercent: settings?.maximum_discount_percent ?? 0,
    aiCanOfferDiscounts: settings?.ai_can_offer_discounts ?? false,
    businessHours: settings?.business_hours ?? null,
    additionalRules: settings?.additional_rules ?? null,
    channel,
    tone: settings?.tone ?? "professional",
  };

  let generatedText: string;
  let model: string;
  try {
    const result = await generateFollowup(inputs);
    generatedText = result.content;
    model = result.model;
  } catch (error) {
    if (error instanceof AiNotConfiguredError) {
      return json({ error: "AI is not configured yet." }, 503);
    }
    console.error("[ai/followup] generation failed", error);
    return json({ error: "The AI service is unavailable right now. Please try again." }, 502);
  }

  // Enforce the discount rule a second time on the output itself, in case the
  // model slipped past the prompt.
  const allowDiscount = discountsAllowed(inputs);
  const { text: content, mentionedDiscount } = sanitizeDiscounts(generatedText, allowDiscount);

  if (!content) {
    console.error("[ai/followup] empty message after sanitising");
    return json({ error: "Couldn't generate a usable message. Please try again." }, 502);
  }

  const discountOffered = allowDiscount && mentionedDiscount;

  // Store the draft (and a snapshot of exactly what it was built from) as one
  // row of history. Nothing is sent.
  const { data: saved, error: saveError } = await supabase
    .from("ai_messages")
    .insert({
      business_id: lead.business_id,
      lead_id: lead.id,
      channel,
      status: "draft",
      source: "manual",
      message: content,
      ai_model: model,
      prompt_inputs: { ...inputs, prompt: buildFollowupPrompt(inputs) },
      discount_offered: discountOffered,
      created_by: user.id,
    })
    .select("id, created_at")
    .single();

  if (saveError || !saved) {
    console.error("[ai/followup] could not save draft", saveError);
    return json({ error: "Generated the message but couldn't save it. Please try again." }, 500);
  }

  return json(
    {
      id: saved.id,
      message: content,
      channel,
      discountOffered,
      createdAt: saved.created_at,
    },
    200,
  );
}
