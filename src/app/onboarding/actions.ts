"use server";

import { revalidatePath } from "next/cache";

import { requireBusinessContext } from "@/lib/business";
import {
  isNonNegativeNumber,
  resolveDiscount,
  validateStep,
  type OnboardingData,
} from "@/lib/onboarding";
import { createClient } from "@/lib/supabase/server";

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
  const step1Error = validateStep(1, data);
  if (step1Error) return { status: "error", error: step1Error };
  const step2Error = validateStep(2, data);
  if (step2Error) return { status: "error", error: step2Error };

  const { user, business } = await requireBusinessContext();
  const supabase = await createClient();

  const { aiCanOfferDiscounts, maximumDiscountPercent } = resolveDiscount(data.discountSetting);

  const { error: businessError } = await supabase
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
    .eq("id", business.id);

  if (businessError) {
    return { status: "error", error: businessError.message };
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
    return { status: "error", error: aiError.message };
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ onboarding_completed: true })
    .eq("id", user.id);

  if (profileError) {
    return { status: "error", error: profileError.message };
  }

  revalidatePath("/", "layout");
  return { status: "success" };
}
