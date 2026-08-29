"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionContext } from "@/lib/session";
import { getProviderChain } from "@/lib/provider-settings";
import { extractRequirements } from "@/lib/ai/extract-requirements";
import { runWithFallback } from "@/lib/ai/run-with-fallback";
import type { ProviderId } from "@/lib/ai/providers";
import { enqueueJob } from "@/lib/jobs/queue";
import { runQueuedJobs } from "@/lib/jobs/runner";
import type { JobKind } from "@/lib/jobs/types";
import {
  getOutcomeSendPreview,
  queueOutcomeMessages,
  type OfferKind,
  type OutcomeSendPreview,
  type OutcomeSendResult,
} from "@/lib/mail/outcome";
import {
  getApplicationsForOpening,
  getReassignTargets,
  getStageHistory,
  type ApplicationListItem,
  type ReassignTarget,
  type StageEvent,
} from "@/lib/applications";
import {
  stageTakesDisposition,
  type DispositionKey,
  type StageKey,
} from "@/lib/stages";
import { extractDocumentText } from "@/lib/cv/extract-text";

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
function pumpJobsAfterResponse(priority?: JobKind[]) {
  after(async () => {
    // `priority` only decides what goes FIRST, never what is eligible.
    //
    // This took a `kinds` filter until now, and three call sites passed
    // ["send_message"] so an outcome email wouldn't queue behind a slow
    // screening. The cost was invisible and worse: a pump narrowed to
    // send_message steps straight over a queued screening and leaves it
    // there. That is exactly what happened on 29 Aug — a
    // screen_application job created at 05:49:08 sat unclaimed while a
    // send_message job created at 05:49:09 was picked up four minutes
    // later by a send-only pump, and the screening waited two hours for
    // a manual cron run.
    //
    // Sending first still gets the fast, user-visible work out; the
    // second pass then sweeps whatever else is queued, so no kind can
    // be orphaned by another kind's pump. `runQueuedJobs` stops
    // claiming near the function's time limit, so the second pass
    // cannot overrun the first.
    try {
      if (priority?.length) await runQueuedJobs({ kinds: priority });
      await runQueuedJobs({ kinds: ["screen_application", "send_message"] });
    } catch {
      // Best-effort by design: the cron is the backstop, and a pump
      // that throws must not surface as a failed user action.
    }
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
    .insert({
      organization_id: organizationId,
      name: postingName,
      // apply_token is NOT NULL with no database default — it was
      // added that way in M3.5 (backfilled once for postings that
      // already existed) and this insert never supplied one going
      // forward. No new posting has been created through this form
      // since: the only row in production predates the migration.
      // Same convention `regenerateApplyLink` already uses.
      apply_token: randomBytes(32).toString("base64url"),
    })
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
        // §10A.4/FR-119: every application needs a status page. The
        // apply-page path gets one from the M7 migration's backfill,
        // which only ever ran once — a manual upload since has been
        // getting no token at all, silently. Found while seeding M8's
        // sample candidates, themselves manual uploads.
        status_token: randomBytes(32).toString("base64url"),
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

  // Only queue a *new* job if nothing is already waiting for this
  // application. Retry exists for a screening that is stuck, but the
  // admin cannot tell "stuck" from "slow" — the row says "Screening…"
  // either way — so the common case is pressing it on work that was
  // always going to run.
  //
  // Unguarded, that screens the same CV twice. On 29 Aug it did: two
  // parses of the same 5172 characters, two model calls, and two
  // `screening` rows scoring 9.0 and 8.6 for one CV against one JD on
  // one model. The later row wins `current_screening_id`, so the score
  // the admin ends up reading is the duplicate's — and since scores are
  // immutable (§7) the first is kept forever with nothing pointing at
  // it.
  //
  // A pending job plus a pump is the right response to "slow": it costs
  // nothing and rescues a genuinely orphaned job just as well, because
  // the pump claims whatever is queued.
  // The admin client, because `job` carries no client policy at all
  // (tech spec §3) — the user's own client cannot read this table.
  const admin = createAdminClient();
  const { data: pending, error: pendingError } = await admin
    .from("job")
    .select("id")
    .eq("kind", "screen_application")
    .eq("status", "queued")
    .contains("payload", { applicationId })
    .limit(1);
  if (pendingError) return { ok: false, error: pendingError.message };

  if (!pending || pending.length === 0) {
    await enqueueJob(session.organization.id, "screen_application", {
      applicationId,
      reason: "retry",
    });
  }

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

// ---------------------------------------------------------------------------
// JD upload and CV viewing
// ---------------------------------------------------------------------------

const JD_MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  md: "text/markdown",
  markdown: "text/markdown",
  txt: "text/plain",
};

/**
 * FR-7 — "uploaded as a document or pasted as text". The paste half has
 * existed since M1; this is the half that was specified and never built.
 *
 * The document is parsed to text and stored as a normal JD version:
 * we keep the words, not the file. Everything downstream — requirement
 * extraction, screening, versioning — already works on text, and a
 * stored binary would be a second thing to read, retain and purge.
 */
export async function uploadOpeningJd(
  openingId: string,
  formData: FormData,
): Promise<ActionResult<{ characters: number }>> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Not signed in." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a file to upload." };
  }

  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  const mime = JD_MIME_BY_EXT[ext];
  if (!mime) {
    return {
      ok: false,
      error: "Upload a PDF, Word (.docx), Markdown (.md) or plain text file.",
    };
  }

  let text: string | null;
  try {
    text = await extractDocumentText(Buffer.from(await file.arrayBuffer()), mime);
  } catch (err) {
    console.error("uploadOpeningJd: parse failed", err);
    return { ok: false, error: "We couldn't read that file. It may be damaged." };
  }

  const content = (text ?? "").trim();
  if (!content) {
    return {
      ok: false,
      error:
        "We couldn't find any text in that file — a scanned or image-only document can't be read.",
    };
  }

  const result = await insertJdVersion(
    openingId,
    session.organization.id,
    content,
    "upload",
  );
  if (!result.ok) return result;

  const supabase = await createClient();
  const { data: opening } = await supabase
    .from("opening")
    .select("posting_id")
    .eq("id", openingId)
    .single();

  revalidatePath(`/postings/${opening?.posting_id}/openings/${openingId}`);
  return { ok: true, data: { characters: content.length } };
}

