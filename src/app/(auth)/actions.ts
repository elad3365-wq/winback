"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSiteUrl } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export type AuthFormState = {
  error?: string;
  message?: string;
};

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** Where a signed-in user belongs based on whether onboarding is finished. */
async function destinationForUser(userId: string, fallbackNext: string) {
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarding_completed")
    .eq("id", userId)
    .maybeSingle();

  if (!profile?.onboarding_completed) return "/onboarding";
  // Only allow internal, non protocol-relative redirect targets.
  const safeNext = fallbackNext.startsWith("/") && !fallbackNext.startsWith("//");
  return safeNext ? fallbackNext : "/dashboard";
}

export async function signUpAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const fullName = readString(formData, "fullName");
  const email = readString(formData, "email");
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!fullName) {
    return { error: "Please enter your full name." };
  }
  if (!isValidEmail(email)) {
    return { error: "Please enter a valid email address." };
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }
  if (password !== confirmPassword) {
    return { error: "Passwords do not match." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: `${getSiteUrl()}/auth/confirm?next=/onboarding`,
    },
  });

  if (error) {
    return { error: error.message };
  }

  // When email confirmation is on, Supabase returns a user without a session.
  if (!data.session) {
    return {
      message: `Account created. Check ${email} for a confirmation link, then sign in to continue.`,
    };
  }

  revalidatePath("/", "layout");
  redirect("/onboarding");
}

export async function signInAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = readString(formData, "email");
  const password = String(formData.get("password") ?? "");
  const next = readString(formData, "next");

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  const destination = data.user
    ? await destinationForUser(data.user.id, next)
    : "/dashboard";
  redirect(destination);
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}

export async function requestPasswordResetAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = readString(formData, "email");

  if (!isValidEmail(email)) {
    return { error: "Please enter a valid email address." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${getSiteUrl()}/auth/confirm?next=/reset-password`,
  });

  if (error) {
    return { error: error.message };
  }

  // Always report success so the form never reveals whether an email exists.
  return {
    message: `If an account exists for ${email}, we've sent a link to reset your password.`,
  };
}

export async function updatePasswordAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }
  if (password !== confirmPassword) {
    return { error: "Passwords do not match." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Your reset link has expired. Request a new one." };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  redirect(await destinationForUser(user.id, "/dashboard"));
}
