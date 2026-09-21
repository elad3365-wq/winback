/**
 * Plain (non-"use server") module for the beta form's constants and types.
 * Server-action files may only export async functions, so anything that is a
 * value or a type lives here and is imported by both the client form and the
 * server action.
 */

export const BUSINESS_TYPES = [
  "Auto Repair",
  "Plumbing",
  "HVAC",
  "Electrical",
  "Contractor / Remodeling",
  "Other local service",
] as const;

export type BetaFormState = {
  status: "idle" | "success" | "error";
  error?: string;
  /** Changes on every successful submit so the client can react to it. */
  submittedAt?: number;
};

export const INITIAL_BETA_FORM_STATE: BetaFormState = { status: "idle" };
