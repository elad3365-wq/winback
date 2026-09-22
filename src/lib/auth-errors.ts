import type { AuthError } from "@supabase/supabase-js";

/**
 * Everything the user is ever shown when authentication fails.
 *
 * Supabase's own errors ("AuthApiError: Invalid login credentials", "For
 * security purposes, you can only request this after 46 seconds") are written
 * for developers, so they are never rendered. Each entry point picks a plain
 * fallback sentence here and `friendlyAuthError` upgrades it to something more
 * specific only when the error code tells us it is safe and useful to do so.
 */
export const AUTH_MESSAGES = {
  signIn: "Email or password is incorrect.",
  signUp: "We couldn't create your account. Please try again.",
  google: "Google sign-in failed. Please try again.",
  resetRequest: "We couldn't send the reset link. Please try again.",
  passwordUpdate: "We couldn't update your password. Please try again.",
  expiredLink: "That link has expired. Please request a new one.",
} as const;

const NEEDS_CONFIRMATION =
  "Please confirm your email first. Open the link we sent you, then sign in.";
const RATE_LIMITED = "Too many attempts. Please wait a minute and try again.";
const OFFLINE = "We couldn't reach the server. Check your connection and try again.";

/** Turns a Supabase auth error into a sentence a business owner can act on. */
export function friendlyAuthError(error: AuthError | null, fallback: string): string {
  if (!error) return fallback;

  switch (error.code) {
    case "email_not_confirmed":
      return NEEDS_CONFIRMATION;

    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
    case "over_sms_send_rate_limit":
      return RATE_LIMITED;

    case "weak_password":
      return "Please choose a stronger password of at least 8 characters.";

    case "user_already_exists":
    case "email_exists":
      return "That email already has an account. Sign in instead.";

    case "same_password":
      return "That is already your password. Please choose a different one.";

    case "otp_expired":
    case "flow_state_expired":
    case "flow_state_not_found":
      return AUTH_MESSAGES.expiredLink;

    case "user_banned":
      return "This account is locked. Please contact support.";

    default:
      break;
  }

  // Network failures surface as a status-less AuthRetryableFetchError.
  if (error.status === undefined || error.status === 0) return OFFLINE;
  if (error.status === 429) return RATE_LIMITED;

  return fallback;
}
