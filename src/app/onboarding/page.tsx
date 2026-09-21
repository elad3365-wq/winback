import { redirect } from "next/navigation";

import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { SetupNotice } from "@/components/setup-notice";
import { requireBusinessContext } from "@/lib/business";
import { isSupabaseConfigured } from "@/lib/env";
import type { OnboardingData } from "@/lib/onboarding";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Set up your business · WinBack",
};

function str(value: string | number | null | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}

export default async function OnboardingPage() {
  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto w-full max-w-xl">
        <SetupNotice />
      </div>
    );
  }

  const { user, business } = await requireBusinessContext();
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarding_completed")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.onboarding_completed) {
    redirect("/dashboard");
  }

  const { data: ai } = await supabase
    .from("business_ai_settings")
    .select("*")
    .eq("business_id", business.id)
    .maybeSingle();

  const discountSetting = ai
    ? ai.ai_can_offer_discounts
      ? String(ai.maximum_discount_percent)
      : "none"
    : "none";

  // Prefill from anything already saved so a returning owner keeps their data.
  // The placeholder name the signup trigger created is left blank so the owner
  // fills in their real business name.
  const placeholderName =
    business.name.endsWith("'s business") || business.name === "My business";

  const initial: Partial<OnboardingData> = {
    businessName: placeholderName ? "" : business.name,
    businessType: str(business.business_type),
    customBusinessType: str(business.custom_business_type),
    phone: str(business.phone),
    email: str(business.email ?? user.email),
    website: str(business.website),
    country: str(business.country),
    state: str(business.state),
    city: str(business.city),
    monthlyEstimates: str(business.monthly_estimates),
    averageEstimateValue: str(business.average_estimate_value),
    currency: business.currency || "USD",
    employeeCount: str(business.employee_count),
    currentFollowUpMethod: str(business.current_follow_up_method),
    financingAvailable: ai?.financing_available ?? false,
    paymentPlansAvailable: ai?.payment_plans_available ?? false,
    discountSetting,
    businessHours: str(ai?.business_hours),
    additionalRules: str(ai?.additional_rules),
  };

  return <OnboardingWizard initial={initial} />;
}
