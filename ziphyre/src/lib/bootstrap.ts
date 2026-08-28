import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Organization bootstrap — tech spec §3.1.
 *
 * A seed admin's first sign-in is the ONLY route by which an organization
 * comes into existence. Everyone else lands with no membership and sees the
 * no-access screen until invited.
 *
 * Signing in must never quietly create an organization for an arbitrary user.
 *
 * **`SEED_ADMIN_EMAIL` accepts a comma-separated list**, so a founder can
 * grandfather a second address — typically moving from a personal Gmail to
 * the company one — without either losing access or a second organization
 * appearing. Every listed address joins the *existing* organization; the
 * insert below only creates one when none exists at all.
 *
 * This is deliberately not an invite system. It is a short list of founding
 * addresses in an environment variable, which means adding one requires
 * deploy access rather than a click. Real invites are the permission layer
 * (`membership` already carries `invited_by` and `status`), still unbuilt.
 */
export async function bootstrapIfSeedAdmin(userId: string, email: string) {
  const seedEmails = (process.env.SEED_ADMIN_EMAIL ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (!seedEmails.includes(email.trim().toLowerCase())) return;

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
