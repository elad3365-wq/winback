/**
 * Shared option lists, types and validation for the business onboarding flow.
 * Imported by both client step components and the server completion action so
 * the two never drift apart.
 */

export const BUSINESS_TYPES = [
  "Auto Repair",
  "Plumbing",
  "HVAC",
  "Electrical",
  "Roofing",
  "Contractor",
  "Dental",
  "Other",
] as const;
export type BusinessType = (typeof BUSINESS_TYPES)[number];

export const FOLLOW_UP_METHODS = [
  "Yes, manually",
  "Yes, automatically",
  "Sometimes",
  "No",
] as const;
export type FollowUpMethod = (typeof FOLLOW_UP_METHODS)[number];

export const CURRENCIES = ["USD", "EUR", "GBP", "ILS", "CAD", "AUD", "MXN"] as const;

export const DISCOUNT_OPTIONS = [
  { value: "none", label: "AI cannot offer discounts" },
  { value: "0", label: "0%" },
  { value: "1", label: "1%" },
  { value: "2", label: "2%" },
  { value: "3", label: "3%" },
  { value: "4", label: "4%" },
  { value: "5", label: "5%" },
] as const;

/** The full payload the wizard collects across all three steps. */
export type OnboardingData = {
  // Step 1 — business information
  businessName: string;
  businessType: string;
  customBusinessType: string;
  phone: string;
  email: string;
  website: string;
  country: string;
  state: string;
  city: string;
  // Step 2 — business activity
  monthlyEstimates: string;
  averageEstimateValue: string;
  currency: string;
  employeeCount: string;
  currentFollowUpMethod: string;
  // Step 3 — AI settings
  financingAvailable: boolean;
  paymentPlansAvailable: boolean;
  /** One of DISCOUNT_OPTIONS values: "none" | "0".."5". */
  discountSetting: string;
  businessHours: string;
  additionalRules: string;
};

export const EMPTY_ONBOARDING: OnboardingData = {
  businessName: "",
  businessType: "",
  customBusinessType: "",
  phone: "",
  email: "",
  website: "",
  country: "",
  state: "",
  city: "",
  monthlyEstimates: "",
  averageEstimateValue: "",
  currency: "USD",
  employeeCount: "",
  currentFollowUpMethod: "",
  financingAvailable: false,
  paymentPlansAvailable: false,
  discountSetting: "none",
  businessHours: "",
  additionalRules: "",
};

/** Loose international phone check: leading + and 8–15 digits. Not hardcoded. */
export function isValidPhone(value: string) {
  const trimmed = value.trim();
  if (!trimmed.startsWith("+")) return false;
  const digits = trimmed.slice(1).replace(/[\s()-]/g, "");
  return /^\d{8,15}$/.test(digits);
}

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/**
 * Maximum characters per text field. Server actions receive whatever a caller
 * sends, not what the form allows, so these are checked on the server and
 * mirrored by CHECK constraints in the database (migration 0014).
 */
export const ONBOARDING_MAX_LENGTHS: Partial<Record<keyof OnboardingData, number>> = {
  businessName: 120,
  businessType: 80,
  customBusinessType: 120,
  phone: 40,
  email: 320,
  website: 300,
  country: 80,
  state: 80,
  city: 120,
  monthlyEstimates: 20,
  averageEstimateValue: 20,
  currency: 8,
  employeeCount: 20,
  currentFollowUpMethod: 80,
  discountSetting: 8,
  businessHours: 200,
  additionalRules: 2000,
};

/** Rejects non-string values and over-long text. Returns an error message or null. */
export function validateLengths(data: OnboardingData): string | null {
  if (!data || typeof data !== "object") return "Invalid form data.";
  for (const [key, max] of Object.entries(ONBOARDING_MAX_LENGTHS) as [keyof OnboardingData, number][]) {
    const value = data[key];
    if (typeof value !== "string") return "Invalid form data.";
    if (value.trim().length > max) return `That text is too long (max ${max} characters).`;
  }
  if (typeof data.financingAvailable !== "boolean" || typeof data.paymentPlansAvailable !== "boolean") {
    return "Invalid form data.";
  }
  return null;
}

/** Validates a single step; returns the first error message, or null if valid. */
export function validateStep(step: number, data: OnboardingData): string | null {
  if (step === 1) {
    if (!data.businessName.trim()) return "Business name is required.";
    if (!data.businessType) return "Please choose a business type.";
    if (data.businessType === "Other" && !data.customBusinessType.trim()) {
      return "Please describe your business type.";
    }
    if (!isValidPhone(data.phone)) {
      return "Enter a phone number in international format, e.g. +12025550123.";
    }
    if (data.email.trim() && !isValidEmail(data.email)) {
      return "Enter a valid business email address.";
    }
    if (!data.country.trim()) return "Country is required.";
    if (!data.state.trim()) return "State / region is required.";
    if (!data.city.trim()) return "City is required.";
    return null;
  }

  if (step === 2) {
    if (data.monthlyEstimates.trim() && !isNonNegativeNumber(data.monthlyEstimates)) {
      return "Monthly estimates must be a positive number.";
    }
    if (data.averageEstimateValue.trim() && !isNonNegativeNumber(data.averageEstimateValue)) {
      return "Average estimate value must be a positive number.";
    }
    if (data.employeeCount.trim() && !isNonNegativeNumber(data.employeeCount)) {
      return "Number of employees must be a positive number.";
    }
    if (!data.currentFollowUpMethod) {
      return "Please tell us whether you currently follow up.";
    }
    return null;
  }

  return null;
}

export function isNonNegativeNumber(value: string) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0;
}

/** Splits the AI discount UI value into the two columns we store. */
export function resolveDiscount(discountSetting: string): {
  aiCanOfferDiscounts: boolean;
  maximumDiscountPercent: number;
} {
  if (discountSetting === "none") {
    return { aiCanOfferDiscounts: false, maximumDiscountPercent: 0 };
  }
  const percent = Number(discountSetting);
  const clamped = Number.isFinite(percent) ? Math.min(5, Math.max(0, Math.round(percent))) : 0;
  return { aiCanOfferDiscounts: true, maximumDiscountPercent: clamped };
}
