import { getSupabaseEnv } from "@/lib/env";

/**
 * Asks Supabase whether a third-party provider can actually be used.
 *
 * Without this check, pressing "Continue with Google" before the provider is
 * fully configured sends the owner to Supabase's bare JSON error page, which is
 * exactly the kind of technical message the auth screens must never show:
 *
 *   {"code":400,"error_code":"validation_failed",
 *    "msg":"Unsupported provider: provider is not enabled"}
 *   {"code":400,"error_code":"validation_failed",
 *    "msg":"Unsupported provider: missing OAuth secret"}
 *
 * Both come from the authorize endpoint, so that is what we ask. An earlier
 * version read /auth/v1/settings instead, but that only reports the dashboard's
 * enable flag: a provider switched on with a client id and no secret looks
 * enabled there and still fails, which let the second message above through.
 *
 * The probe URL is deliberately bare — no redirect_to, no PKCE challenge — so
 * it shares no state with the real sign-in and cannot disturb it. Provider
 * validation happens before anything else, so a bare request still gets the
 * same verdict.
 *
 * The check fails open: only a 400 whose message names the provider counts as
 * unavailable. Anything else — a redirect, another status, an unparsable body,
 * an unreachable endpoint, a timeout — lets sign-in proceed exactly as it would
 * without this function, so a hiccup here can never block a provider that works.
 */
export async function isProviderAvailable(provider: string): Promise<boolean> {
  const { url, anonKey } = getSupabaseEnv();

  const probe = new URL(`${url.replace(/\/+$/, "")}/auth/v1/authorize`);
  probe.searchParams.set("provider", provider);

  try {
    const response = await fetch(probe, {
      headers: { apikey: anonKey },
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });

    if (response.status !== 400) return true;

    const body: unknown = await response.json();
    const message =
      typeof body === "object" && body !== null ? (body as { msg?: unknown }).msg : undefined;

    if (typeof message !== "string") return true;

    return !message.trim().toLowerCase().startsWith("unsupported provider");
  } catch {
    return true;
  }
}
