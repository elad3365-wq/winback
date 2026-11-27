/**
 * Post-generation review of an AI follow-up draft.
 *
 * The prompt already tells the model to use only verified business facts, but a
 * model can still slip. This pure module checks the *output* against the facts
 * the business actually gave us and returns:
 *
 *   - `text`  — the draft with any hard-rule violation removed (a discount above
 *               the business's ceiling is dropped sentence-by-sentence, the same
 *               way `sanitizeDiscounts` drops disallowed discounts), and
 *   - `flags` — softer problems the owner must check before sending: a price that
 *               is not the estimate or in the knowledge base, a guarantee or
 *               warranty the business never stated, a specific time/slot offer,
 *               or financing/payment plans that are not offered.
 *
 * Flags never block a draft — the owner reviews every message anyway — but they
 * are shown next to the text so an invented claim is hard to miss.
 * No network, no SDK: everything here is unit-tested.
 */

export type ReviewFlagKind =
  | "unverified_price"
  | "discount_over_limit"
  | "unverified_guarantee"
  | "availability_claim"
  | "financing_not_offered"
  | "payment_plan_not_offered";

export type ReviewFlag = {
  kind: ReviewFlagKind;
  /** Short owner-facing explanation. */
  message: string;
  /** The exact text that triggered the flag (for highlighting / audit). */
  match: string;
};

export type ReviewContext = {
  estimateAmount: number;
  discountsAllowed: boolean;
  maximumDiscountPercent: number;
  financingAvailable: boolean;
  paymentPlansAvailable: boolean;
  /** Verified facts the owner entered (knowledge base, business hours, rules). */
  verifiedText: string;
};

export type ReviewResult = { text: string; flags: ReviewFlag[] };

const MONEY_PATTERN = /(?:[$€£₪]\s?\d[\d,]*(?:\.\d{1,2})?|\b\d[\d,]*(?:\.\d{1,2})?\s?(?:dollars|usd|eur|euros|ils|shekels|nis)\b)/gi;
const PERCENT_PATTERN = /\b(\d{1,3}(?:\.\d+)?)\s?(?:%|percent\b)/gi;
const GUARANTEE_PATTERN = /\b(guarantee[sd]?|guaranteeing|warrant(?:y|ies)|money[- ]back|lifetime|risk[- ]free|no[- ]risk)\b/gi;
const AVAILABILITY_PATTERN =
  /\b(?:(?:we|i)\s+(?:have|'ve got|got)\s+(?:an?\s+)?(?:opening|slot|spot|availability|time)s?|(?:an?\s+)?(?:opening|slot|spot)s?\s+(?:on|at|this|next|tomorrow|today)|available\s+(?:on|this|next|tomorrow|today)|(?:can|could)\s+(?:come|be there|start|fit you in)\s+(?:on|this|next|tomorrow|today)|(?:this|next)\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|(?:on|by)\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|\b\d{1,2}(?::\d{2})?\s?(?:am|pm)\b)/gi;
const FINANCING_PATTERN = /\bfinanc(?:e|ing)\b/gi;
const PAYMENT_PLAN_PATTERN = /\b(?:payment plans?|installments?|monthly payments?|pay over time)\b/gi;

function normalizeNumber(raw: string): number | null {
  const digits = raw.replace(/[^\d.]/g, "");
  if (!digits) return null;
  const value = Number(digits);
  return Number.isFinite(value) ? value : null;
}

/** Every number that appears in the verified facts (prices, hours, etc.). */
function verifiedNumbers(ctx: ReviewContext): Set<number> {
  const numbers = new Set<number>();
  if (Number.isFinite(ctx.estimateAmount)) numbers.add(Math.round(ctx.estimateAmount * 100) / 100);
  for (const match of ctx.verifiedText.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
    const value = normalizeNumber(match[0]);
    if (value !== null) numbers.add(value);
  }
  return numbers;
}

function uniqueMatches(text: string, pattern: RegExp): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const match of text.matchAll(pattern)) {
    const key = match[0].toLowerCase().trim();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(match[0].trim());
    }
  }
  return out;
}

function splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).filter((s) => s.trim() !== "");
}

/** Percentages in a sentence that exceed the business's discount ceiling. */
function percentsOverLimit(sentence: string, max: number): string[] {
  const over: string[] = [];
  for (const match of sentence.matchAll(PERCENT_PATTERN)) {
    const value = Number(match[1]);
    if (Number.isFinite(value) && value > max) over.push(match[0].trim());
  }
  return over;
}

export function reviewDraft(rawText: string, ctx: ReviewContext): ReviewResult {
  const flags: ReviewFlag[] = [];
  const verified = ctx.verifiedText.toLowerCase();

  // 1. Hard rule: never exceed the discount ceiling. Drop offending sentences.
  let text = rawText.trim();
  if (ctx.discountsAllowed) {
    const kept: string[] = [];
    for (const sentence of splitSentences(text)) {
      const over = percentsOverLimit(sentence, ctx.maximumDiscountPercent);
      if (over.length > 0) {
        flags.push({
          kind: "discount_over_limit",
          message: `Removed a sentence offering ${over[0]} — your limit is ${ctx.maximumDiscountPercent}%.`,
          match: sentence.trim(),
        });
      } else {
        kept.push(sentence);
      }
    }
    text = kept.join(" ").trim();
  }

  // 2. Prices that are neither the estimate nor in the verified facts.
  const known = verifiedNumbers(ctx);
  for (const amount of uniqueMatches(text, MONEY_PATTERN)) {
    const value = normalizeNumber(amount);
    if (value === null || !known.has(value)) {
      flags.push({
        kind: "unverified_price",
        message: `"${amount}" isn't the estimate or a price in your knowledge base — check it before sending.`,
        match: amount,
      });
    }
  }

  // 3. Guarantees / warranties the business never stated.
  for (const word of uniqueMatches(text, GUARANTEE_PATTERN)) {
    if (!verified.includes(word.toLowerCase())) {
      flags.push({
        kind: "unverified_guarantee",
        message: `Mentions "${word}", which isn't in your business details — make sure you offer it.`,
        match: word,
      });
    }
  }

  // 4. Specific appointment / availability promises (WinBack can't see a calendar).
  const availability = uniqueMatches(text, AVAILABILITY_PATTERN).filter(
    (phrase) => !verified.includes(phrase.toLowerCase()),
  );
  if (availability.length > 0) {
    flags.push({
      kind: "availability_claim",
      message: `Offers a specific time ("${availability[0]}") — WinBack can't see your calendar, so confirm you're free.`,
      match: availability[0],
    });
  }

  // 5. Financing / payment plans the business does not offer.
  if (!ctx.financingAvailable) {
    const hit = uniqueMatches(text, FINANCING_PATTERN)[0];
    if (hit) {
      flags.push({
        kind: "financing_not_offered",
        message: "Mentions financing, but your settings say it isn't offered.",
        match: hit,
      });
    }
  }
  if (!ctx.paymentPlansAvailable) {
    const hit = uniqueMatches(text, PAYMENT_PLAN_PATTERN)[0];
    if (hit) {
      flags.push({
        kind: "payment_plan_not_offered",
        message: "Mentions payment plans, but your settings say they aren't offered.",
        match: hit,
      });
    }
  }

  return { text, flags };
}

/** Narrow unknown JSON (e.g. from prompt_inputs) back to review flags. */
export function parseReviewFlags(value: unknown): ReviewFlag[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is ReviewFlag =>
      typeof item === "object" &&
      item !== null &&
      typeof (item as ReviewFlag).kind === "string" &&
      typeof (item as ReviewFlag).message === "string",
  );
}
