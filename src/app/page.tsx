import { LandingPage } from "@/components/marketing/landing-page";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * The public marketing homepage. Visitors are no longer redirected to /login —
 * `/` now renders the WinBack landing page. When someone is already signed in
 * we simply swap the nav CTA for a link to their dashboard; we never force a
 * redirect away from the homepage.
 */
export default async function HomePage() {
  let isAuthed = false;

  if (isSupabaseConfigured()) {
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      isAuthed = Boolean(user);
    } catch {
      isAuthed = false;
    }
  }

  return <LandingPage isAuthed={isAuthed} />;
}
