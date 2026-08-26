"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/session";
import { getProviderChain } from "@/lib/provider-settings";
import { extractRequirements } from "@/lib/ai/extract-requirements";
import { runWithFallback } from "@/lib/ai/run-with-fallback";
import type { ProviderId } from "@/lib/ai/providers";
import { enqueueJob } from "@/lib/jobs/queue";
import { runQueuedJobs } from "@/lib/jobs/runner";
import { getApplicationsForOpening, type ApplicationListItem } from "@/lib/applications";

const ALLOWED_CV_MIME = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

/** FR-24. Some browsers report an empty or generic type for older formats. */
function resolveCvMime(file: File): string | null {
  if (ALLOWED_CV_MIME.has(file.type)) return file.type;
  const ext = file.name.toLowerCase().split(".").pop();
  switch (ext) {
    case "pdf":
      return "application/pdf";
    case "doc":
      return "application/msword";
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    default:
      return null;
  }
}

/** Pump queued jobs right after the response is sent — a local-dev/test
 * convenience layered on the real job queue, not a replacement for it.
 * If a deployment's route timeout cuts this short, the jobs are still
 * `queued` and Vercel Cron (vercel.json, every minute) picks them up. */
function pumpJobsAfterResponse() {
  after(() => {
    runQueuedJobs({ kinds: ["screen_application"] }).catch(() => {});
  });
}

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
    })
    .select("id")
    .single();

  if (openingError) {
    // Two openings in one
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
    .update({ title, work_location: workLocation })
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

/** Renames a posting. Not itself an FR — postings/openings only cover the opening's own fields (FR-12) — but the posting name was otherwise fixed forever after creation. */
export async function updatePostingName(input: {
  postingId: string;
  name: string;
}): Promise<ActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Not signed in." };

  const name = input.name.trim();
  if (!name) return { ok: false, error: "Name this posting." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("posting")
    .update({ name })
    .eq("id", input.postingId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/postings/${input.postingId}`);
  revalidatePath("/postings");
  revalidatePath("/");
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
 * FR-84. Cascades to openings, JD versions, requirements,
 * applications, screenings and stage events at the database level
 * (tech spec §2.1). The delete-confirmation dialog's candidate count
 * isn't wired to a real query yet — that's a small follow-up, not
 * part of M2's scope.
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

// ---------------------------------------------------------------------------
// M2 — manual candidate upload and screening retry
// ---------------------------------------------------------------------------

/**
 * FR-31/FR-32. Each file becomes one application with every form field
 * Not provided (FR-33) — manual upload has no candidate-supplied email,
 * so identity here is name-only; the candidate's email is an internal
 * placeholder the UI never shows (confirmed decision, see the M2 plan).
 * A bad file is skipped, never allowed to block the rest of the batch
 * (§9 "Loading — bulk upload").
 */
export async function addCandidatesToOpening(
  openingId: string,
  formData: FormData,
): Promise<ActionResult<{ added: number; skipped: string[] }>> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Not signed in." };

  const files = formData.getAll("file") as File[];
  const names = formData.getAll("name") as string[];
  if (files.length === 0) return { ok: false, error: "Choose at least one CV." };

  const supabase = await createClient();
  const organizationId = session.organization.id;
  const skipped: string[] = [];
  let added = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const mime = resolveCvMime(file);
    if (!mime) {
      skipped.push(`${file.name} (not a PDF, DOC or DOCX)`);
      continue;
    }

    const displayName = (names[i] ?? "").trim() || file.name.replace(/\.[^.]+$/, "");
    const placeholderEmail = `manual+${randomUUID()}@ziphyre.internal`;

    const { data: candidate, error: candidateError } = await supabase
      .from("candidate")
      .insert({
        organization_id: organizationId,
        email: placeholderEmail,
        full_name: displayName,
      })
      .select("id")
      .single();
    if (candidateError) {
      skipped.push(`${file.name} (${candidateError.message})`);
      continue;
    }

    const { data: application, error: applicationError } = await supabase
      .from("application")
      .insert({
        organization_id: organizationId,
        opening_id: openingId,
        candidate_id: candidate.id,
        source: "manual",
        source_status: "manual",
        submitted_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (applicationError) {
      skipped.push(`${file.name} (${applicationError.message})`);
      continue;
    }

    const storagePath = `${organizationId}/${application.id}/${file.name}`;
    const bytes = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await supabase.storage
      .from("cvs")
      .upload(storagePath, bytes, { contentType: mime });
    if (uploadError) {
      skipped.push(`${file.name} (${uploadError.message})`);
      continue;
    }

    const { error: updateError } = await supabase
      .from("application")
      .update({
        cv_storage_path: storagePath,
        cv_mime: mime,
        cv_original_filename: file.name,
      })
      .eq("id", application.id);
    if (updateError) {
      skipped.push(`${file.name} (${updateError.message})`);
      continue;
    }

    await enqueueJob(organizationId, "screen_application", {
      applicationId: application.id,
      reason: "new",
    });
    added++;
  }

  if (added === 0) {
    return { ok: false, error: `None of the files could be added: ${skipped.join(", ")}` };
  }

  pumpJobsAfterResponse();

  const { data: opening } = await supabase
    .from("opening")
    .select("posting_id")
    .eq("id", openingId)
    .single();
  revalidatePath(`/postings/${opening?.posting_id}/openings/${openingId}`);

  return { ok: true, data: { added, skipped } };
}

/** Polled by the candidates list while any application is pending/in-progress. */
export async function refreshApplications(
  openingId: string,
): Promise<ActionResult<ApplicationListItem[]>> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Not signed in." };

  const applications = await getApplicationsForOpening(openingId);
  return { ok: true, data: applications };
}

/** FR-48. Re-queues a screening that's flagged Needs manual review. */
export async function retryScreening(applicationId: string): Promise<ActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Not signed in." };

  const supabase = await createClient();
  const { data: application, error } = await supabase
    .from("application")
    .update({ screening_status: "pending", screening_failure_reason: null })
    .eq("id", applicationId)
    .select("opening_id")
    .single();
  if (error) return { ok: false, error: error.message };

  await enqueueJob(session.organization.id, "screen_application", {
    applicationId,
    reason: "retry",
  });

  pumpJobsAfterResponse();

  const { data: opening } = await supabase
    .from("opening")
    .select("posting_id")
    .eq("id", application.opening_id)
    .single();
  revalidatePath(`/postings/${opening?.posting_id}/openings/${application.opening_id}`);

  return { ok: true, data: undefined };
}

/**
 * FR-88. Regenerating invalidates the old link immediately — the point
 * of the feature is that a leaked or spammed link can be killed.
 */
export async function regenerateApplyLink(
  postingId: string,
): Promise<ActionResult<{ applyToken: string }>> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Not signed in." };

  const applyToken = randomBytes(32).toString("base64url");

  const supabase = await createClient();
  const { error } = await supabase
    .from("posting")
    .update({ apply_token: applyToken })
    .eq("id", postingId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/postings/${postingId}`);
  return { ok: true, data: { applyToken } };
}
