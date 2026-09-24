import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";

/**
 * Service-role Supabase client for background jobs (the autopilot scheduler)
 * that must read/write across every business without a user session, so RLS
 * cannot scope them. This bypasses RLS — it is server-only (`import
 * "server-only"` fails the build if imported client-side) and must only ever be
 * used by trusted, authenticated server routes (e.g. the cron endpoint behind
 * CRON_SECRET). Never expose the service role key to the browser.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) return null;

  return createClient<Database>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** True when the autopilot has both the DB service key and the AI key it needs. */
export function isAutopilotConfigured(): boolean {
  return Boolean(
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() && process.env.ANTHROPIC_API_KEY?.trim(),
  );
}
