"use server";

import {
  validateBetaSignup,
  type BetaFormState,
} from "@/components/marketing/beta-form-state";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

const SAVE_FAILED =
  "We couldn't save your request just now. Please try again in a minute, or email us directly.";

/**
 * Public "Join the beta" form. A success message is shown ONLY after the row
 * is confirmed written to `beta_signups`. Any missing configuration, database
 * error, or thrown exception returns an error state so a visitor is never told
 * they're signed up when nothing was saved.
 */
export async function submitBetaAction(
  _prevState: BetaFormState,
  formData: FormData,
): Promise<BetaFormState> {
  const parsed = validateBetaSignup(formData);
  if (!parsed.ok) return { status: "error", error: parsed.error };

  if (!isSupabaseConfigured()) {
    console.error("beta_signups: Supabase is not configured; signup NOT saved.");
    return { status: "error", error: SAVE_FAILED };
  }

  try {
    const supabase = await createClient();
    // No `.select()` on purpose: anon has INSERT but no SELECT policy, so
    // asking for the row back would fail RLS even though the insert succeeded.
    const { error } = await supabase.from("beta_signups").insert(parsed.value);
    if (error) {
      console.error("beta_signups insert failed:", error.code, error.message);
      return { status: "error", error: SAVE_FAILED };
    }
  } catch (err) {
    console.error("beta_signups insert threw:", err);
    return { status: "error", error: SAVE_FAILED };
  }

  return { status: "success", submittedAt: Date.now() };
}
