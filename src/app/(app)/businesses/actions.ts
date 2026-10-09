"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  ACTIVE_BUSINESS_COOKIE,
  ACTIVE_BUSINESS_COOKIE_OPTIONS,
  isBusinessId,
} from "@/lib/active-business";
import { listMyBusinesses } from "@/lib/business";
import { BUSINESS_TYPES, isValidEmail, isValidPhone } from "@/lib/onboarding";
import { createClient } from "@/lib/supabase/server";

import type { CreateBusinessFormState } from "./form-state";

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Makes another business the one the app shows. The id comes from a form, so
 * it is honoured only when it is one of the caller's own memberships (read
 * through RLS); anything else is ignored and the current choice stays.
 */
export async function switchBusinessAction(formData: FormData): Promise<void> {
  const businessId = text(formData, "businessId");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  if (isBusinessId(businessId)) {
    const businesses = await listMyBusinesses(supabase, user.id);
    if (businesses.some((business) => business.id === businessId)) {
      const cookieStore = await cookies();
      cookieStore.set(ACTIVE_BUSINESS_COOKIE, businessId, ACTIVE_BUSINESS_COOKIE_OPTIONS);
    }
  }

  revalidatePath("/", "layout");
  // A lead page from the previous business would only 404, so start fresh.
  redirect("/dashboard");
}

/**
 * Creates a new business owned by the caller and switches to it. Existing
 * businesses are not read or changed: create_business() (migration 0011)
 * inserts the business, the owner membership and default AI settings for the
 * new business only.
 */
export async function createBusinessAction(
  _previous: CreateBusinessFormState,
  formData: FormData,
): Promise<CreateBusinessFormState> {
  const name = text(formData, "name");
  const businessType = text(formData, "businessType");
  const customBusinessType = text(formData, "customBusinessType");
  const phone = text(formData, "phone");
  const email = text(formData, "email");
  const city = text(formData, "city");
  const state = text(formData, "state");
  const country = text(formData, "country");

  if (!name) return { status: "error", error: "Business name is required." };
  if (name.length > 120) {
    return { status: "error", error: "Business name must be 120 characters or fewer." };
  }
  if (businessType && !(BUSINESS_TYPES as readonly string[]).includes(businessType)) {
    return { status: "error", error: "Please choose a business type from the list." };
  }
  if (businessType === "Other" && !customBusinessType) {
    return { status: "error", error: "Please describe your business type." };
  }
  if (phone && !isValidPhone(phone)) {
    return {
      status: "error",
      error: "Enter a phone number in international format, e.g. +13055550142.",
    };
  }
  if (email && !isValidEmail(email)) {
    return { status: "error", error: "Enter a valid business email address." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: businessId, error } = await supabase.rpc("create_business", {
    p_name: name,
    p_business_type: businessType || null,
    p_custom_business_type: businessType === "Other" ? customBusinessType : null,
    p_phone: phone || null,
    p_email: email || null,
    p_country: country || null,
    p_state: state || null,
    p_city: city || null,
  });

  if (error || !businessId) {
    // PGRST202: the function is not in the database yet.
    if (error?.code === "PGRST202") {
      return {
        status: "error",
        error:
          "Creating businesses is not switched on yet. Run migration 0011_multi_business.sql in Supabase, then try again.",
      };
    }
    // create_business() raises plain-English messages for the cases a person
    // can fix (missing name, too many businesses).
    const friendly =
      error && ["22023", "54000"].includes(error.code ?? "") ? error.message : null;
    return {
      status: "error",
      error: friendly ?? "Could not create the business. Please try again.",
    };
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_BUSINESS_COOKIE, businessId, ACTIVE_BUSINESS_COOKIE_OPTIONS);

  revalidatePath("/", "layout");
  redirect("/settings?created=1");
}
