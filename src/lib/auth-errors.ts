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
  googleUnavailable: "Google sign-in isn't switched on yet. Use your email and password for now.",
  resetRequest: "We couldn't send the reset link. Please try again.",
  passwordUpdate: "We couldn't update your password. Please try again.",
  expiredLink: "That link has expired. Please request a new one.",
} as const;

const NEEDS_CONFIRMATION =
  "Please confirm your email first. Open the link we sent you, then sign in.";
const RATE_LIMITED = "Too many attempts. Please wait a minute and try again.";
const OFFLINE = "We couldn't reach the server. Check your connection and try again.";

/**
 * Plain-language versions of the reasons a redirect can land back on a form.
 *
 * The Google entries are deliberately all different. /auth/callback logs the
 * real Supabase error on the server and picks the code that matches the step
 * that broke, so the sentence on screen — or a screenshot of it — is enough to
 * tell which step that was without anyone reading a log.
 */
const REDIRECT_ERRORS: Record<string, string> = {
  google: AUTH_MESSAGES.google,
  google_unavailable: AUTH_MESSAGES.googleUnavailable,
  // Supabase would not even hand us a Google URL to send the owner to.
  google_start: AUTH_MESSAGES.google,
  // Supabase refused before issuing a code.
  google_cancelled: "Google sign-in was cancelled. Please try again.",
  // The provider succeeded but Supabase could not save the account.
  google_account:
    "We couldn't finish setting up your account. Please try again, and tell us if it keeps happening.",
  // Came back with neither a code nor an error, so the attempt went stale.
  google_expired: "That sign-in attempt expired. Please press Continue with Google again.",
  // The code arrived without the browser cookie that proves it belongs here.
  google_session:
    "Your browser didn't keep the sign-in open. Please try again in the same tab, without private mode.",
  // Supabase rejected the code itself.
  google_exchange: "Google signed you in, but we couldn't complete it. Please try again.",
  link: AUTH_MESSAGES.expiredLink,
  confirmation_failed: AUTH_MESSAGES.expiredLink,
};

export function authErrorFromParam(param: string | undefined): string | undefined {
  return param ? REDIRECT_ERRORS[param] : undefined;
}

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
