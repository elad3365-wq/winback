/**
 * Which business the signed-in user is working in. Plain module (no
 * "server-only") so the choice logic can be unit tested.
 *
 * The cookie only records a preference. It is never trusted on its own: the
 * chosen id must be one of the caller's own memberships, which are read through
 * RLS, and every query is then filtered by that id and checked by RLS again.
 */

export const ACTIVE_BUSINESS_COOKIE = "winback_business";

/** One year; the choice survives closing the browser. */
export const ACTIVE_BUSINESS_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export type BusinessRole = "owner" | "member";

export type BusinessSummary = {
  id: string;
  name: string;
  role: BusinessRole;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isBusinessId(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID.test(value);
}

/**
 * Picks the business to show. `memberships` must already be ordered oldest
 * first, so a user with no saved choice keeps landing in the business they
 * signed up with.
 */
export function pickActiveBusiness(
  memberships: BusinessSummary[],
  preferredId: string | null | undefined,
): BusinessSummary | null {
  if (memberships.length === 0) return null;
  if (isBusinessId(preferredId)) {
    const match = memberships.find((membership) => membership.id === preferredId);
    if (match) return match;
  }
  return memberships[0];
}

export const ACTIVE_BUSINESS_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: ACTIVE_BUSINESS_COOKIE_MAX_AGE,
};
