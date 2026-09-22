import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";

/**
 * Where a freshly authenticated user belongs. Shared by the password sign in
 * action and both auth routes so the Google, email and magic-link paths always
 * agree: onboarding first, the dashboard once it is done.
 */

/** Pages that only make sense to a signed-out visitor. */
const AUTH_ONLY_PATHS = ["/login", "/signup", "/forgot-password", "/reset-password", "/auth"];

/** Accepts only internal, non protocol-relative redirect targets. */
export function safeNext(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return null;
  const isAuthOnly = AUTH_ONLY_PATHS.some(
    (path) => next === path || next.startsWith(`${path}/`) || next.startsWith(`${path}?`),
  );
  return isAuthOnly ? null : next;
}

export async function destinationAfterAuth(
  supabase: SupabaseClient<Database>,
  userId: string,
  next?: string | null,
): Promise<string> {
  // A missing profile row, or a database that has not run migration 0005 yet,
  // both land here as `null` — onboarding is the safe answer either way.
  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarding_completed")
    .eq("id", userId)
    .maybeSingle();

  if (!profile?.onboarding_completed) return "/onboarding";

  return safeNext(next) ?? "/dashboard";
}
