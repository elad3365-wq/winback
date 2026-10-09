/**
 * A strip across the top of every page on a Vercel Preview deployment, naming
 * the Supabase project it talks to. Previews read the same environment
 * variables as production unless Preview-scoped ones are set, so this is how
 * to tell at a glance whether a test on a preview is writing to the live
 * database. Renders nothing in production and in local development.
 */

/** The live WinBack Supabase project. Its ref is public (it is in the URL). */
const PRODUCTION_SUPABASE_REF = "yysmbjnspenslykzmlel";

function supabaseRef(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.split(".")[0] || null;
  } catch {
    return null;
  }
}

export function PreviewDatabaseBanner() {
  if (process.env.VERCEL_ENV !== "preview") return null;

  const ref = supabaseRef(process.env.NEXT_PUBLIC_SUPABASE_URL);

  if (ref === PRODUCTION_SUPABASE_REF) {
    return (
      <div role="alert" className="bg-rose-600 px-4 py-2 text-center text-sm font-medium text-white">
        Preview is connected to the PRODUCTION database. Anything you create here is real.
      </div>
    );
  }

  return (
    <div role="status" className="bg-amber-100 px-4 py-2 text-center text-sm font-medium text-amber-900">
      Preview · test database {ref ?? "not configured"}
    </div>
  );
}
