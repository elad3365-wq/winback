import type { Metadata } from "next";

import { LandingPage } from "@/components/marketing/landing-page";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "WinBack Early Access | Lead Follow-Up for Service Businesses",
  description:
    "Join WinBack's free 14-day founding pilot. Keep track of quote requests, prepare AI follow-up drafts you review before sending, and see which opportunities still need attention.",
};

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
