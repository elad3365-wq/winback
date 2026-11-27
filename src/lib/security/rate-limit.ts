import "server-only";

import { createHmac } from "node:crypto";

import { headers } from "next/headers";

import type { Json } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";

/**
 * Application-level rate limiting and security event logging (migration 0014).
 *
 * Sign-in, sign-up and password-reset requests reach Supabase from Vercel's
 * servers, so Supabase's own per-IP limits may see one shared address for every
 * visitor. These limits run before the Supabase call and are keyed on the
 * visitor's real IP (and, where it matters, the email address).
 *
 * Buckets are HMACs, never raw emails or IPs: the database stores nothing that
 * identifies a person, and nobody without RATE_LIMIT_SECRET can compute another
 * person's bucket to lock them out. Without the secret (e.g. an unconfigured
 * preview) a fixed key is used, which still limits but is weaker.
 */

export type RateLimitAction = "sign_in" | "sign_in_ip" | "sign_up" | "reset" | "reset_email";

export const RATE_LIMITS: Record<RateLimitAction, { limit: number; windowSeconds: number }> = {
  sign_in: { limit: 10, windowSeconds: 15 * 60 }, // per IP + email
  sign_in_ip: { limit: 30, windowSeconds: 15 * 60 }, // per IP
  sign_up: { limit: 5, windowSeconds: 60 * 60 }, // per IP
  reset: { limit: 5, windowSeconds: 60 * 60 }, // per IP
  reset_email: { limit: 3, windowSeconds: 60 * 60 }, // per email
};

const FALLBACK_KEY = "winback-rate-limit-unconfigured";

function secret(): string {
  return process.env.RATE_LIMIT_SECRET?.trim() || FALLBACK_KEY;
}

/** Hex HMAC-SHA256 of a value, namespaced by purpose. */
export function hashFor(purpose: string, value: string): string {
  return createHmac("sha256", secret()).update(`${purpose}\u0000${value.trim().toLowerCase()}`).digest("hex");
}

/** The visitor's IP as Vercel reports it. Vercel overwrites these headers, so a client cannot spoof them there. */
export async function clientIp(): Promise<string> {
  try {
    const h = await headers();
    return (
      h.get("x-real-ip")?.trim() ||
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown"
    );
  } catch {
    return "unknown";
  }
}

/**
 * Consume one attempt. Returns false when the limit is reached. Fails OPEN
 * (returns true) when the database function is missing or errors, so a missing
 * migration never locks every user out; Supabase's own limits still apply.
 */
export async function consumeRateLimit(action: RateLimitAction, key: string): Promise<boolean> {
  const { limit, windowSeconds } = RATE_LIMITS[action];
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("consume_rate_limit", {
      p_bucket: `${action}:${hashFor(action, key)}`,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    if (error) {
      console.error("[rate-limit] check failed (allowing)", error.message);
      return true;
    }
    return data !== false;
  } catch (error) {
    console.error("[rate-limit] check failed (allowing)", error instanceof Error ? error.message : error);
    return true;
  }
}

export type SecurityEvent =
  | "sign_in_ok"
  | "sign_in_failed"
  | "sign_in_blocked"
  | "sign_up"
  | "sign_up_blocked"
  | "password_reset_requested"
  | "password_reset_blocked"
  | "password_changed"
  | "ai_budget_blocked"
  | "gmail_connected"
  | "gmail_disconnected";

/** Best-effort audit record. Never throws, never stores a raw email or IP. */
export async function logSecurityEvent(
  event: SecurityEvent,
  opts: { email?: string | null; ip?: string | null; detail?: Json } = {},
): Promise<void> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("log_security_event", {
      p_event: event,
      p_subject: opts.email ? hashFor("email", opts.email) : null,
      p_ip_hash: opts.ip ? hashFor("ip", opts.ip) : null,
      p_detail: opts.detail ?? null,
    });
    if (error) console.error("[security-event] not recorded", error.message);
  } catch (error) {
    console.error("[security-event] not recorded", error instanceof Error ? error.message : error);
  }
}

export const RATE_LIMITED_MESSAGE = "Too many attempts. Please wait a few minutes and try again.";
