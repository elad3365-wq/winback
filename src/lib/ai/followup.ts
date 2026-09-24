import type { AiTone, LeadStatus } from "@/lib/database.types";
import { LEAD_STATUS_LABELS } from "@/lib/leads";

/**
 * Everything the model is allowed to know about one follow-up, and the pure
 * helpers that turn it into a prompt and keep the result inside the business's
 * rules. No network calls live here so the guardrails can be reasoned about and
 * (later) unit-tested on their own.
 */
export type FollowupInputs = {
  customerName: string;
  service: string;
  estimateAmount: number;
  currency: string;
  leadStatus: LeadStatus;
  businessName: string;
  businessType: string | null;
  financingAvailable: boolean;
  paymentPlansAvailable: boolean;
  maximumDiscountPercent: number;
  aiCanOfferDiscounts: boolean;
  businessHours: string | null;
  additionalRules: string | null;
  channel: "sms" | "email";
  tone: AiTone;
};

const TONE_INSTRUCTIONS: Record<AiTone, string> = {
  professional: "Tone: professional and polished, respectful and competent.",
  friendly: "Tone: warm, friendly and conversational, like a helpful local business.",
  direct: "Tone: direct and concise — get to the point, no filler.",
  premium: "Tone: premium and refined, confident and high-end without being stuffy.",
};

/**
 * A discount may be mentioned only when the business both allows it AND set a
 * ceiling above zero. Everything downstream keys off this one derived flag so
 * the rule can never drift between the prompt and the post-check.
 */
export function discountsAllowed(inputs: FollowupInputs): boolean {
  return inputs.aiCanOfferDiscounts && inputs.maximumDiscountPercent > 0;
}

function money(amount: number, currency: string): string {
  const value = Number.isFinite(amount) ? amount : 0;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${value} ${currency || "USD"}`;
  }
}

export function buildFollowupPrompt(inputs: FollowupInputs): {
  system: string;
  user: string;
} {
  const allowDiscount = discountsAllowed(inputs);

  const discountRule = allowDiscount
    ? `Discounts: you MAY reference a discount of up to ${inputs.maximumDiscountPercent}% — never more. Do not invent a specific figure beyond that ceiling, and only bring one up if it helps re-open the conversation. It is always fine to offer no discount at all.`
    : `Discounts: this business does NOT allow discounts. Never mention, imply, hint at, or offer any discount, deal, price cut, coupon, "special", or percentage off — none, under any wording.`;

  const financingRule = inputs.financingAvailable
    ? "Financing is available — you may mention it briefly if useful."
    : "Do not mention financing; it is not offered.";

  const paymentPlanRule = inputs.paymentPlansAvailable
    ? "Payment plans are available — you may mention them briefly if useful."
    : "Do not mention payment plans; they are not offered.";

  const businessKind = inputs.businessType?.trim()
    ? `${inputs.businessName} (a ${inputs.businessType} business)`
    : inputs.businessName;

  const system = [
    "You write short, warm, natural follow-up messages for a local service business that is re-engaging a customer who received an estimate and then went quiet.",
    "",
    "Hard rules — never break these:",
    "- Use ONLY the facts provided in the customer/business details. Never invent prices, guarantees, timelines, availability, offers, or facts that are not given.",
    "- Never promise anything that is not explicitly present in the business details.",
    "- If any detail is uncertain, missing, or the customer would need specifics you don't have, do NOT guess — say a team member will confirm the details.",
    `- ${discountRule}`,
    `- ${financingRule}`,
    `- ${paymentPlanRule}`,
    "- Respect the business's additional rules and business hours if provided.",
    "- No placeholders or brackets like [Name] or [Company]; use the real names given.",
    "- This is a DRAFT for the business owner to review. Do not claim anything has been scheduled, booked, or confirmed.",
    "",
    TONE_INSTRUCTIONS[inputs.tone],
    "",
    "Style:",
    inputs.channel === "email"
      ? "- Write a brief email: a friendly one-line greeting, 2–4 short sentences, and a soft call to action. No subject line."
      : "- Write a text message: 2–3 short sentences, friendly and conversational, suitable for SMS. No greeting header, no signature block.",
    "- Reference the specific service and, naturally, that they received an estimate.",
    "- Be helpful and low-pressure, not salesy or pushy. No emojis unless it reads naturally to include at most one.",
    "- Sign off in the business's voice where it fits (e.g. mention the business name once). Plain text only.",
    "",
    "Output only the message text — no preamble, no explanation, no quotes around it.",
  ].join("\n");

  const details = [
    `Customer name: ${inputs.customerName}`,
    `Service they got an estimate for: ${inputs.service}`,
    `Estimate amount: ${money(inputs.estimateAmount, inputs.currency)}`,
    `Current lead status: ${LEAD_STATUS_LABELS[inputs.leadStatus] ?? inputs.leadStatus}`,
    `Business: ${businessKind}`,
    `Financing available: ${inputs.financingAvailable ? "yes" : "no"}`,
    `Payment plans available: ${inputs.paymentPlansAvailable ? "yes" : "no"}`,
    `Discounts allowed by this business: ${
      allowDiscount ? `yes, up to ${inputs.maximumDiscountPercent}%` : "no"
    }`,
    inputs.businessHours?.trim() ? `Business hours: ${inputs.businessHours.trim()}` : null,
    inputs.additionalRules?.trim()
      ? `Additional business rules to honour: ${inputs.additionalRules.trim()}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  const user = [
    "Write one follow-up message for this customer using only these details:",
    "",
    details,
  ].join("\n");

  return { system, user };
}

// Words/patterns that signal a discount was offered. Used both to redact the
// model's output when discounts are not allowed and to record whether an
// allowed draft actually referenced one.
const DISCOUNT_PATTERN =
  /\b(discount|discounts|% ?off|percent off|price ?cut|coupon|promo(?:tion)?|markdown|marked down|deal|special offer|save \d|knock off)\b/i;

export function mentionsDiscount(text: string): boolean {
  return DISCOUNT_PATTERN.test(text);
}

/**
 * Belt-and-suspenders guard. The prompt already forbids discounts when they are
 * not allowed, but a model can still slip — so when discounts are disallowed we
 * drop any sentence that references one. If that empties the message, the caller
 * treats it as a generation failure rather than shipping a blank or a leak.
 */
export function sanitizeDiscounts(
  text: string,
  allowDiscount: boolean,
): { text: string; mentionedDiscount: boolean } {
  const trimmed = text.trim();
  if (allowDiscount) {
    return { text: trimmed, mentionedDiscount: mentionsDiscount(trimmed) };
  }

  if (!mentionsDiscount(trimmed)) {
    return { text: trimmed, mentionedDiscount: false };
  }

  // Split into sentences, keep only those with no discount language.
  const kept = trimmed
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => sentence.trim() !== "" && !mentionsDiscount(sentence))
    .join(" ")
    .trim();

  return { text: kept, mentionedDiscount: false };
}
