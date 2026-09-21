import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { getSupabaseEnv, isSupabaseConfigured } from "@/lib/env";
import type { Database } from "@/lib/database.types";

const PUBLIC_PATHS = ["/login", "/signup", "/forgot-password", "/auth"];

function isPublicPath(pathname: string) {
  return pathname === "/" || PUBLIC_PATHS.some((path) => pathname.startsWith(path));
}

/**
 * Refreshes the Supabase session cookie on every request and keeps signed-out
 * visitors out of the app pages.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Without credentials there is no session to refresh. Send app pages to
  // /login, which renders the setup screen instead of throwing.
  if (!isSupabaseConfigured()) {
    if (isPublicPath(request.nextUrl.pathname)) {
      return response;
    }
    const setupUrl = request.nextUrl.clone();
    setupUrl.pathname = "/login";
    setupUrl.search = "";
    return NextResponse.redirect(setupUrl);
  }

  const { url, anonKey } = getSupabaseEnv();

  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !isPublicPath(pathname)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (user && (pathname === "/login" || pathname === "/signup")) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/dashboard";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}
