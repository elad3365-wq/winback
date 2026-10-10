import "server-only";

import type { AiTone } from "@/lib/database.types";
import { completeText, type FollowupGeneration } from "@/lib/ai/anthropic";
import { sanitizeDiscounts } from "@/lib/ai/followup";

/**
 * AI email-reply drafting for a per-business Gmail inbox. Same guardrails as the
 * follow-up drafter — use ONLY the business facts provided, never invent prices
 * / offers / availability, respect the discount ceiling and policies, and if the
 * answer isn't known say a team member will follow up. The reply is grounded in
 * the EXACT inbound message so it answers the customer's actual question. The
 * prompt builder is pure so the guardrails can be unit-tested.
 */

export type ReplyInputs = {
  businessName: string;
  businessType: string | null;
  financingAvailable: boolean;
  paymentPlansAvailable: boolean;
  maximumDiscountPercent: number;
  aiCanOfferDiscounts: boolean;
  businessHours: string | null;
  additionalRules: string | null;
  tone: AiTone;
  currency: string;
  inbound: { fromName: string | null; subject: string | null; bodyText: string };
  /** Optional linked lead for extra grounding (the estimate they received). */
  lead: { customerName: string; service: string; estimateAmount: number } | null;
};

const TONE_INSTRUCTIONS: Record<AiTone, string> = {
  professional: "Tone: professional and polished, respectful and competent.",
  friendly: "Tone: warm, friendly and conversational, like a helpful local business.",
  direct: "Tone: direct and concise — get to the point, no filler.",
  premium: "Tone: premium and refined, confident and high-end without being stuffy.",
};

/** Mirrors the follow-up drafter: a discount may be mentioned only when allowed AND the ceiling > 0. */
export function replyDiscountsAllowed(inputs: ReplyInputs): boolean {
  return inputs.aiCanOfferDiscounts && inputs.maximumDiscountPercent > 0;
}

function money(amount: number, currency: string): string {
  const value = Number.isFinite(amount) ? amount : 0;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD", maximumFractionDigits: 0 }).format(value);
  } catch {
    return `${value} ${currency || "USD"}`;
  }
}

export function buildReplyPrompt(inputs: ReplyInputs): { system: string; user: string } {
  const allowDiscount = replyDiscountsAllowed(inputs);

  const discountRule = allowDiscount
    ? `Discounts: you MAY reference a discount of up to ${inputs.maximumDiscountPercent}% — never more. Only if it genuinely helps; offering none is always fine.`
    : `Discounts: this business does NOT allow discounts. Never mention, imply, hint at, or offer any discount, deal, price cut, coupon, "special", or percentage off — none, under any wording.`;
  const financingRule = inputs.financingAvailable
    ? "Financing is available — you may mention it briefly if relevant."
    : "Do not mention financing; it is not offered.";
  const paymentPlanRule = inputs.paymentPlansAvailable
    ? "Payment plans are available — you may mention them briefly if relevant."
    : "Do not mention payment plans; they are not offered.";
  const businessKind = inputs.businessType?.trim()
    ? `${inputs.businessName} (a ${inputs.businessType} business)`
    : inputs.businessName;

  const system = [
    "You write a reply email on behalf of a local service business, answering a customer's email. The reply is a DRAFT the business owner will review before anything is sent.",
    "",
    "Hard rules — never break these:",
    "- Answer the customer's ACTUAL question using ONLY the business facts provided below. Never invent prices, guarantees, timelines, availability, offers, or facts that are not given.",
    "- If the customer asks something you do not have the facts to answer, do NOT guess — say a team member will follow up with the specifics.",
    `- ${discountRule}`,
    `- ${financingRule}`,
    `- ${paymentPlanRule}`,
    "- Respect the business's additional rules and business hours if provided.",
    "- No placeholders or brackets like [Name]; use the real names given. Do not claim anything has been scheduled, booked, or confirmed.",
    "",
    TONE_INSTRUCTIONS[inputs.tone],
    "",
    "Style: a brief, natural email reply — a one-line greeting, 2–5 short sentences that directly address what they wrote, and a soft next step. No subject line, no signature block beyond the business name. Plain text only.",
    "",
    "Output only the reply body text — no preamble, no quotes, no explanation.",
  ].join("\n");

  const leadFacts = inputs.lead
    ? [
        `Linked lead: ${inputs.lead.customerName}`,
        `Service they got an estimate for: ${inputs.lead.service}`,
        `Estimate amount: ${money(inputs.lead.estimateAmount, inputs.currency)}`,
      ]
    : [];

  const details = [
    `Business: ${businessKind}`,
    `Financing available: ${inputs.financingAvailable ? "yes" : "no"}`,
    `Payment plans available: ${inputs.paymentPlansAvailable ? "yes" : "no"}`,
    `Discounts allowed: ${allowDiscount ? `yes, up to ${inputs.maximumDiscountPercent}%` : "no"}`,
    inputs.businessHours?.trim() ? `Business hours: ${inputs.businessHours.trim()}` : null,
    inputs.additionalRules?.trim() ? `Additional business rules to honour: ${inputs.additionalRules.trim()}` : null,
    ...leadFacts,
  ]
    .filter(Boolean)
    .join("\n");

  const inbound = [
    `From: ${inputs.inbound.fromName ?? "the customer"}`,
    inputs.inbound.subject ? `Subject: ${inputs.inbound.subject}` : null,
    "Message:",
    inputs.inbound.bodyText.trim().slice(0, 4000),
  ]
    .filter(Boolean)
    .join("\n");

  const user = [
    "Business facts you may use (and nothing else):",
    details,
    "",
    "The customer's email you are replying to:",
    inbound,
    "",
    "Write one reply email body now.",
  ].join("\n");

  return { system, user };
}

export type ReplyGeneration = FollowupGeneration & { discountOffered: boolean };

/** Generate a reply draft. Applies the discount sanitizer to the model output. */
export async function generateReply(inputs: ReplyInputs): Promise<ReplyGeneration> {
  const { system, user } = buildReplyPrompt(inputs);
  const result = await completeText(system, user, 1024);
  const allowDiscount = replyDiscountsAllowed(inputs);
  const { text, mentionedDiscount } = sanitizeDiscounts(result.content, allowDiscount);
  return { content: text, model: result.model, discountOffered: allowDiscount && mentionedDiscount };
}
