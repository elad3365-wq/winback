import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";

import {
  ACTIVE_BUSINESS_COOKIE,
  pickActiveBusiness,
  type BusinessRole,
  type BusinessSummary,
} from "@/lib/active-business";
import type { Business } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";

export type BusinessContext = {
  user: User;
  /** The business selected in the switcher. Every page scopes its data to it. */
  business: Business;
  role: BusinessRole;
  /** Every business the user belongs to, oldest first, for the switcher. */
  businesses: BusinessSummary[];
};

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/** The caller's memberships, read through RLS, oldest first. */
export async function listMyBusinesses(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<BusinessSummary[]> {
  const { data: memberships, error: membershipError } = await supabase
    .from("business_members")
    .select("business_id, role, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (membershipError) {
    throw new Error(`Could not load your businesses: ${membershipError.message}`);
  }
  if (!memberships || memberships.length === 0) return [];

  const { data: rows, error: businessError } = await supabase
    .from("businesses")
    .select("id, name")
    .in(
      "id",
      memberships.map((membership) => membership.business_id),
    );

  if (businessError) {
    throw new Error(`Could not load your businesses: ${businessError.message}`);
  }

  const names = new Map((rows ?? []).map((row) => [row.id, row.name]));
  return memberships
    .filter((membership) => names.has(membership.business_id))
    .map((membership) => ({
      id: membership.business_id,
      name: names.get(membership.business_id) ?? "",
      role: membership.role === "owner" ? "owner" : "member",
    }));
}

/**
 * Gives an account that has no business yet its first one. The signup trigger
 * normally does this; this covers accounts created before the trigger existed.
 * Prefers create_business() (migration 0011), which creates the business and
 * the membership in one step, and falls back to two inserts without it.
 */
async function createFirstBusiness(supabase: SupabaseServerClient, user: User) {
  const name = `${user.email?.split("@")[0] ?? "My"}'s business`;

  const { error: rpcError } = await supabase.rpc("create_business", { p_name: name });
  if (!rpcError) return;

  const { data: created, error: businessError } = await supabase
    .from("businesses")
    .insert({ name, owner_id: user.id })
    .select("id")
    .single();

  if (businessError || !created) {
    throw new Error(
      `Could not create a business for your account: ${businessError?.message ?? "unknown error"}`,
    );
  }

  const { error: memberError } = await supabase
    .from("business_members")
    .insert({ business_id: created.id, user_id: user.id, role: "owner" });

  if (memberError) {
    throw new Error(`Could not add you to your business: ${memberError.message}`);
  }
}

/**
 * Resolves the signed-in user and the business they are working in.
 * Redirects to /login when there is no session.
 *
 * The working business is the one saved by the business switcher, but only if
 * the user is still a member of it; otherwise the oldest business they belong
 * to. All data access below this point filters by `business.id`, and RLS
 * refuses any row from a business the user is not a member of.
 */
export async function requireBusinessContext(): Promise<BusinessContext> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  let businesses = await listMyBusinesses(supabase, user.id);
  if (businesses.length === 0) {
    await createFirstBusiness(supabase, user);
    businesses = await listMyBusinesses(supabase, user.id);
  }

  const cookieStore = await cookies();
  const active = pickActiveBusiness(businesses, cookieStore.get(ACTIVE_BUSINESS_COOKIE)?.value);

  if (!active) {
    throw new Error("Could not load your business.");
  }

  const { data: business, error: businessLoadError } = await supabase
    .from("businesses")
    .select("*")
    .eq("id", active.id)
    .single();

  if (businessLoadError || !business) {
    throw new Error(`Could not load your business: ${businessLoadError?.message ?? "not found"}`);
  }

  return { user, business, role: active.role, businesses };
}

/**
 * Like `requireBusinessContext`, but also sends owners who haven't finished
 * onboarding to /onboarding. Used by the app shell so every dashboard page is
 * gated behind a completed profile.
 */
export async function requireOnboardedContext(): Promise<BusinessContext> {
  const context = await requireBusinessContext();
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarding_completed")
    .eq("id", context.user.id)
    .maybeSingle();

  if (!profile?.onboarding_completed) {
    redirect("/onboarding");
  }

  return context;
}
