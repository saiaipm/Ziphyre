import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { bootstrapIfSeedAdmin } from "@/lib/bootstrap";
import { hasWorkspaceScopes, saveConnection } from "@/lib/google/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * OAuth return. Exchanges the code for a session, runs organization
 * bootstrap for the seed admin (tech spec §3.1), and — when the exchange
 * carried Drive/Sheets/Forms scopes — persists the Google connection.
 *
 * The connection MUST be captured here. Supabase returns
 * `provider_refresh_token` only on the exchange itself, never on a later
 * getSession(), so a connection not saved in this request can never be
 * refreshed afterwards — and nothing looks wrong until the first access
 * token expires an hour later.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (!code) {
    return NextResponse.redirect(`${origin}/sign-in?error=missing_code`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

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

  // An explicit marker from the connect button, not scope-sniffing on the
  // session: Supabase doesn't reliably surface the granted scope list, and
  // guessing wrong here either drops a real connection or records a
  // sign-in as one.
  const isConnectFlow = searchParams.get("connect") === "google";
  const refreshToken = data.session?.provider_refresh_token;
  const grantedScopes = await fetchGrantedScopes(data.session?.provider_token);

  if (user?.email && refreshToken && isConnectFlow && hasWorkspaceScopes(grantedScopes)) {
    try {
      const admin = createAdminClient();
      const { data: membership } = await admin
        .from("membership")
        .select("organization_id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();

      if (membership) {
        await saveConnection({
          organizationId: membership.organization_id,
          googleEmail: user.email,
          refreshToken,
          scopes: grantedScopes,
          connectedBy: user.id,
        });
      }
    } catch (e) {
      // Sign-in itself succeeded; only the connection failed to save. Send
      // the admin back to Connections with an explicit error rather than
      // silently landing them on a screen that says "not connected".
      console.error("[google-connection] save failed", e);
      return NextResponse.redirect(
        `${origin}/settings/connections?error=connection_save_failed`,
      );
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}

/**
 * Asks Google what it actually granted, rather than trusting what we asked
 * for — a user can untick individual permissions on the consent screen, and
 * recording the request instead of the grant would misreport what Ziphyre
 * can really do.
 */
async function fetchGrantedScopes(
  accessToken: string | null | undefined,
): Promise<string[]> {
  if (!accessToken) return [];
  try {
    const response = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`,
    );
    if (!response.ok) return [];
    const body = (await response.json()) as { scope?: string };
    return (body.scope ?? "").split(" ").filter(Boolean);
  } catch {
    return [];
  }
}
