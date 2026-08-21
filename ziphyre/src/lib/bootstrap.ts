import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Organization bootstrap — tech spec §3.1.
 *
 * The seed admin's first sign-in is the ONLY route by which an organization
 * comes into existence. Everyone else lands with no membership and sees the
 * no-access screen until invited.
 *
 * Signing in must never quietly create an organization for an arbitrary user.
 */
export async function bootstrapIfSeedAdmin(userId: string, email: string) {
  const seedEmail = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  if (!seedEmail || email.trim().toLowerCase() !== seedEmail) return;

  const admin = createAdminClient();

  // Already a member of something? Nothing to do.
  const { data: existingMembership } = await admin
    .from("membership")
    .select("id")
    .eq("user_id", userId)
    .limit(1);

  if (existingMembership && existingMembership.length > 0) return;

  // An organization already exists — attach the seed admin rather than
  // creating a second one.
  const { data: existingOrgs } = await admin
    .from("organization")
    .select("id")
    .limit(1);

  let organizationId = existingOrgs?.[0]?.id as string | undefined;

  if (!organizationId) {
    const { data: created, error } = await admin
      .from("organization")
      .insert({ name: "My organization" })
      .select("id")
      .single();

    if (error) throw error;
    organizationId = created.id;
  }

  const { error: membershipError } = await admin.from("membership").insert({
    organization_id: organizationId,
    user_id: userId,
    role: "admin",
    status: "active",
    accepted_at: new Date().toISOString(),
  });

  if (membershipError) throw membershipError;
}
