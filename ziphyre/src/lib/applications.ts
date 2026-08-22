import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getProviderChain } from "@/lib/provider-settings";
import type { ProviderId } from "@/lib/ai/providers";

/** FR-21's fixed field set, minus identity (name/email, which live on `candidate`). */
export const FORM_FIELD_KEYS = [
  "currentLocation",
  "willingnessToRelocate",
  "experienceYears",
  "experienceMonths",
  "noticePeriod",
  "currentCtc",
  "expectedCtc",
] as const;

export type FormFieldKey = (typeof FORM_FIELD_KEYS)[number];

const FIELD_LABELS: Record<FormFieldKey, string> = {
  currentLocation: "Current location",
  willingnessToRelocate: "Willingness to relocate",
  experienceYears: "Work experience (years)",
  experienceMonths: "Work experience (months)",
  noticePeriod: "Notice period",
  currentCtc: "Current CTC",
  expectedCtc: "Expected CTC",
};

/**
 * Tech spec §2.4: override, then form answer, then "Not provided" — a
 * hand-filled value never overwrites what the candidate submitted, and
 * a key absent from `form_answers` (manual upload) reads as Not
 * provided rather than blank.
 */
export function describeFormAnswers(
  formAnswers: Record<string, unknown>,
  adminOverrides: Record<string, unknown>,
): string {
  return FORM_FIELD_KEYS.map((key) => {
    const value = adminOverrides[key] ?? formAnswers[key];
    const display =
      value === undefined || value === null || value === ""
        ? "Not provided"
        : String(value);
    return `${FIELD_LABELS[key]}: ${display}`;
  }).join("\n");
}

export type ApplicationListItem = {
  id: string;
  candidateName: string | null;
  currentStage: string;
  screeningStatus: string;
  screeningFailureReason: string | null;
  cvOriginalFilename: string | null;
  createdAt: string;
  screening: {
    overall: number;
    jdFit: number;
    experience: number;
    skills: number;
    qualification: number;
    location: number;
    meetsAllMustHaves: boolean;
    mustHaveResult: { requirementId: string; met: boolean; note: string }[];
    strengths: string;
    gaps: string;
    overallRead: string;
    experienceDiscrepancy: string | null;
    provider: ProviderId;
    model: string;
    jdVersionId: string;
    usedFallback: boolean;
  } | null;
};

/**
 * Ordered overall-score-desc with unscreened above scored (the spec's
 * stated pipeline default, §10) — fixed, not a user-facing sort
 * control; that's FR-70/M5.
 */
export async function getApplicationsForOpening(
  openingId: string,
): Promise<ApplicationListItem[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("application")
    .select(
      `id, current_stage, screening_status, screening_failure_reason,
       cv_original_filename, created_at,
       candidate:candidate_id (full_name),
       screening:current_screening_id (
         overall, jd_fit, experience, skills, qualification, location,
         meets_all_must_haves, must_have_result, strengths, gaps,
         overall_read, experience_discrepancy, provider, model, jd_version_id
       )`,
    )
    .eq("opening_id", openingId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  if (!data) return [];

  const chain = await getProviderChain();
  const primaryProvider = chain[0]?.provider;

  const items: ApplicationListItem[] = data.map((row) => {
    const candidate = row.candidate as unknown as {
      full_name: string | null;
    } | null;
    const s = row.screening as unknown as {
      overall: number;
      jd_fit: number;
      experience: number;
      skills: number;
      qualification: number;
      location: number;
      meets_all_must_haves: boolean;
      must_have_result: { requirementId: string; met: boolean; note: string }[];
      strengths: string;
      gaps: string;
      overall_read: string;
      experience_discrepancy: string | null;
      provider: ProviderId;
      model: string;
      jd_version_id: string;
    } | null;

    return {
      id: row.id,
      candidateName: candidate?.full_name ?? null,
      currentStage: row.current_stage,
      screeningStatus: row.screening_status,
      screeningFailureReason: row.screening_failure_reason,
      cvOriginalFilename: row.cv_original_filename,
      createdAt: row.created_at,
      screening: s
        ? {
            overall: s.overall,
            jdFit: s.jd_fit,
            experience: s.experience,
            skills: s.skills,
            qualification: s.qualification,
            location: s.location,
            meetsAllMustHaves: s.meets_all_must_haves,
            mustHaveResult: s.must_have_result,
            strengths: s.strengths,
            gaps: s.gaps,
            overallRead: s.overall_read,
            experienceDiscrepancy: s.experience_discrepancy,
            provider: s.provider,
            model: s.model,
            jdVersionId: s.jd_version_id,
            usedFallback: Boolean(primaryProvider) && s.provider !== primaryProvider,
          }
        : null,
    };
  });

  items.sort((a, b) => {
    const aScore = a.screening?.overall ?? Infinity;
    const bScore = b.screening?.overall ?? Infinity;
    if (aScore === bScore) return 0;
    return bScore - aScore;
  });

  return items;
}
