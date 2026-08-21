"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/session";
import { getProviderChain } from "@/lib/provider-settings";
import { extractRequirements } from "@/lib/ai/extract-requirements";
import { runWithFallback } from "@/lib/ai/run-with-fallback";
import type { ProviderId } from "@/lib/ai/providers";

type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * FR-5–FR-9. Creates a posting and its first opening together — the
 * form is one screen (functional spec Flow B), even though they're
 * two rows. A posting can't exist without at least one opening.
 */
export async function createPostingWithOpening(input: {
  postingName: string;
  openingTitle: string;
  workLocation: string;
  jdContent: string;
}): Promise<ActionResult<{ postingId: string; openingId: string }>> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Not signed in." };

  const postingName = input.postingName.trim();
  const openingTitle = input.openingTitle.trim();
  const workLocation = input.workLocation.trim();
  const jdContent = input.jdContent.trim();

  if (!postingName) return { ok: false, error: "Name this posting." };
  if (!openingTitle) return { ok: false, error: "Give the opening a title." };
  if (!workLocation) return { ok: false, error: "Add a work location." };
  if (!jdContent) {
    return { ok: false, error: "Paste the job description — FR-8 requires it before this opening can go further." };
  }

  const supabase = await createClient();
  const organizationId = session.organization.id;

  const { data: posting, error: postingError } = await supabase
    .from("posting")
    .insert({ organization_id: organizationId, name: postingName })
    .select("id")
    .single();
  if (postingError) return { ok: false, error: postingError.message };

  const { data: opening, error: openingError } = await supabase
    .from("opening")
    .insert({
      organization_id: organizationId,
      posting_id: posting.id,
      title: openingTitle,
      work_location: workLocation,
      form_option_value: openingTitle,
    })
    .select("id")
    .single();
  if (openingError) return { ok: false, error: openingError.message };

  const jdResult = await insertJdVersion(opening.id, organizationId, jdContent, "paste");
  if (!jdResult.ok) return jdResult;

  revalidatePath("/postings");
  revalidatePath("/");
  return { ok: true, data: { postingId: posting.id, openingId: opening.id } };
}

/** FR-9. Adds another opening to an existing posting. */
export async function addOpeningToPosting(input: {
  postingId: string;
  openingTitle: string;
  workLocation: string;
  jdContent: string;
}): Promise<ActionResult<{ openingId: string }>> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Not signed in." };

  const openingTitle = input.openingTitle.trim();
  const workLocation = input.workLocation.trim();
  const jdContent = input.jdContent.trim();

  if (!openingTitle) return { ok: false, error: "Give the opening a title." };
  if (!workLocation) return { ok: false, error: "Add a work location." };
  if (!jdContent) return { ok: false, error: "Paste the job description." };

  const supabase = await createClient();
  const organizationId = session.organization.id;

  const { data: opening, error: openingError } = await supabase
    .from("opening")
    .insert({
      organization_id: organizationId,
      posting_id: input.postingId,
      title: openingTitle,
      work_location: workLocation,
      form_option_value: openingTitle,
    })
    .select("id")
    .single();

  if (openingError) {
    // FR-9's unique(posting_id, form_option_value): two openings in one
    // posting can't share a title, since that's the form dropdown value.
    if (openingError.code === "23505") {
      return {
        ok: false,
        error: "Another opening in this posting already uses that title.",
      };
    }
    return { ok: false, error: openingError.message };
  }

  const jdResult = await insertJdVersion(opening.id, organizationId, jdContent, "paste");
  if (!jdResult.ok) return jdResult;

  revalidatePath(`/postings/${input.postingId}`);
  return { ok: true, data: { openingId: opening.id } };
}

/** FR-12. */
export async function updateOpeningDetails(input: {
  openingId: string;
  title: string;
  workLocation: string;
}): Promise<ActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Not signed in." };

  const title = input.title.trim();
  const workLocation = input.workLocation.trim();
  if (!title) return { ok: false, error: "Give the opening a title." };
  if (!workLocation) return { ok: false, error: "Add a work location." };

  const supabase = await createClient();
  const { data: opening, error } = await supabase
    .from("opening")
    .update({ title, work_location: workLocation, form_option_value: title })
    .eq("id", input.openingId)
    .select("posting_id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        error: "Another opening in this posting already uses that title.",
      };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath(`/postings/${opening.posting_id}/openings/${input.openingId}`);
  revalidatePath(`/postings/${opening.posting_id}`);
  return { ok: true, data: undefined };
}

/** FR-12. Editing the JD creates a new append-only version — never overwrites. */
export async function updateOpeningJd(input: {
  openingId: string;
  jdContent: string;
}): Promise<ActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Not signed in." };

  const jdContent = input.jdContent.trim();
  if (!jdContent) return { ok: false, error: "The job description can't be empty." };

  const result = await insertJdVersion(
    input.openingId,
    session.organization.id,
    jdContent,
    "paste",
  );
  if (!result.ok) return result;

  const { data: opening } = await (await createClient())
    .from("opening")
    .select("posting_id")
    .eq("id", input.openingId)
    .single();

  revalidatePath(`/postings/${opening?.posting_id}/openings/${input.openingId}`);
  return { ok: true, data: undefined };
}

