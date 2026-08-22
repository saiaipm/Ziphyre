import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractCvText } from "@/lib/cv/extract-text";
import { describeFormAnswers } from "@/lib/applications";
import { getProviderChainForOrg } from "@/lib/provider-settings";
import { runWithFallback } from "@/lib/ai/run-with-fallback";
import {
  screenApplication,
  PROMPT_VERSION,
  type RequirementInput,
} from "@/lib/ai/screen-application";
import type { ScreenApplicationPayload } from "@/lib/jobs/types";

/**
 * Tech spec §6.1's 8 steps. Every query filters `organization_id`
 * explicitly — background jobs bypass RLS, so this is the only
 * tenant-isolation check that exists here (tech spec §3).
 *
 * Throws on transient failure (provider chain exhausted, invalid
 * output) so the job runner retries with backoff. The one case that
 * does NOT throw is an unreadable CV (FR-47) — that's a handled,
 * terminal outcome, not a job failure: retrying won't make a scanned
 * PDF readable.
 */
export async function runScreenApplication(
  organizationId: string,
  payload: ScreenApplicationPayload,
): Promise<void> {
  const admin = createAdminClient();
  const { applicationId } = payload;

  const { data: application, error: appError } = await admin
    .from("application")
    .select(
      "id, opening_id, cv_storage_path, cv_mime, form_answers, admin_overrides",
    )
    .eq("id", applicationId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (appError) throw appError;
  if (!application) throw new Error(`application ${applicationId} not found`);
  if (!application.cv_storage_path || !application.cv_mime) {
    throw new Error(`application ${applicationId} has no CV on file`);
  }

  await admin
    .from("application")
    .update({ screening_status: "in_progress" })
    .eq("id", applicationId)
    .eq("organization_id", organizationId);

  const { data: opening, error: openingError } = await admin
    .from("opening")
    .select("current_jd_version_id")
    .eq("id", application.opening_id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (openingError) throw openingError;
  if (!opening?.current_jd_version_id) {
    throw new Error(`opening ${application.opening_id} has no job description`);
  }

  const { data: jdVersion, error: jdError } = await admin
    .from("jd_version")
    .select("id, content")
    .eq("id", opening.current_jd_version_id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (jdError) throw jdError;
  if (!jdVersion) throw new Error("job description version not found");

  const { data: requirementRows, error: reqError } = await admin
    .from("requirement")
    .select("id, text, kind")
    .eq("opening_id", application.opening_id)
    .eq("organization_id", organizationId);
  if (reqError) throw reqError;
  const requirements: RequirementInput[] = (requirementRows ?? []).map((r) => ({
    id: r.id,
    text: r.text,
    kind: r.kind as "must_have" | "preferred",
  }));

  const { data: cvBlob, error: downloadError } = await admin.storage
    .from("cvs")
    .download(application.cv_storage_path);
  if (downloadError) throw downloadError;
  const cvBytes = Buffer.from(await cvBlob.arrayBuffer());

  const extraction = await extractCvText(cvBytes, application.cv_mime);
  if (!extraction.ok) {
    await admin
      .from("application")
      .update({
        screening_status: "needs_manual_review",
        screening_failure_reason: extraction.reason,
      })
      .eq("id", applicationId)
      .eq("organization_id", organizationId);
    return;
  }

  const formAnswersSummary = describeFormAnswers(
    (application.form_answers as Record<string, unknown>) ?? {},
    (application.admin_overrides as Record<string, unknown>) ?? {},
  );

  const chain = await getProviderChainForOrg(organizationId);
  if (chain.length === 0) {
    await admin
      .from("application")
      .update({
        screening_status: "needs_manual_review",
        screening_failure_reason:
          "No AI provider is configured. Add one in Settings → Screening.",
      })
      .eq("id", applicationId)
      .eq("organization_id", organizationId);
    return;
  }

  const result = await runWithFallback(chain, (provider) =>
    screenApplication(
      {
        jdContent: jdVersion.content,
        requirements,
        formAnswersSummary,
        cvText: extraction.text,
      },
      provider,
    ),
  );

  if (!result.ok) {
    // Transient — retry. If attempts run out, the runner flags this
    // application needs_manual_review itself (tech spec §7's terminal
    // failure rule for this job kind).
    throw new Error(
      result.attempts.map((a) => `${a.provider}: ${a.error}`).join("; "),
    );
  }

  const { components, mustHaves, strengths, gaps, overallRead, experienceDiscrepancy } =
    result.data;
  const overall =
    Math.round(
      ((components.jdFit +
        components.experience +
        components.skills +
        components.qualification +
        components.location) /
        5) *
        10,
    ) / 10;
  const meetsAllMustHaves = mustHaves.every((m) => m.met);

  const { error: rpcError } = await admin.rpc("record_screening", {
    p_application_id: applicationId,
    p_jd_version_id: jdVersion.id,
    p_prompt_version: PROMPT_VERSION,
    p_provider: result.usedProvider,
    p_model: result.usedModel,
    p_jd_fit: components.jdFit,
    p_experience: components.experience,
    p_skills: components.skills,
    p_qualification: components.qualification,
    p_location: components.location,
    p_overall: overall,
    p_must_have_result: mustHaves,
    p_meets_all_must_haves: meetsAllMustHaves,
    p_strengths: strengths,
    p_gaps: gaps,
    p_overall_read: overallRead,
    p_experience_discrepancy: experienceDiscrepancy,
  });
  if (rpcError) throw rpcError;
}

/** Terminal-failure fallback for this job kind — tech spec §7. */
export async function markScreeningNeedsManualReview(
  organizationId: string,
  applicationId: string,
  reason: string,
): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("application")
    .update({ screening_status: "needs_manual_review", screening_failure_reason: reason })
    .eq("id", applicationId)
    .eq("organization_id", organizationId);
}
