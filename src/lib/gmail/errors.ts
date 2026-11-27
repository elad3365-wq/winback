import { GmailApiError } from "@/lib/gmail/api";
import { GmailReconnectRequiredError } from "@/lib/gmail/connection";

/**
 * Owner-facing text for a failed Gmail operation. Raw Google / database errors
 * can carry request details and mean nothing to a business owner, so they are
 * logged server-side by the caller and mapped to a short, actionable message.
 */
export function gmailErrorMessage(error: unknown, fallback = "Something went wrong talking to Gmail. Please try again."): string {
  if (error instanceof GmailReconnectRequiredError) return error.message;
  if (error instanceof GmailApiError) {
    if (error.status === 401) return new GmailReconnectRequiredError().message;
    if (error.status === 403) {
      return "Google refused access to this mailbox. Reconnect Gmail and allow WinBack to read your email.";
    }
    if (error.status === 429) return "Gmail is rate-limiting requests right now. Please try again in a few minutes.";
    if (error.status >= 500) return "Gmail is temporarily unavailable. Please try again shortly.";
  }
  if (error instanceof Error && /SUPABASE_SERVICE_ROLE_KEY/.test(error.message)) {
    return "Email isn't fully set up on this server yet. Please contact WinBack support.";
  }
  return fallback;
}
