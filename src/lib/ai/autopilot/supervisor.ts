/**
 * AI Supervisor (Phase 2 agent #7) — the safety gate, as pure functions.
 *
 * Validates an agent's proposed action before anything executes: enforces tenant
 * isolation, catches unsafe/forbidden output (discounts the business didn't
 * allow, sending to an unsubscribed contact, empty drafts), computes idempotency
 * keys to prevent duplicate jobs, and decides when a decision must be routed to
 * the owner. No I/O — the execution layer feeds it the facts.
 */

import { mentionsDiscount } from "@/lib/ai/followup";
import type { AgentAction, AutonomyDecision } from "@/lib/ai/autopilot/autonomy";

/** Tenant isolation: a resource must belong to the acting business. */
export function assertSameTenant(resourceBusinessId: string, contextBusinessId: string): void {
  if (resourceBusinessId !== contextBusinessId) {
    throw new Error("Tenant isolation violation: resource belongs to a different business.");
  }
}

export function isSameTenant(resourceBusinessId: string, contextBusinessId: string): boolean {
  return resourceBusinessId === contextBusinessId;
}

/**
 * Stable idempotency key for a unit of work, so the same (business, type,
 * entity, step) is never queued or executed twice.
 */
export function dedupeKey(parts: {
  businessId: string;
  type: string;
  entityId: string;
  step?: string | number | null;
}): string {
  return [parts.businessId, parts.type, parts.entityId, parts.step ?? ""].join(":");
}

export function isDuplicate(existingKeys: Iterable<string>, key: string): boolean {
  for (const k of existingKeys) if (k === key) return true;
  return false;
}

export type DraftContext = {
  discountsAllowed: boolean;
  recipientUnsubscribed: boolean;
};

export type DraftValidation = { ok: boolean; violations: string[] };

/**
 * Validate an outward draft against the business's rules. Fail-closed: any
 * violation blocks the draft from being treated as sendable.
 */
export function validateOutboundDraft(body: string, action: AgentAction, ctx: DraftContext): DraftValidation {
  const violations: string[] = [];
  const text = (body ?? "").trim();

  if (!text) violations.push("empty_body");
  if (ctx.recipientUnsubscribed) violations.push("recipient_unsubscribed");
  if (!ctx.discountsAllowed && mentionsDiscount(text)) violations.push("unauthorized_discount");
  if (action !== "send_email" && action !== "send_sms" && action !== "draft_reply" && action !== "draft_followup") {
    violations.push("not_a_message_action");
  }

  return { ok: violations.length === 0, violations };
}

export type ReviewContext = {
  autonomyDecision: AutonomyDecision;
  confidence: number; // 0..1
  highImpact: boolean;
  confidenceThreshold?: number; // default 0.7
};

/**
 * Whether a proposed action must be routed to the owner rather than executed.
 * Any of: the autonomy policy said so, the action is high-impact, or the agent's
 * confidence is below threshold (treat low confidence as a possible hallucination).
 */
export function requiresHumanReview(ctx: ReviewContext): boolean {
  const threshold = ctx.confidenceThreshold ?? 0.7;
  if (ctx.autonomyDecision !== "allow") return true;
  if (ctx.highImpact) return true;
  if (!(ctx.confidence >= threshold)) return true;
  return false;
}
