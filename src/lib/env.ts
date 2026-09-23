import { headers } from "next/headers";

/**
 * Reads the public Supabase configuration. Only the URL and the anon key are
 * read here — both are safe in the browser and protected by Row Level Security.
 * The service role key is never referenced anywhere in this app.
 */

/** A value straight out of .env.example that was never filled in. */
function isPlaceholder(value: string) {
  return value.trim() === "" || value.includes("PASTE_") || value.includes("your-project-ref");
}

function readSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

  if (isPlaceholder(url) || isPlaceholder(anonKey)) return null;
  if (!/^https?:\/\//.test(url)) return null;

  return { url, anonKey };
}

export function isSupabaseConfigured() {
  return readSupabaseEnv() !== null;
}

export function getSupabaseEnv() {
  const env = readSupabaseEnv();

  if (!env) {
    throw new Error(
      "Supabase is not configured. Copy .env.example to .env.local and replace the placeholders with NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY from your Supabase project.",
    );
  }

  return env;
}

function stripTrailingSlash(url: string) {
  return url.trim().replace(/\/+$/, "");
}

function isLocalhost(url: string) {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(stripTrailingSlash(url));
}

/** True when two addresses name the same scheme and host. */
function sameOrigin(a: string, b: string) {
  try {
    const left = new URL(stripTrailingSlash(a));
    const right = new URL(stripTrailingSlash(b));
    return left.protocol === right.protocol && left.host === right.host;
  } catch {
    return false;
  }
}

/** The origin this request actually arrived on, or null outside a request. */
async function siteUrlFromRequest(): Promise<string | null> {
  try {
    const headerList = await headers();
    const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
    if (!host) return null;

    // Proxies chain this header, so the first entry is the original scheme.
    const forwardedProto = headerList.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const proto = forwardedProto || (isLocalhost(`http://${host}`) ? "http" : "https");
    return `${proto}://${host}`;
  } catch {
    // Called outside a request, e.g. during the build.
    return null;
  }
}

/**
 * The address of this app that a visitor's browser can actually reach. Used to
 * build the Google OAuth callback and the links Supabase emails for
 * confirmation and password resets.
 *
 * A page that has hydrated sends its own `window.location.origin` along, and
 * that wins whenever it matches the host serving the request — a preview
 * deployment then builds its callback on the preview domain rather than the
 * production one. Otherwise, on Vercel the platform tells us the real domain,
 * so we use that; failing that the configured value, and failing that the host
 * of the request being served, so a self-hosted deployment needs no
 * configuration.
 *
 * `http://localhost:3000` is the value that ships in .env.example, so it is the
 * one most likely to be copied into a hosted environment by mistake. It is
 * therefore never allowed to win over the host a public request arrived on: a
 * redirect built from it would strand every visitor on their own machine, which
 * is exactly the dead end an OAuth round trip lands in.
 */
export async function getSiteUrl(browserOrigin?: string | null) {
  const fromRequest = await siteUrlFromRequest();

  // The page can tell us the origin it is actually open on. Nothing beats that,
  // because it is by definition an address this visitor's browser reached — but
  // it arrives in a form field, so it counts only when it names the very host
  // this request came in on. Anything else is someone else's origin.
  if (browserOrigin && fromRequest !== null && sameOrigin(browserOrigin, fromRequest)) {
    return stripTrailingSlash(browserOrigin);
  }

  // Vercel, in order of preference: the project's stable production domain,
  // then this specific deployment's domain. Both are set by the platform.
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  // An explicit setting, which is the normal case for local development.
  const configured = stripTrailingSlash(process.env.NEXT_PUBLIC_SITE_URL ?? "");
  if (configured !== "") {
    const wouldStrandVisitor =
      isLocalhost(configured) && fromRequest !== null && !isLocalhost(fromRequest);
    if (!wouldStrandVisitor) return configured;
  }

  // Self-hosted with nothing usable configured: use the host we are served on.
  return fromRequest ?? "http://localhost:3000";
}