/**
 * FR-61. A short-lived signed URL so the CV can be read beside its
 * assessment. Generated per view and never stored — tech spec §12.
 */
export async function getCvViewUrl(
  applicationId: string,
): Promise<ActionResult<{ url: string; mime: string; filename: string }>> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Not signed in." };

  const supabase = await createClient();
  const { data: application } = await supabase
    .from("application")
    .select("cv_storage_path, cv_mime, cv_original_filename")
    .eq("id", applicationId)
    .maybeSingle();

  if (!application?.cv_storage_path) {
    return { ok: false, error: "This application has no CV on file." };
  }

  const { data, error } = await supabase.storage
    .from("cvs")
    .createSignedUrl(application.cv_storage_path, 300);

  if (error || !data) {
    return { ok: false, error: "Couldn't open the CV. Please try again." };
  }

  return {
    ok: true,
    data: {
      url: data.signedUrl,
      mime: application.cv_mime ?? "application/pdf",
      filename: application.cv_original_filename ?? "cv.pdf",
    },
  };
}

// ---------------------------------------------------------------------------
// Stage transitions — FR-56 to FR-60
// ---------------------------------------------------------------------------

/**
 * FR-56, FR-57, FR-59. One action for one candidate and for fifty —
 * the functional spec's §"Single vs many" rule is that they behave
 * identically, so there is deliberately no separate single-move path.
 *
 * **One RPC call per application, never a batch statement.** Tech spec
 * §9: FR-59 requires every change individually attributable, and each
 * call is its own locked transaction over one application. A batch of
 * twenty is twenty decisions about twenty people.
 *
 * Partial success is reported, not swallowed. If three of twenty fail,
 * the seventeen that moved have moved, and saying "done" would be a
 * lie the admin only discovers when the funnel doesn't add up.
 */
export async function changeApplicationStage(input: {
  applicationIds: string[];
  toStage: StageKey;
  disposition?: DispositionKey | null;
  note?: string | null;
  /**
   * FR-110. The offer made in the reject dialog, carried into the same
   * action. **Only ever true because a person ticked it** — FR-109 means
   * no other caller may set this, and no default may supply it.
   */
  sendOutcome?: boolean;
  /** For revalidation; the pipeline is addressed by both ids. */
  postingId: string;
  openingId: string;
}): Promise<
  ActionResult<{
    moved: number;
    failed: number;
    outcome: OutcomeSendResult | null;
  }>
> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Not signed in." };

  if (input.applicationIds.length === 0) {
    return { ok: false, error: "Nothing selected." };
  }

  // FR-57 confines disposition to On hold and Rejected. The database
  // constrains this too; dropping it here keeps the two agreeing rather
  // than letting the UI send something the constraint will reject.
  const disposition = stageTakesDisposition(input.toStage)
    ? (input.disposition ?? null)
    : null;

  const supabase = await createClient();

  // Read before moving: afterwards the stage has changed and there is no
  // way to tell who was on Rejected when this started.
  const reversal = input.toStage !== "rejected";
  let toldIds: string[] = [];
  if (reversal) {
    const { data } = await supabase
      .from("application")
      .select("id")
      .in("id", input.applicationIds)
      .eq("current_stage", "rejected")
      .not("outcome_sent_at", "is", null);
    toldIds = (data ?? []).map((r) => r.id);
  }

  let failed = 0;
  const movedIds: string[] = [];
  for (const applicationId of input.applicationIds) {
    const { error } = await supabase.rpc("record_stage_change", {
      p_application_id: applicationId,
      p_to_stage: input.toStage,
      p_actor_id: session.userId,
      p_disposition: disposition,
      p_note: input.note ?? null,
    });
    if (error) failed += 1;
    else movedIds.push(applicationId);
  }

  const moved = movedIds.length;

  // FR-110. Queued only for the candidates who actually moved: telling
  // someone they were not successful when the rejection failed to record
  // is the one ordering mistake here that cannot be taken back.
  let outcome: OutcomeSendResult | null = null;
  if (input.sendOutcome && input.toStage === "rejected" && moved > 0) {
    outcome = await queueOutcomeMessages({
      organizationId: session.organization.id,
      organisationName: session.organization.name,
      applicationIds: movedIds,
      sentBy: session.userId,
    });
    if (outcome.queued > 0) pumpJobsAfterResponse(["send_message"]);
  }

  // ---- Moving back off Rejected, after they were told ----------------
  //
  // Two separate obligations, and only the first is optional.
  //
  // The update is offered, because Principle 4 says a state change
  // reaches the people it affects and a reversal qualifies — someone is
  // holding a rejection email that is no longer true.
  //
  // Clearing `outcome_sent_at` is NOT optional and happens either way.
  // The column is FR-123's gate: while it is set, a future rejection
  // would flip the status page to "Not moving forward" instantly, with
  // no second email and no human deciding to send one. The protection
  // would be spent after its first use. Re-arming it means any later
  // rejection needs a fresh, deliberate send.
  const reversedIds = toldIds.filter((id) => movedIds.includes(id));
  if (reversedIds.length > 0) {
    if (input.sendOutcome) {
      outcome = await queueOutcomeMessages({
        organizationId: session.organization.id,
        organisationName: session.organization.name,
        applicationIds: reversedIds,
        sentBy: session.userId,
        kind: "reversal",
      });
      if (outcome.queued > 0) pumpJobsAfterResponse(["send_message"]);
    }

    // After the send, never before: `queueOutcomeMessages` uses
    // `outcome_sent_at` to decide who is eligible for a reversal
    // message, so clearing it first would make the list empty.
    const { error: clearError } = await supabase
      .from("application")
      .update({ outcome_sent_at: null })
      .in("id", reversedIds);
    if (clearError) {
      // Worth surfacing rather than swallowing: the move succeeded, but
      // the gate is still armed and a later rejection would skip its
      // human step.
      console.error("[stage] couldn't clear outcome_sent_at", clearError);
    }
  }

  revalidatePath(`/postings/${input.postingId}/openings/${input.openingId}`);
  revalidatePath("/");

  if (moved === 0) {
    return {
      ok: false,
      error:
        failed === 1
          ? "Couldn't move that candidate. Please try again."
          : `Couldn't move any of the ${failed} selected candidates. Please try again.`,
    };
  }

  return { ok: true, data: { moved, failed, outcome } };
}

/**
 * FR-107. Sending an interview invite on its own, with no stage change.
 *
 * Separate from `changeApplicationStage` because the common case is a
 * candidate who was shortlisted days ago — the decision to talk to
 * someone and the decision to move them are not the same decision, and
 * forcing a stage change to send an invite would write a false history
 * row (FR-59) for a move that did not happen.
 */
export async function sendInterviewInvites(input: {
  applicationIds: string[];
  postingId: string;
  openingId: string;
}): Promise<ActionResult<OutcomeSendResult>> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Not signed in." };
  if (input.applicationIds.length === 0) {
    return { ok: false, error: "Nothing selected." };
  }

  const outcome = await queueOutcomeMessages({
    organizationId: session.organization.id,
    organisationName: session.organization.name,
    applicationIds: input.applicationIds,
    sentBy: session.userId,
    kind: "invite",
  });

  if (outcome.queued > 0) pumpJobsAfterResponse(["send_message"]);
  revalidatePath(`/postings/${input.postingId}/openings/${input.openingId}`);
  revalidatePath("/communications");

  return { ok: true, data: outcome };
}

/**
 * FR-110 and FR-116. What the reject dialog needs before it can offer
 * anything: whether a sending identity exists, who among the selection
 * can actually be reached, and — for a single candidate — the words
 * that would leave.
 */
