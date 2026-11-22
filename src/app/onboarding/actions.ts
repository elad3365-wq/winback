"use server";

import { revalidatePath } from "next/cache";

import { requireBusinessContext } from "@/lib/business";
import {
  isNonNegativeNumber,
  resolveDiscount,
  validateLengths,
  validateStep,
  type OnboardingData,
} from "@/lib/onboarding";
import { createClient } from "@/lib/supabase/server";

const OWNER_ONLY = "Only the business owner can change the business profile and AI rules.";

export type OnboardingResult = { status: "success" } | { status: "error"; error: string };

function toNumberOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return isNonNegativeNumber(trimmed) ? Number(trimmed) : null;
}

function clean(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export async function completeOnboardingAction(
  data: OnboardingData,
): Promise<OnboardingResult> {
  // Re-validate on the server — never trust the client.
  const lengthError = validateLengths(data);
  if (lengthError) return { status: "error", error: lengthError };
  const step1Error = validateStep(1, data);
  if (step1Error) return { status: "error", error: step1Error };
  const step2Error = validateStep(2, data);
  if (step2Error) return { status: "error", error: step2Error };

  const { user, business, role } = await requireBusinessContext();
  const supabase = await createClient();

  // A team member joining an existing business must not overwrite the
  // owner's profile or AI rules; they only finish their own onboarding.
  if (role !== "owner") return markOnboarded(supabase, user.id);

  const { aiCanOfferDiscounts, maximumDiscountPercent } = resolveDiscount(data.discountSetting);

  const { data: updatedBusiness, error: businessError } = await supabase
    .from("businesses")
    .update({
      name: data.businessName.trim(),
      business_type: clean(data.businessType),
      custom_business_type:
        data.businessType === "Other" ? clean(data.customBusinessType) : null,
      phone: clean(data.phone),
      email: clean(data.email),
      website: clean(data.website),
      country: clean(data.country),
      state: clean(data.state),
      city: clean(data.city),
      monthly_estimates: toNumberOrNull(data.monthlyEstimates),
      average_estimate_value: toNumberOrNull(data.averageEstimateValue),
      currency: clean(data.currency) ?? "USD",
      employee_count: toNumberOrNull(data.employeeCount),
      current_follow_up_method: clean(data.currentFollowUpMethod),
    })
    .eq("id", business.id)
    .select("id");

  if (businessError) {
    console.error("onboarding: business update failed", businessError);
    return { status: "error", error: "Could not save your business details. Please try again." };
  }
  // Only owners may edit the business (RLS); a blocked update is 0 rows, not an error.
  if (!updatedBusiness || updatedBusiness.length === 0) {
    return { status: "error", error: OWNER_ONLY };
  }

  const { error: aiError } = await supabase.from("business_ai_settings").upsert(
    {
      business_id: business.id,
      financing_available: data.financingAvailable,
      payment_plans_available: data.paymentPlansAvailable,
      ai_can_offer_discounts: aiCanOfferDiscounts,
      maximum_discount_percent: maximumDiscountPercent,
      business_hours: clean(data.businessHours),
      additional_rules: clean(data.additionalRules),
    },
    { onConflict: "business_id" },
  );

  if (aiError) {
    console.error("onboarding: AI settings save failed", aiError);
    return { status: "error", error: "Could not save your AI settings. Please try again." };
  }

  return markOnboarded(supabase, user.id);
}

async function markOnboarded(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<OnboardingResult> {
  // Upsert, so an older account whose profile row is missing does not loop
  // back to onboarding forever (profiles has insert-own + update-own policies).
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .upsert({ id: userId, onboarding_completed: true }, { onConflict: "id" })
    .select("id");

  if (profileError || !profile || profile.length === 0) {
    console.error("onboarding: profile update failed", profileError);
    return { status: "error", error: "Could not finish setup. Please try again." };
  }

  revalidatePath("/", "layout");
  return { status: "success" };
}
