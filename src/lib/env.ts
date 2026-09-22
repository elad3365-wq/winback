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

/**
 * The public address of this app, used to build the links Supabase emails for
 * confirmation and password resets.
 *
 * On Vercel the platform tells us the real domain, so we use that and ignore
 * NEXT_PUBLIC_SITE_URL entirely — a leftover `http://localhost:3000` from local
 * development would otherwise send every emailed link to the recipient's own
 * machine. Elsewhere we take the configured value, and failing that the host of
 * the request being served, so a self-hosted deployment needs no configuration.
 */
export async function getSiteUrl() {
  // Vercel, in order of preference: the project's stable production domain,
  // then this specific deployment's domain. Both are set by the platform.
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  // An explicit setting, which is the normal case for local development.
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured && stripTrailingSlash(configured) !== "") {
    return stripTrailingSlash(configured);
  }

  // Self-hosted with nothing configured: use the host we are being served on.
  try {
    const headerList = await headers();
    const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
    if (host) {
      const forwardedProto = headerList.get("x-forwarded-proto");
      const proto = forwardedProto ?? (isLocalhost(`http://${host}`) ? "http" : "https");
      return `${proto}://${host}`;
    }
  } catch {
    // Called outside a request, e.g. during the build. Fall through.
  }

  return "http://localhost:3000";
}
