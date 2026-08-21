"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/session";

export type SaveResult = { ok: true } | { ok: false; error: string };

export async function saveOrganization(input: {
  name: string;
  legalName: string;
  website: string;
  industry: string;
  sizeBand: string;
  primaryLocation: string;
  timezone: string;
  currency: string;
}): Promise<SaveResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Not signed in." };

  if (!input.name.trim()) {
    return { ok: false, error: "Organization name is required." };
  }

  const supabase = await createClient();

  // Scoped by id AND protected by RLS — the policy only permits updating
  // an organization the caller is an active member of.
  const { error } = await supabase
    .from("organization")
    .update({
      name: input.name.trim(),
      legal_name: input.legalName.trim() || null,
      website: input.website.trim() || null,
      industry: input.industry || null,
      size_band: input.sizeBand || null,
      primary_location: input.primaryLocation.trim() || null,
      timezone: input.timezone,
      currency: input.currency,
    })
    .eq("id", session.organization.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/settings/organization");
  revalidatePath("/");
  return { ok: true };
}
