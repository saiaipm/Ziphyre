import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * ELEVATED CLIENT — BYPASSES ROW-LEVEL SECURITY.
 *
 * Tech spec §3: this is constructed in exactly one module, and that module
 * must never be imported by anything that renders. `server-only` makes a
 * client import a build error rather than a silent tenancy leak.
 *
 * Every query made with this client MUST filter organization_id explicitly.
 * RLS is not protecting you here.
 *
 * Legitimate uses in M0: organization bootstrap on first sign-in (§3.1).
 * Later: background jobs.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set — bootstrap and background jobs cannot run.",
    );
  }

  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
