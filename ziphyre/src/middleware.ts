import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase session on every request and gates the app.
 *
 * Signed out          -> /sign-in
 * Signed in, no org   -> /no-access   (tech spec §3.1)
 * Signed in, with org -> through
 */
// /api/cron is guarded by its own bearer-token check (CRON_SECRET),
// not a user session — Vercel Cron never carries one. Without this,
// every cron invocation would redirect to /sign-in and never run.
//
// /apply, /api/apply and /status are the product's public surfaces
// (tech spec §5.1, §10A.4). Candidates have no account and never sign
// in, so gating them here would make applying — and checking a status —
// impossible. Their handlers do their own validation, authorise on an
// unguessable token, and never touch the database as `anon`.
//
// Dropping any of these breaks the surface ONLY in production: locally
// a signed-in session masks it, and a candidate's 404 is the first sign.
const PUBLIC_PATHS = [
  "/sign-in",
  "/auth",
  "/no-access",
  "/api/cron",
  "/apply",
  "/api/apply",
  "/status",
];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do not remove: this refreshes the session cookie.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    return NextResponse.redirect(url);
  }

  if (user && (path === "/sign-in" || path === "/no-access")) {
    const { data: memberships } = await supabase
      .from("membership")
      .select("organization_id")
      .eq("status", "active")
      .limit(1);

    const hasOrg = (memberships?.length ?? 0) > 0;

    if (hasOrg && path === "/sign-in") {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
    if (!hasOrg && path === "/sign-in") {
      const url = request.nextUrl.clone();
      url.pathname = "/no-access";
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
