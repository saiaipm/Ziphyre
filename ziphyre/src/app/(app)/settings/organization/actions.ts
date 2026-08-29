"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/session";

export type SaveResult = { ok: true } | { ok: false; error: string };

/**
 * FR-136, on its own. The organisation form saves every field together
 * behind a Save button; this one control also appears on Home and
 * Postings, where there is no form and no Save — flipping it there
 * should just take effect.
 */
export async function setShowSampleData(show: boolean): Promise<SaveResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Not signed in." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("organization")
    .update({ show_sample_data: show })
    .eq("id", session.organization.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/");
  revalidatePath("/postings");
  revalidatePath("/settings/organization");
  return { ok: true };
}

export async function saveOrganization(input: {
  name: string;
  legalName: string;
  website: string;
  industry: string;
  sizeBand: string;
  primaryLocation: string;
  timezone: string;
  currency: string;
  showSampleData: boolean;
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
      show_sample_data: input.showSampleData,
    })
    .eq("id", session.organization.id);

  if (error) return { ok: false, error: error.message };

  // FR-139/§10B: Home reads this same value, so it has to revalidate
  // too — not just this settings page.
  revalidatePath("/settings/organization");
  revalidatePath("/");
  revalidatePath("/postings");
  return { ok: true };
}
