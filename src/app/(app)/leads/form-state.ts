/**
 * Plain (non-"use server") module for the lead form's constants and types.
 * Server-action files may only export async functions, so anything that is a
 * value or a type lives here and is imported by both the client form and the
 * server actions.
 */

export type LeadFormState = {
  status: "idle" | "success" | "error";
  error?: string;
  /** Changes on every successful submit so the client can react to it. */
  submittedAt?: number;
};

export const INITIAL_LEAD_FORM_STATE: LeadFormState = { status: "idle" };
