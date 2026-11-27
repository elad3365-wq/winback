/**
 * Plain (non-"use server") module for the beta form's constants and types.
 * Server-action files may only export async functions, so anything that is a
 * value or a type lives here and is imported by both the client form and the
 * server action.
 */

export const BUSINESS_TYPES = [
  "HVAC",
  "Roofing",
  "Cleaning",
  "Plumbing",
  "Electrical",
  "Auto Repair",
  "Contractor / Remodeling",
  "Other local service",
] as const;

/** What the visitor typed, echoed back on an error so the form keeps it. */
export type BetaFormValues = {
  name: string;
  business_name: string;
  email: string;
  business_type: string;
};

export type BetaFormState = {
  status: "idle" | "success" | "error";
  error?: string;
  /** Changes on every successful submit so the client can react to it. */
  submittedAt?: number;
  /**
   * On an error: the submitted values, so a failed or invalid submit never
   * wipes the form (React resets a form after its action finishes).
   */
  values?: BetaFormValues;
};

export const INITIAL_BETA_FORM_STATE: BetaFormState = { status: "idle" };

export type BetaSignupRow = {
  name: string;
  business_name: string;
  email: string;
  business_type: string;
};

const MAX_LEN = 200;

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

/** Raw submitted values (trimmed, capped) to refill the form after an error. */
export function readBetaFormValues(formData: FormData): BetaFormValues {
  const cap = (v: string) => v.slice(0, MAX_LEN * 2);
  return {
    name: cap(readString(formData, "name")),
    business_name: cap(readString(formData, "business_name")),
    email: cap(readString(formData, "email")),
    business_type: cap(readString(formData, "business_type")),
  };
}

/** Pure validation for the beta form, shared by the action and its tests. */
export function validateBetaSignup(
  formData: FormData,
): { ok: true; value: BetaSignupRow } | { ok: false; error: string } {
  const name = readString(formData, "name");
  const businessName = readString(formData, "business_name");
  const email = readString(formData, "email").toLowerCase();
  const businessType = readString(formData, "business_type");

  if (!name) return { ok: false, error: "Please enter your name." };
  if (!businessName) return { ok: false, error: "Please enter your business name." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Please enter a valid email address." };
  }
  if (!businessType) return { ok: false, error: "Please choose your business type." };
  if ([name, businessName, email, businessType].some((v) => v.length > MAX_LEN)) {
    return { ok: false, error: "One of the fields is too long. Please shorten it." };
  }

  return {
    ok: true,
    value: { name, business_name: businessName, email, business_type: businessType },
  };
}
