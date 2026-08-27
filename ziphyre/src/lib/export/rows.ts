import "server-only";
import {
  FORM_FIELD_KEYS,
  type ApplicationListItem,
} from "@/lib/applications";
import {
  DISPOSITION_LABELS,
  STAGE_LABELS,
  type DispositionKey,
  type StageKey,
} from "@/lib/stages";

/**
 * The spreadsheet is read by people, not by the database. Stage,
 * disposition and screening status are all stored as keys, and a
 * column reading `must_haves` or `complete` puts the reader in the
 * position of decoding the schema.
 */
const SCREENING_STATUS_LABELS: Record<string, string> = {
  pending: "Not screened yet",
  in_progress: "Screening",
  complete: "Screened",
  needs_manual_review: "Needs manual review",
};

/**
 * The shape every export shares — FR-71's column list, built once so
 * the spreadsheet and the document cannot disagree about what a
 * candidate's row says.
 */

/**
 * FR-75. Carried by every export, in the file itself rather than only
 * in the filename: a filename is the first thing lost when a file is
 * forwarded, and this marker exists precisely for the moment the file
 * is outside Ziphyre.
 */
export function exportMarker(exportedBy: string, when = new Date()): string {
  const date = when.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  return `Ziphyre — internal use only. Contains personal data. Exported ${date} by ${exportedBy}.`;
}

const FIELD_HEADERS: Record<(typeof FORM_FIELD_KEYS)[number], string> = {
  currentLocation: "Current location",
  willingnessToRelocate: "Willing to relocate",
  experienceYears: "Experience (years)",
  experienceMonths: "Experience (months)",
  noticePeriod: "Notice period",
  currentCtc: "Current CTC",
  expectedCtc: "Expected CTC",
};

export const EXPORT_HEADERS = [
  "Candidate",
  "Email",
  "CV file",
  ...FORM_FIELD_KEYS.map((k) => FIELD_HEADERS[k]),
  "JD Fit",
  "Experience",
  "Skills",
  "Qualification",
  "Location",
  "Overall",
  "Must-haves met",
  "Meets all must-haves",
  "Stage",
  "Disposition",
  "Screening status",
  "Date received",
] as const;

export type ExportRow = (string | number | null)[];

/**
 * `null` for a value the product genuinely does not have, rather than
 * an empty string — a spreadsheet cell that is blank because nobody
 * asked reads the same as one that is blank because the answer was
 * nothing, and FR-68 spent a whole requirement on that distinction.
 */
export function toExportRow(
  a: ApplicationListItem,
  disposition: string | null,
): ExportRow {
  const s = a.screening;
  const mustHaveMet = s ? s.mustHaveResult.filter((m) => m.met).length : null;
  const mustHaveTotal = s ? s.mustHaveResult.length : null;

  return [
    a.candidateName,
    // Placeholder addresses never leave the server (see
    // `candidateEmail`); an export that looked like a mailing list
    // would be worse than one that admits it has no address.
    a.candidateEmail,
    a.cvOriginalFilename,
    ...FORM_FIELD_KEYS.map((k) => a.answers[k]),
    s?.jdFit ?? null,
    s?.experience ?? null,
    s?.skills ?? null,
    s?.qualification ?? null,
    s?.location ?? null,
    s?.overall ?? null,
    mustHaveTotal === null ? null : `${mustHaveMet}/${mustHaveTotal}`,
    s ? (s.meetsAllMustHaves ? "Yes" : "No") : null,
    STAGE_LABELS[a.currentStage as StageKey] ?? a.currentStage,
    disposition
      ? (DISPOSITION_LABELS[disposition as DispositionKey] ?? disposition)
      : null,
    a.screeningStatus === "needs_manual_review"
      ? `Needs manual review — ${a.screeningFailureReason ?? ""}`.trim()
      : (SCREENING_STATUS_LABELS[a.screeningStatus] ?? a.screeningStatus),
    (a.submittedAt ?? a.createdAt).slice(0, 10),
  ];
}
