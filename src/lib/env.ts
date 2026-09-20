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

export function getSiteUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  );
}