export async function loadOutcomeSendPreview(
  applicationIds: string[],
  kind: OfferKind = "reject",
): Promise<ActionResult<OutcomeSendPreview>> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Not signed in." };
  if (applicationIds.length === 0) return { ok: false, error: "Nothing selected." };

  try {
    return {
      ok: true,
      data: await getOutcomeSendPreview(
        session.organization.id,
        session.organization.name,
        applicationIds,
        kind,
      ),
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Couldn't check the sending setup.",
    };
  }
}

/** FR-59. Read on demand — history is opened, not listed. */
export async function loadStageHistory(
  applicationId: string,
): Promise<ActionResult<StageEvent[]>> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Not signed in." };

  try {
    return { ok: true, data: await getStageHistory(applicationId) };
  } catch {
    return { ok: false, error: "Couldn't load this candidate's history." };
  }
}

/** FR-60. The other openings on this posting, collisions marked. */
export async function loadReassignTargets(
  applicationId: string,
): Promise<ActionResult<ReassignTarget[]>> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Not signed in." };

  try {
    return { ok: true, data: await getReassignTargets(applicationId) };
  } catch {
    return { ok: false, error: "Couldn't load the other openings." };
  }
}

/**
 * FR-60. Moves an application to another opening on the same posting,
 * and offers a rescreen against that opening's job description.
 *
 * The rescreen needs no new payload: `screen_application` resolves the
 * opening from the application when it runs, so a job queued after the
 * move already reads the new JD and the new requirement list.
 *
 * Declining the rescreen is allowed and leaves the old score in place —
 * which is why the assessment dialog says which job description a score
 * was produced against. A score silently attributed to a role it was
 * never computed for is the failure worth avoiding here.
 */
export async function reassignApplication(input: {
  applicationId: string;
  targetOpeningId: string;
  rescreen: boolean;
  postingId: string;
  fromOpeningId: string;
}): Promise<ActionResult<{ openingTitle: string; rescreening: boolean }>> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Not signed in." };

  const supabase = await createClient();
  const { data: openingTitle, error } = await supabase.rpc(
    "reassign_application",
    {
      p_application_id: input.applicationId,
      p_target_opening_id: input.targetOpeningId,
      p_actor_id: session.userId,
    },
  );

  if (error) {
    return { ok: false, error: describeReassignFailure(error.message) };
  }

  let rescreening = false;
  if (input.rescreen) {
    await supabase
      .from("application")
      .update({ screening_status: "pending", screening_failure_reason: null })
      .eq("id", input.applicationId);

    await enqueueJob(session.organization.id, "screen_application", {
      applicationId: input.applicationId,
      reason: "reassigned",
    });
    pumpJobsAfterResponse();
    rescreening = true;
  }

  revalidatePath(`/postings/${input.postingId}/openings/${input.fromOpeningId}`);
  revalidatePath(`/postings/${input.postingId}/openings/${input.targetOpeningId}`);
  revalidatePath("/");

  return { ok: true, data: { openingTitle: openingTitle as string, rescreening } };
}

/**
 * Turns the sentinels `reassign_application` raises into the sentences
 * the spec's §9 asks for. Postgres wraps the message, so this matches
 * rather than compares.
 */
function describeReassignFailure(message: string): string {
  if (message.includes("ZIPHYRE_ALREADY_APPLIED")) {
    return "This candidate already has an application on that opening. Ziphyre keeps one application per candidate per opening, so there is nothing to move them into.";
  }
  if (message.includes("ZIPHYRE_DIFFERENT_POSTING")) {
    return "That opening belongs to a different posting. Candidates can only be moved between openings on the posting they applied to.";
  }
  if (message.includes("ZIPHYRE_SAME_OPENING")) {
    return "This candidate is already on that opening.";
  }
  return "Couldn't move this candidate. Please try again.";
}

/**
 * FR-131. A per-opening booking link, overriding the organisation's.
 * Null means "use the organisation's" — the opening does not carry a
 * copy of it, so changing the default reaches every opening that never
 * set its own.
 */
export async function updateOpeningBookingUrl(input: {
  openingId: string;
  postingId: string;
  bookingUrl: string;
}): Promise<ActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Not signed in." };

  const trimmed = input.bookingUrl.trim();
  if (trimmed && !/^https?:\/\/\S+$/i.test(trimmed)) {
    return {
      ok: false,
      error: "That needs to be a full link starting with https://",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("opening")
    .update({ booking_url: trimmed || null })
    .eq("id", input.openingId);

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/postings/${input.postingId}/openings/${input.openingId}`);
  return { ok: true, data: undefined };
}
