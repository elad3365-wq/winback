"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireBusinessContext } from "@/lib/business";
import { getGmailOAuthConfig, gmailSetupProblems } from "@/lib/gmail/config";
import { buildAuthUrl } from "@/lib/gmail/google";
import {
  GMAIL_OAUTH_COOKIE,
  GMAIL_OAUTH_COOKIE_OPTIONS,
  encodeOAuthState,
  gmailRedirectUri,
  newOAuthState,
} from "@/lib/gmail/oauth-state";
import { disconnect } from "@/lib/gmail/service";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Starts the Google consent screen for the business the member is working in.
 * Only that business id goes into the signed-in member's own cookie, and the
 * callback re-checks membership before saving anything.
 */
export async function connectGmailAction(): Promise<void> {
  const { user, business } = await requireBusinessContext();
  const config = getGmailOAuthConfig();
  if (!config || gmailSetupProblems().length > 0) {
    redirect("/settings/email?gmail=not_configured");
  }

  const redirectUri = await gmailRedirectUri();
  const { value, challenge } = newOAuthState(business.id, redirectUri);
  const cookieStore = await cookies();
  cookieStore.set(GMAIL_OAUTH_COOKIE, encodeOAuthState(value), GMAIL_OAUTH_COOKIE_OPTIONS);

  redirect(
    buildAuthUrl({
      config,
      redirectUri,
      state: value.state,
      codeChallenge: challenge,
      loginHint: business.email ?? user.email ?? null,
    }),
  );
}

export async function disconnectGmailAction(): Promise<void> {
  const { business } = await requireBusinessContext();
  const admin = createAdminClient();
  if (admin) {
    await disconnect(admin, business.id);
  }
  revalidatePath("/settings/email");
  revalidatePath("/inbox");
  redirect("/settings/email?gmail=disconnected");
}
