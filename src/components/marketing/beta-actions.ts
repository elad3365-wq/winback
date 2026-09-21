"use server";

import type { BetaFormState } from "@/components/marketing/beta-form-state";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function submitBetaAction(
  _prevState: BetaFormState,
  formData: FormData,
): Promise<BetaFormState> {
  const name = readString(formData, "name");
  const businessName = readString(formData, "business_name");
  const email = readString(formData, "email");
  const businessType = readString(formData, "business_type");

  if (!name) return { status: "error", error: "Please enter your name." };
  if (!businessName) return { status: "error", error: "Please enter your business name." };
  if (!isValidEmail(email)) return { status: "error", error: "Please enter a valid email address." };
  if (!businessType) return { status: "error", error: "Please choose your business type." };

  // Storage is best-effort during the beta. If Supabase isn't wired up yet, we
  // still thank the visitor rather than showing them an error — the owner just
  // needs to apply the beta_signups migration to start capturing submissions.
  if (isSupabaseConfigured()) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.from("beta_signups").insert({
        name,
        business_name: businessName,
        email,
        business_type: businessType,
      });
      if (error) {
        console.error("beta_signups insert failed:", error.message);
      }
    } catch (err) {
      console.error("beta_signups insert threw:", err);
    }
  }

  return { status: "success", submittedAt: Date.now() };
}
