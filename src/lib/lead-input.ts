import type { LeadStatus } from "@/lib/database.types";
import { isLeadStatus } from "@/lib/leads";

/**
 * Validation for the add/edit lead form. Plain module so it can be unit
 * tested; the server actions call it and never trust the browser's
 * `required` / `maxLength` attributes.
 */

export const LEAD_NAME_MAX = 120;
export const LEAD_PHONE_MAX = 30;
export const LEAD_SERVICE_MAX = 120;
/** numeric(12,2) in the database. */
export const LEAD_AMOUNT_MAX = 9_999_999_999.99;

export type ParsedLead = {
  customer_name: string;
  phone: string;
  service: string;
  estimate_amount: number;
  status: LeadStatus;
  follow_up_date: string | null;
};

type Reader = { get(key: string): FormDataEntryValue | null };

function read(form: Reader, key: string) {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function isRealDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function parseLeadInput(form: Reader): ParsedLead | { error: string } {
  const customerName = read(form, "customer_name");
  const phone = read(form, "phone");
  const service = read(form, "service");
  const amountRaw = read(form, "estimate_amount").replace(/[$,\s]/g, "");
  const statusRaw = read(form, "status") || "new";
  const followUpDate = read(form, "follow_up_date");

  if (!customerName) return { error: "Customer name is required." };
  if (customerName.length > LEAD_NAME_MAX) {
    return { error: `Customer name must be ${LEAD_NAME_MAX} characters or fewer.` };
  }
  if (!phone) return { error: "Phone number is required." };
  if (phone.length > LEAD_PHONE_MAX || !/\d/.test(phone)) {
    return { error: "Enter a valid phone number." };
  }
  if (!service) return { error: "Service is required." };
  if (service.length > LEAD_SERVICE_MAX) {
    return { error: `Service must be ${LEAD_SERVICE_MAX} characters or fewer.` };
  }
  if (!isLeadStatus(statusRaw)) return { error: "Pick a valid status." };

  const amount = amountRaw === "" ? 0 : Number(amountRaw);
  if (!Number.isFinite(amount) || amount < 0) {
    return { error: "Estimate amount must be a positive number." };
  }
  if (amount > LEAD_AMOUNT_MAX) return { error: "Estimate amount is too large." };

  if (followUpDate && !isRealDate(followUpDate)) {
    return { error: "Follow-up date must be a valid date." };
  }

  return {
    customer_name: customerName,
    phone,
    service,
    estimate_amount: Math.round(amount * 100) / 100,
    status: statusRaw,
    follow_up_date: followUpDate || null,
  };
}

/**
 * Turns a Postgres/PostgREST error into something a business owner can act
 * on. Raw messages ("new row violates row-level security policy…") are logged
 * server-side by the caller, never shown.
 */
export function friendlyLeadError(error: { code?: string | null; message?: string } | null): string {
  switch (error?.code) {
    case "42501":
      return "You don't have permission to change leads in this business.";
    case "23514":
    case "22P02":
    case "22003":
      return "Some of the lead details are not valid. Check the fields and try again.";
    case "23503":
      return "This lead no longer exists. Refresh the page.";
    default:
      return "Could not save the lead. Please try again.";
  }
}

export const LEAD_NOT_FOUND =
  "That lead was not found in this business. It may have been deleted, or you switched businesses — refresh the page.";
