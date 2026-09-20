import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";

import type { Business } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";

export type BusinessContext = {
  user: User;
  business: Business;
};

/**
 * Resolves the signed-in user and the single business they belong to.
 * Redirects to /login when there is no session.
 *
 * A business is normally created by the `on_auth_user_created` trigger. The
 * fallback below covers accounts that existed before the trigger was installed.
 */
export async function requireBusinessContext(): Promise<BusinessContext> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: membership, error: membershipError } = await supabase
    .from("business_members")
    .select("business_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    throw new Error(`Could not load your business: ${membershipError.message}`);
  }

  if (membership) {
    const { data: business, error: businessLoadError } = await supabase
      .from("businesses")
      .select("*")
      .eq("id", membership.business_id)
      .single();

    if (businessLoadError) {
      throw new Error(`Could not load your business: ${businessLoadError.message}`);
    }

    return { user, business };
  }

  const fallbackName = `${user.email?.split("@")[0] ?? "My"}'s business`;

  const { data: createdBusiness, error: businessError } = await supabase
    .from("businesses")
    .insert({ name: fallbackName, owner_id: user.id })
    .select()
    .single();

  if (businessError || !createdBusiness) {
    throw new Error(
      `Could not create a business for your account: ${businessError?.message ?? "unknown error"}`,
    );
  }

  const { error: memberError } = await supabase
    .from("business_members")
    .insert({ business_id: createdBusiness.id, user_id: user.id, role: "owner" });

  if (memberError) {
    throw new Error(`Could not add you to your business: ${memberError.message}`);
  }

  return { user, business: createdBusiness };
}
