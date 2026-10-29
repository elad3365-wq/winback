import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import { AiNotConfiguredError, FOLLOWUP_MODEL } from "@/lib/ai/anthropic";
import { buildEmailReplyPrompt, isNoReply, type EmailReplyInputs } from "@/lib/ai/email-reply";
import { sanitizeDiscounts } from "@/lib/ai/followup";
import type { BusinessAiSettings, Database, Lead } from "@/lib/database.types";

type BusinessRow = Pick<
  Database["public"]["Tables"]["businesses"]["Row"],
  "name" | "business_type" | "custom_business_type" | "currency"
>;

export function emailReplyInputs(input: {
  business: BusinessRow;
  settings: BusinessAiSettings | null;
  lead: Pick<Lead, "customer_name" | "service" | "estimate_amount"> | null;
  senderName: string | null;
  subject: string | null;
  body: string;
}): EmailReplyInputs {
  const s = input.settings;
  return {
    businessName: input.business.name,
    businessType: input.business.business_type ?? input.business.custom_business_type ?? null,
    // No settings row means the safest defaults: no discounts, no financing.
    tone: s?.tone ?? "professional",
    financingAvailable: s?.financing_available ?? false,
    paymentPlansAvailable: s?.payment_plans_available ?? false,
    maximumDiscountPercent: s?.maximum_discount_percent ?? 0,
    aiCanOfferDiscounts: s?.ai_can_offer_discounts ?? false,
    businessHours: s?.business_hours ?? null,
    additionalRules: s?.additional_rules ?? null,
    lead: input.lead
      ? {
          customerName: input.lead.customer_name,
          service: input.lead.service,
          estimateAmount: Number(input.lead.estimate_amount) || 0,
          currency: input.business.currency || "USD",
        }
      : null,
    senderName: input.senderName,
    subject: input.subject,
    body: input.body,
  };
}

export type EmailReplyResult =
  | { kind: "draft"; body: string; model: string; discountOffered: boolean }
  | { kind: "no_reply" };

/** Writes one reply draft with the business's own AI settings. Never sends anything. */
export async function generateEmailReply(inputs: EmailReplyInputs): Promise<EmailReplyResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new AiNotConfiguredError();

  const client = new Anthropic({ apiKey });
  const { system, user } = buildEmailReplyPrompt(inputs);

  const response = await client.messages.create({
    model: FOLLOWUP_MODEL,
    max_tokens: 1024,
    output_config: { effort: "low" },
    system,
    messages: [{ role: "user", content: user }],
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();

  if (!text || isNoReply(text)) return { kind: "no_reply" };

  const allowDiscount = inputs.aiCanOfferDiscounts && inputs.maximumDiscountPercent > 0;
  const { text: body, mentionedDiscount } = sanitizeDiscounts(text, allowDiscount);
  if (!body) return { kind: "no_reply" };

  return {
    kind: "draft",
    body,
    model: response.model ?? FOLLOWUP_MODEL,
    discountOffered: allowDiscount && mentionedDiscount,
  };
}
