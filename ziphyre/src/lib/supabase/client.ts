import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser client. Anon key only — every read is constrained by RLS.
 * Safe to import from any 'use client' file.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
