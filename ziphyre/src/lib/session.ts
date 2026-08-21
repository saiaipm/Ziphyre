import "server-only";
import { createClient } from "@/lib/supabase/server";

export type Organization = {
  id: string;
  name: string;
  legal_name: string | null;
  website: string | null;
  industry: string | null;
  size_band: string | null;
  primary_location: string | null;
  timezone: string;
  currency: string;
};

export type SessionContext = {
  userId: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  organization: Organization;
};

/**
 * Resolves the signed-in user and their organization.
 * Returns null when there is no session or no active membership —
 * middleware handles the redirect, this just reports the truth.
 */
export async function getSessionContext(): Promise<SessionContext | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) return null;

  const { data: membership } = await supabase
    .from("membership")
    .select(
      "organization:organization_id (id, name, legal_name, website, industry, size_band, primary_location, timezone, currency)",
    )
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  const organization = membership?.organization as unknown as
    | Organization
    | undefined;

  if (!organization) return null;

  return {
    userId: user.id,
    email: user.email,
    displayName:
      (user.user_metadata?.full_name as string | undefined) ??
      (user.user_metadata?.name as string | undefined) ??
      null,
    avatarUrl: (user.user_metadata?.avatar_url as string | undefined) ?? null,
    organization,
  };
}