async function insertJdVersion(
  openingId: string,
  organizationId: string,
  content: string,
  source: "upload" | "paste",
): Promise<ActionResult> {
  const supabase = await createClient();

  const { data: latest } = await supabase
    .from("jd_version")
    .select("version")
    .eq("opening_id", openingId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextVersion = (latest?.version ?? 0) + 1;

  const { data: jdVersion, error: jdError } = await supabase
    .from("jd_version")
    .insert({
      organization_id: organizationId,
      opening_id: openingId,
      version: nextVersion,
      content,
      source,
    })
    .select("id")
    .single();
  if (jdError) return { ok: false, error: jdError.message };

  const { error: updateError } = await supabase
    .from("opening")
    .update({ current_jd_version_id: jdVersion.id })
    .eq("id", openingId);
  if (updateError) return { ok: false, error: updateError.message };

  return { ok: true, data: undefined };
}

/**
 * FR-13. Proposes requirement text from the current JD. Never
 * pre-marks must-have — that judgement stays with the admin (FR-15).
 */
export async function extractRequirementsForOpening(
  openingId: string,
): Promise<
  ActionResult<{
    suggestions: string[];
    usedProvider: ProviderId;
    usedModel: string;
    fellBack: boolean;
  }>
> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Not signed in." };

  const supabase = await createClient();
  const { data: opening } = await supabase
    .from("opening")
    .select("current_jd_version_id")
    .eq("id", openingId)
    .single();

  if (!opening?.current_jd_version_id) {
    return { ok: false, error: "This opening has no job description yet." };
  }

  const { data: jdVersion } = await supabase
    .from("jd_version")
    .select("content")
    .eq("id", opening.current_jd_version_id)
    .single();

  if (!jdVersion) return { ok: false, error: "Couldn't load the job description." };

  const chain = await getProviderChain();
  if (chain.length === 0) {
    return {
      ok: false,
      error:
        "No screening provider configured yet. Add an API key in Settings → Screening first.",
    };
  }

  const result = await runWithFallback(chain, (provider) =>
    extractRequirements(jdVersion.content, provider),
  );

  if (!result.ok) {
    // Every provider failed. Report the first failure — it's the one
    // the admin chose as primary — but say how many were tried, so a
    // total outage doesn't look like a single misconfigured key.
    const first = result.attempts[0];
    const suffix =
      result.attempts.length > 1
        ? ` (all ${result.attempts.length} configured providers failed)`
        : "";
    return { ok: false, error: `${first?.error ?? "Unknown error"}${suffix}` };
  }

  return {
    ok: true,
    data: {
      suggestions: result.data,
      usedProvider: result.usedProvider,
      usedModel: result.usedModel,
      fellBack: result.failedAttempts.length > 0,
    },
  };
}

/**
 * FR-14/FR-15. Full replace — the editor manages arbitrary add, edit,
 * delete and reorder client-side; this is the one write that commits
 * the final list.
 */
export async function saveRequirements(input: {
  openingId: string;
  requirements: { text: string; kind: "must_have" | "preferred" }[];
}): Promise<ActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Not signed in." };

  const cleaned = input.requirements
    .map((r) => ({ text: r.text.trim(), kind: r.kind }))
    .filter((r) => r.text.length > 0);

  const supabase = await createClient();

  const { error: deleteError } = await supabase
    .from("requirement")
    .delete()
    .eq("opening_id", input.openingId);
  if (deleteError) return { ok: false, error: deleteError.message };

  if (cleaned.length > 0) {
    const { error: insertError } = await supabase.from("requirement").insert(
      cleaned.map((r, i) => ({
        organization_id: session.organization.id,
        opening_id: input.openingId,
        text: r.text,
        kind: r.kind,
        sort_order: i,
      })),
    );
    if (insertError) return { ok: false, error: insertError.message };
  }

  const { data: opening } = await supabase
    .from("opening")
    .select("posting_id")
    .eq("id", input.openingId)
    .single();

  revalidatePath(`/postings/${opening?.posting_id}/openings/${input.openingId}`);
  return { ok: true, data: undefined };
}

/** FR-10. */
export async function closePosting(postingId: string): Promise<ActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Not signed in." };

  const closedAt = new Date();
  const purgeAfter = new Date(closedAt);
  purgeAfter.setMonth(purgeAfter.getMonth() + 6); // TechDecisions §8

  const supabase = await createClient();
  const { error } = await supabase
    .from("posting")
    .update({
      status: "closed",
      closed_at: closedAt.toISOString(),
      purge_after: purgeAfter.toISOString(),
    })
    .eq("id", postingId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/postings/${postingId}`);
  revalidatePath("/postings");
  revalidatePath("/");
  return { ok: true, data: undefined };
}

/** FR-11. */
export async function reopenPosting(postingId: string): Promise<ActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Not signed in." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("posting")
    .update({ status: "open", closed_at: null, purge_after: null, purge_warned_at: null })
    .eq("id", postingId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/postings/${postingId}`);
  revalidatePath("/postings");
  revalidatePath("/");
  return { ok: true, data: undefined };
}

/**
 * FR-84. Cascades to openings, JD versions and requirements at the
 * database level (tech spec §2.1). No application table exists yet
 * (M2), so the candidate count this confirms is always zero right
 * now — genuinely true, not a placeholder.
 */
export async function deletePosting(postingId: string): Promise<ActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Not signed in." };

  const supabase = await createClient();
  const { error } = await supabase.from("posting").delete().eq("id", postingId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/postings");
  revalidatePath("/");
  redirect("/postings");
}
