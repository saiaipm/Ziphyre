import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { bootstrapIfSeedAdmin } from "@/lib/bootstrap";

/**
 * OAuth return for ADMIN sign-in. Exchanges the code for a session and
 * runs organization bootstrap for the seed admin (tech spec §3.1).
 *
 * Nothing else. Sign-in requests only basic identity scopes now, and
 * intake needs no Google connection at all (PN-002) — which is exactly
 * what keeps the consent screen out of Google's verification review.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (!code) {
    return NextResponse.redirect(`${origin}/sign-in?error=missing_code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/sign-in?error=exchange_failed`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user?.email) {
    try {
      await bootstrapIfSeedAdmin(user.id, user.email);
    } catch (e) {
      console.error("[bootstrap] failed", e);
      return NextResponse.redirect(`${origin}/sign-in?error=bootstrap_failed`);
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}
