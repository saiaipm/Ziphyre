import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getProviderChain } from "@/lib/provider-settings";
import type { ProviderId } from "@/lib/ai/providers";
import type { DispositionKey, StageKey } from "@/lib/stages";

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

export const FIELD_LABEL = FIELD_LABELS;

/**
 * The resolved value of every FR-21 field, `null` meaning **Not
 * provided** — which is a real answer, not a missing one. FR-68 turns
 * on being able to tell those apart, so this deliberately returns null
 * rather than the string "Not provided": a filter has to exclude and
 * count them, and it cannot do that if absence has been flattened into
 * text.
 *
 * Same precedence as `describeFormAnswers` (tech spec §2.4): override,
 * then the candidate's answer, then nothing.
 */
export type ResolvedAnswers = Record<FormFieldKey, string | null>;

export function resolveFormAnswers(
  formAnswers: Record<string, unknown>,
  adminOverrides: Record<string, unknown>,
): ResolvedAnswers {
  const out = {} as ResolvedAnswers;
  for (const key of FORM_FIELD_KEYS) {
    const value = adminOverrides[key] ?? formAnswers[key];
    out[key] =
      value === undefined || value === null || value === ""
        ? null
        : String(value);
  }
  return out;
}

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
  currentStage: StageKey;
  screeningStatus: string;
  screeningFailureReason: string | null;
  cvOriginalFilename: string | null;
  createdAt: string;
  /**
   * When the candidate actually applied (FR-53's "date received"), as
   * distinct from when the row was written. The apply page sets it at
   * submission and manual upload sets it at upload, so it is present on
   * every application — filters use this rather than `createdAt`, which
   * is a database fact rather than a fact about the candidate.
   */
  submittedAt: string | null;
  /** FR-53's "key form fields", and what FR-66's field filters read. */
  answers: ResolvedAnswers;
  /** FR-71: the export needs the candidate's real email, not the
   *  placeholder a manual upload was given. Null when it is one. */
  candidateEmail: string | null;
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
       cv_original_filename, created_at, submitted_at,
       form_answers, admin_overrides,
       candidate:candidate_id (full_name, email),
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
      email: string | null;
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
      currentStage: row.current_stage as StageKey,
      screeningStatus: row.screening_status,
      screeningFailureReason: row.screening_failure_reason,
      cvOriginalFilename: row.cv_original_filename,
      createdAt: row.created_at,
      submittedAt: row.submitted_at ?? null,
      answers: resolveFormAnswers(
        (row.form_answers as Record<string, unknown>) ?? {},
        (row.admin_overrides as Record<string, unknown>) ?? {},
      ),
      // Manual upload mints `manual+<uuid>@ziphyre.internal` because
      // `candidate.email` is not-null unique. That is plumbing, not a
      // way to reach anyone, so it never leaves the server as an email.
      candidateEmail:
        candidate?.email && !candidate.email.endsWith("@ziphyre.internal")
          ? candidate.email
          : null,
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

// ---------------------------------------------------------------------------
// Stage history — FR-59
// ---------------------------------------------------------------------------

export type StageEvent = {
  id: string;
  fromStage: StageKey | null;
  toStage: StageKey;
  actorKind: "admin" | "system";
  /** Null for a system event, and for an admin whose account is gone. */
  actorName: string | null;
  disposition: DispositionKey | null;
  note: string | null;
  createdAt: string;
};

/**
 * FR-59: every stage change, who made it and when, oldest first so it
 * reads as a story rather than a stack.
 *
 * `stage_event` is select-only under RLS (tech spec §3), so this is a
 * plain read through the user's own client — the organisation scoping
 * is the policy's job, not a filter written here that could be
 * forgotten.
 */
export async function getStageHistory(
  applicationId: string,
): Promise<StageEvent[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("stage_event")
    .select(
      `id, from_stage, to_stage, actor_kind, disposition, note, created_at,
       actor:actor_id (display_name, email)`,
    )
    .eq("application_id", applicationId)
    .order("created_at", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => {
    const actor = row.actor as unknown as {
      display_name: string | null;
      email: string;
    } | null;
    return {
      id: row.id,
      fromStage: (row.from_stage as StageKey | null) ?? null,
      toStage: row.to_stage as StageKey,
      actorKind: row.actor_kind as "admin" | "system",
      actorName: actor ? (actor.display_name ?? actor.email) : null,
      disposition: (row.disposition as DispositionKey | null) ?? null,
      note: row.note,
      createdAt: row.created_at,
    };
  });
}

// ---------------------------------------------------------------------------
// Reassignment targets — FR-60
// ---------------------------------------------------------------------------

export type ReassignTarget = {
  id: string;
  title: string;
  workLocation: string;
  /** True when this candidate already has an application here (§9). */
  alreadyApplied: boolean;
};

/**
 * The other openings on the same posting, each marked with whether this
 * candidate is already on it. Tech spec §9 requires the collision to be
 * explained rather than hit as a constraint error — showing it before
 * the click is the better half of that; `reassign_application` still
 * refuses it authoritatively, because this list can go stale.
 */
export async function getReassignTargets(
  applicationId: string,
): Promise<ReassignTarget[]> {
  const supabase = await createClient();

  const { data: application, error } = await supabase
    .from("application")
    .select("candidate_id, opening_id, opening:opening_id (posting_id)")
    .eq("id", applicationId)
    .maybeSingle();
  if (error) throw error;
  if (!application) return [];

  const postingId = (application.opening as unknown as { posting_id: string })
    .posting_id;

  const { data: openings } = await supabase
    .from("opening")
    .select("id, title, work_location")
    .eq("posting_id", postingId)
    .neq("id", application.opening_id)
    .order("created_at", { ascending: true });

  if (!openings || openings.length === 0) return [];

  const { data: existing } = await supabase
    .from("application")
    .select("opening_id")
    .eq("candidate_id", application.candidate_id)
    .in(
      "opening_id",
      openings.map((o) => o.id),
    );

  const taken = new Set((existing ?? []).map((a) => a.opening_id));

  return openings.map((o) => ({
    id: o.id,
    title: o.title,
    workLocation: o.work_location,
    alreadyApplied: taken.has(o.id),
  }));
}
