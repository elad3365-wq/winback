import { SettingsForm } from "@/components/settings/settings-form";
import { requireBusinessContext } from "@/lib/business";
import type { OnboardingData } from "@/lib/onboarding";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Settings · WinBack",
};

function str(value: string | number | null | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}

export default async function SettingsPage() {
  const { user, business } = await requireBusinessContext();
  const supabase = await createClient();

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

  const initial: Partial<OnboardingData> = {
    businessName: business.name,
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

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">
          Edit your business details, phone, AI settings, business hours and discount rules.
        </p>
      </header>

      <SettingsForm initial={initial} />
    </div>
  );
}
