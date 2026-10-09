/**
 * Plain (non-"use server") module for the Create Business form's state type,
 * shared by the client form and the server action.
 */

export type CreateBusinessFormState = {
  status: "idle" | "error";
  error?: string;
};

export const INITIAL_CREATE_BUSINESS_STATE: CreateBusinessFormState = { status: "idle" };
