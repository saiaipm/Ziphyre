/**
 * The stage and disposition vocabulary — FR-54, FR-58.
 *
 * Deliberately **not** `server-only`. It started out in `overview.ts`,
 * which is, and M4 needs the same labels inside client components (the
 * batch bar, the stage dialog, the history list). Two hand-kept copies
 * of a five-item list is exactly how a funnel and a pipeline end up
 * disagreeing about what a stage is called.
 */

export type StageKey =
  | "new"
  | "screened"
  | "shortlisted"
  | "on_hold"
  | "rejected";

export const STAGE_ORDER: StageKey[] = [
  "new",
  "screened",
  "shortlisted",
  "on_hold",
  "rejected",
];

export const STAGE_LABELS: Record<StageKey, string> = {
  new: "New",
  screened: "Screened",
  shortlisted: "Shortlisted",
  on_hold: "On hold",
  rejected: "Rejected",
};

/**
 * The stages an admin can move an application *to* (FR-56). `new` is
 * absent on purpose: it is where an application starts and what FR-47
 * holds an unscreenable one at, never somewhere a person sends one.
 * `screened` is here because §9 permits moving back — undoing a
 * rejection has to land somewhere.
 */
export const ADMIN_TARGET_STAGES: StageKey[] = [
  "shortlisted",
  "on_hold",
  "rejected",
  "screened",
];

/** FR-57: disposition applies to these two stages only. */
export function stageTakesDisposition(stage: StageKey): boolean {
  return stage === "on_hold" || stage === "rejected";
}

export type DispositionKey =
  | "must_haves"
  | "experience"
  | "location"
  | "ctc"
  | "better_candidates"
  | "other";

/** FR-58's list, in the order the functional spec gives it. */
export const DISPOSITIONS: { key: DispositionKey; label: string }[] = [
  { key: "must_haves", label: "Doesn't meet must-haves" },
  { key: "experience", label: "Experience mismatch" },
  { key: "location", label: "Location" },
  { key: "ctc", label: "CTC expectation" },
  { key: "better_candidates", label: "Better candidates available" },
  { key: "other", label: "Other" },
];

export const DISPOSITION_LABELS: Record<DispositionKey, string> =
  Object.fromEntries(DISPOSITIONS.map((d) => [d.key, d.label])) as Record<
    DispositionKey,
    string
  >;

/** The verb, not the noun — what the button says (functional spec §copy). */
export const STAGE_ACTION_LABELS: Record<StageKey, string> = {
  new: "Move to New",
  screened: "Move back to Screened",
  shortlisted: "Shortlist",
  on_hold: "Put on hold",
  rejected: "Reject",
};
