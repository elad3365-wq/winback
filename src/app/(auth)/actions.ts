"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { destinationAfterAuth, safeNext } from "@/lib/auth-destination";
import { AUTH_MESSAGES, friendlyAuthError } from "@/lib/auth-errors";
import { getSiteUrl } from "@/lib/env";
import {
  RATE_LIMITED_MESSAGE,
  clientIp,
  consumeRateLimit,
  logSecurityEvent,
} from "@/lib/security/rate-limit";
import { createClient } from "@/lib/supabase/server";

export type AuthFormState = {
  error?: string;
  message?: string;
  /**
   * Set when Supabase accepted the signup but withheld the session because
   * "Confirm email" is on. The form swaps itself for a check-your-inbox panel.
   */
  confirmationEmail?: string;
};

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function signUpAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const fullName = readString(formData, "fullName");
  const email = readString(formData, "email");
  const password = String(formData.get("password") ?? "");

  if (!fullName) {
    return { error: "Please enter your full name." };
  }
  if (!isValidEmail(email)) {
    return { error: "Please enter a valid email address." };
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }
  if (fullName.length > 200 || email.length > 320 || password.length > 128) {
    return { error: "That's longer than we accept. Please shorten it." };
  }

  const ip = await clientIp();
  if (!(await consumeRateLimit("sign_up", ip))) {
    await logSecurityEvent("sign_up_blocked", { email, ip });
    return { error: RATE_LIMITED_MESSAGE };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: `${await getSiteUrl()}/auth/confirm?next=/onboarding`,
    },
  });

  if (error) {
    // No email in the log: the code and status are enough to tell an email-send
    // limit (Confirm email on, built-in mailer) from a real refusal.
    console.error("[auth/signup] refused", { code: error.code ?? null, status: error.status ?? null });
    return { error: friendlyAuthError(error, AUTH_MESSAGES.signUp) };
  }
  await logSecurityEvent("sign_up", { email, ip });

  // Email confirmation is off in Supabase, so signup already returns a session
  // and the owner goes straight on to onboarding.
  if (data.session) {
    revalidatePath("/", "layout");
    redirect("/onboarding");
  }

  // Email confirmation is on: Supabase returns a user but no session.
  return { confirmationEmail: email };
}

export async function signInAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = readString(formData, "email");
  const password = String(formData.get("password") ?? "");
  const next = readString(formData, "next");

  if (!email || !password) {
    return { error: "Please enter your email and password." };
  }
  if (email.length > 320 || password.length > 128) {
    return { error: friendlyAuthError(null, AUTH_MESSAGES.signIn) };
  }

  // Two limits: guessing one account's password from one address, and one
  // address spraying many accounts.
  const ip = await clientIp();
  const allowed =
    (await consumeRateLimit("sign_in", `${ip}|${email}`)) && (await consumeRateLimit("sign_in_ip", ip));
  if (!allowed) {
    await logSecurityEvent("sign_in_blocked", { email, ip });
    return { error: RATE_LIMITED_MESSAGE };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    await logSecurityEvent("sign_in_failed", { email, ip, detail: { code: error.code ?? null } });
    return { error: friendlyAuthError(error, AUTH_MESSAGES.signIn) };
  }
  await logSecurityEvent("sign_in_ok", { email, ip });

  revalidatePath("/", "layout");
  const destination = data.user
    ? await destinationAfterAuth(supabase, data.user.id, next)
    : "/dashboard";
  redirect(destination);
}

/**
 * Starts the Google sign-in. Supabase hands back the provider URL instead of
 * navigating (we are on the server), and stores the PKCE verifier in the same
 * cookie jar that /auth/callback later reads it from.
 *
 * The form sends the browser's own `window.location.origin`, so the callback
 * handed to Supabase is the address this visitor is really on. See getSiteUrl
 * for what happens when the field is empty or names another host.
 */
export async function signInWithGoogleAction(formData: FormData) {
  const next = safeNext(readString(formData, "next") || null);
  const from = readString(formData, "from") === "/signup" ? "/signup" : "/login";
  const browserOrigin = readString(formData, "origin");

  // signInWithOAuth below is the ONLY thing that may touch the authorize
  // endpoint. An earlier version probed /auth/v1/authorize first to check the
  // provider was configured, but that bare probe opened a second, PKCE-less
  // authorize flow on Supabase for the same sign-in: the code Google returned
  // could bind to that stray flow instead of the real one, so the verifier in
  // the cookie no longer matched its challenge and the exchange failed with
  // "bad_code_verifier". A provider that is not fully set up is now caught from
  // signInWithOAuth's own error just below, so the friendly message survives
  // without a duplicate authorize corrupting the PKCE flow.
  const callbackUrl = new URL("/auth/callback", await getSiteUrl(browserOrigin));
  if (next) callbackUrl.searchParams.set("next", next);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: callbackUrl.toString() },
  });

  if (error || !data?.url) {
    // Supabase's own words, kept in the server log. The owner only ever sees
    // the sentence the redirect below resolves to.
    console.error("[auth] could not start Google sign-in", {
      redirectTo: callbackUrl.toString(),
      name: error?.name,
      code: error?.code,
      status: error?.status,
      message: error?.message,
      hadUrl: Boolean(data?.url),
    });
    // A provider that is enabled without a secret, or not enabled at all, says
    // so in the error. Show the "not available" message for those; everything
    // else is a generic could-not-start.
    const notConfigured = /provider is not enabled|oauth secret|unsupported provider/i.test(
      error?.message ?? "",
    );
    redirect(`${from}?error=${notConfigured ? "google_unavailable" : "google_start"}`);
  }

  redirect(data.url);
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}

export async function requestPasswordResetAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = readString(formData, "email");

  if (!isValidEmail(email) || email.length > 320) {
    return { error: "Please enter a valid email address." };
  }

  const ip = await clientIp();
  const allowed = (await consumeRateLimit("reset", ip)) && (await consumeRateLimit("reset_email", email));
  if (!allowed) {
    await logSecurityEvent("password_reset_blocked", { email, ip });
    return { error: RATE_LIMITED_MESSAGE };
  }
  await logSecurityEvent("password_reset_requested", { email, ip });

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await getSiteUrl()}/auth/confirm?next=/reset-password`,
  });

  if (error) {
    return { error: friendlyAuthError(error, AUTH_MESSAGES.resetRequest) };
  }

  // Always report success so the form never reveals whether an email exists.
  return {
    message: `If an account exists for ${email}, we've sent a link to set a new password.`,
  };
}

export async function updatePasswordAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const password = String(formData.get("password") ?? "");

  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }
  if (password.length > 128) {
    return { error: "Password must be 128 characters or fewer." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: AUTH_MESSAGES.expiredLink };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { error: friendlyAuthError(error, AUTH_MESSAGES.passwordUpdate) };
  }

  await logSecurityEvent("password_changed", { email: user.email ?? null, ip: await clientIp() });

  // End the short-lived recovery session so the owner returns to a clean sign
  // in and proves the new password works.
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login?status=password_updated");
}
