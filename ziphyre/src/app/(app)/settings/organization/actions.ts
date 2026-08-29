"use server";

import { revalidatePath, refresh } from "next/cache";
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
  // `revalidatePath` invalidates *cached* data. Home and Postings read
  // this value through the session cookie, so they render dynamically
  // and have no cache entry to invalidate — the client router simply
  // kept the tree it already had. The write landed, the switch moved,
  // and the sample posting stayed on screen underneath a toast saying
  // it was hidden. Found on production 29 Aug; invisible locally,
  // because what was verified before was the filter expression rather
  // than the click. `refresh()` is what re-renders the page the toggle
  // is actually sitting on.
  refresh();
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
  // `showSampleData` is deliberately absent. It has its own control and
  // its own action (`setShowSampleData` above), because a whole-form
  // save would write a stale copy back over a change made from the
  // header toggle on Home or Postings.
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

  // FR-139/§10B: Home reads this same value, so it has to revalidate
  // too — not just this settings page.
  revalidatePath("/settings/organization");
  revalidatePath("/");
  revalidatePath("/postings");
  return { ok: true };
}
