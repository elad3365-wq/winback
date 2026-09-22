import type { Metadata } from "next";

import { LandingPage } from "@/components/marketing/landing-page";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "WinBack | Recover Lost Revenue From Existing Leads",
  description:
    "WinBack helps local service businesses track lost opportunities, follow up with customers, and recover more revenue from the leads and estimates they already have.",
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
