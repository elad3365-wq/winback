import { getSupabaseEnv } from "@/lib/env";

/**
 * Asks Supabase which third-party providers are switched on.
 *
 * Without this check, pressing "Continue with Google" before the provider is
 * enabled in the dashboard sends the owner to Supabase's bare JSON error page
 * ({"code":400,...,"msg":"Unsupported provider: provider is not enabled"}),
 * which is exactly the kind of technical message the auth screens must never
 * show.
 *
 * The check deliberately fails open: it only reports a provider as disabled
 * when Supabase positively says so. Anything else — an unreachable endpoint, an
 * unexpected body, a slow response — lets the normal sign-in proceed, so a
 * hiccup here can never block a provider that actually works.
 */
export async function isProviderEnabled(provider: string): Promise<boolean> {
  const { url, anonKey } = getSupabaseEnv();

  try {
    const response = await fetch(`${url.replace(/\/+$/, "")}/auth/v1/settings`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });

    if (!response.ok) return true;

    const settings: unknown = await response.json();
    const external =
      typeof settings === "object" && settings !== null
        ? (settings as { external?: unknown }).external
        : undefined;

    if (typeof external !== "object" || external === null) return true;

    return (external as Record<string, unknown>)[provider] !== false;
  } catch {
    return true;
  }
}
