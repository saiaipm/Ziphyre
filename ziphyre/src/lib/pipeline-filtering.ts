import type { ApplicationListItem } from "@/lib/applications";
import type { StageKey } from "@/lib/stages";

/**
 * The pipeline's filtering and sorting — FR-66 to FR-70, plus FR-68's
 * exclusion counting. Pure functions over an already-loaded array, with
 * no React and no runtime imports, so the rules can be reasoned about
 * (and exercised) without rendering anything.
 *
 * **Filtering runs in the browser, not the query.** Tech spec §9 says
 * server-side, and that is right at scale — but the whole list is
 * already loaded, and §15 puts the realistic ceiling at "several
 * hundred applications per opening". Filtering an array that size is
 * instant and needs no refetch, where a round trip per keystroke would
 * feel slower and be more code. Revisit if that ceiling stops holding.
 */

export const COMPONENTS = [
  { key: "jdFit", label: "JD Fit" },
  { key: "experience", label: "Experience" },
  { key: "skills", label: "Skills" },
  { key: "qualification", label: "Qualification" },
  { key: "location", label: "Location" },
] as const;

export type ComponentKey = (typeof COMPONENTS)[number]["key"];

/**
 * FR-70 lists "any component rating" as a sort, so the five are
 * generated rather than hand-listed — adding a sixth component would
 * otherwise mean remembering to add it here too.
 */
export type SortKey =
  | "score-desc"
  | "score-asc"
  | "date-desc"
  | "date-asc"
  | "name"
  | `component-${ComponentKey}`;

/**
 * The FR-21 fields a filter can read, and how each is matched.
 *
 * **Experience is the only numeric one.** Notice period and both CTC
 * fields are free text on the apply form — "2 months", "8 LPA",
 * "₹12,00,000", "Immediate" — so they are matched as text. Parsing them
 * into numbers to offer "CTC under 10 LPA" would mean guessing at a
 * dozen notations, and a wrong guess silently drops a candidate, which
 * is the exact failure FR-68 exists to prevent. Making those fields
 * structured on the apply form is the real fix; it is a form change,
 * not a filter change.
 */
export const TEXT_FIELDS = [
  { key: "currentLocation", label: "Location" },
  { key: "noticePeriod", label: "Notice period" },
  { key: "currentCtc", label: "Current CTC" },
  { key: "expectedCtc", label: "Expected CTC" },
] as const;

export type TextFieldKey = (typeof TEXT_FIELDS)[number]["key"];

export type Filters = {
  minOverall: string;
  componentKey: ComponentKey | "any";
  componentMin: string;
  mustHave: "any" | "met" | "unmet";
  /** FR-66. Meaningless before M4 — nothing could leave `screened`. */
  stage: StageKey | "any" | "open";
  status: "any" | "complete" | "review";
  /** FR-66's "date received", over `submittedAt`. */
  since: "any" | "7" | "30" | "custom";
  /** Inclusive `YYYY-MM-DD` bounds, used only when `since` is custom. */
  from: string;
  to: string;

  // FR-66's form-answer half.
  /** Which text field the `fieldValue` search applies to. */
  fieldKey: TextFieldKey | "any";
  fieldValue: string;
  /** Minimum total experience, in whole years. */
  minExperience: string;
  relocate: "any" | "Yes" | "No" | "Open to discussing";

  /**
   * FR-68. Off by default: a field filter hides candidates who never
   * answered that field, and hiding people silently is the thing FR-68
   * forbids. Turning this on brings them back rather than pretending
   * they matched.
   */
  includeMissing: boolean;

  sort: SortKey;
};

/** Local calendar date as `YYYY-MM-DD` — never `toISOString()`, which
 *  converts to UTC and lands on yesterday for anyone east of Greenwich,
 *  India included. */
export function isoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const DEFAULT_FILTERS: Filters = {
  minOverall: "any",
  componentKey: "any",
  componentMin: "5",
  mustHave: "any",
  stage: "any",
  status: "any",
  since: "any",
  // Empty here, and filled with today the moment "Exact dates" is
  // chosen. Calling `new Date()` at module scope would evaluate once on
  // the server and again in the browser, and those two can land on
  // different days across a timezone or midnight boundary — the kind of
  // hydration mismatch this codebase has already been bitten by once.
  from: "",
  to: "",
  fieldKey: "any",
  fieldValue: "",
  minExperience: "any",
  relocate: "any",
  includeMissing: false,
  sort: "score-desc",
};

export type FilterResult = {
  visible: ApplicationListItem[];
  /**
   * FR-68. How many were dropped purely for having no answer to a
   * field being filtered on — not for failing it. Zero unless a field
   * filter is active.
   */
  hiddenForMissing: number;
  /** The field labels responsible, for naming them in the UI. */
  missingFieldLabels: string[];
};

/**
 * Relocation answers are compared as a canonical token, not string
 * equality. The apply page constrains this to three options today, but
 * applications that arrived through the retired Google path carry
 * whatever the candidate typed — the demo's one legacy application says
 * "open to discussion" where the enum says "Open to discussing". Exact
 * matching would quietly drop it, and a filter that silently omits a
 * real candidate is worse than one that is slightly generous.
 *
 * Returns null for anything unrecognised, which is treated as "does not
 * match" rather than "not provided" — the candidate did answer, the
 * answer just is not one of these.
 */
function relocationToken(value: string): "yes" | "no" | "open" | null {
  const s = value.trim().toLowerCase();
  if (s.startsWith("open")) return "open";
  if (s === "yes") return "yes";
  if (s === "no") return "no";
  return null;
}

/** Total experience in whole years, or null when not provided. */
function experienceYears(a: ApplicationListItem): number | null {
  const years = a.answers.experienceYears;
  if (years === null) return null;
  const y = Number(years);
  if (Number.isNaN(y)) return null;
  const m = Number(a.answers.experienceMonths ?? 0);
  return y + (Number.isNaN(m) ? 0 : m / 12);
}

/** FR-67: every active filter narrows the result; they combine. */
export function applyFilters(
  items: ApplicationListItem[],
  f: Filters,
): FilterResult {
  let out = items;

  // ---- FR-66's form-answer half, and FR-68 ----------------------------
  //
  // Run first and tracked separately, because these are the only
  // filters where "no answer" is possible. A screening score is always
  // there or the application is unscreened; a notice period may simply
  // never have been asked, which is true of every manual upload.
  const missingLabels = new Set<string>();
  let hiddenForMissing = 0;

  const fieldTests: {
    label: string;
    value: (a: ApplicationListItem) => string | number | null;
    passes: (v: string | number) => boolean;
  }[] = [];

  if (f.fieldKey !== "any" && f.fieldValue.trim() !== "") {
    const key = f.fieldKey;
    const needle = f.fieldValue.trim().toLowerCase();
    fieldTests.push({
      label: TEXT_FIELDS.find((t) => t.key === key)!.label,
      value: (a) => a.answers[key],
      passes: (v) => String(v).toLowerCase().includes(needle),
    });
  }

  if (f.minExperience !== "any") {
    const min = Number(f.minExperience);
    fieldTests.push({
      label: "Work experience",
      value: experienceYears,
      passes: (v) => Number(v) >= min,
    });
  }

  if (f.relocate !== "any") {
    const want = relocationToken(f.relocate);
    fieldTests.push({
      label: "Willingness to relocate",
      value: (a) => a.answers.willingnessToRelocate,
      passes: (v) => relocationToken(String(v)) === want,
    });
  }

  if (fieldTests.length > 0) {
    out = out.filter((a) => {
      let missing = false;
      for (const test of fieldTests) {
        const value = test.value(a);
        if (value === null) {
          missing = true;
          missingLabels.add(test.label);
          continue;
        }
        if (!test.passes(value)) return false;
      }
      if (!missing) return true;
      // Counted whether or not they are shown, so the UI can say how
      // many are affected even while they are visible.
      hiddenForMissing += 1;
      return f.includeMissing;
    });
  }

  if (f.minOverall !== "any") {
    const min = Number(f.minOverall);
    out = out.filter((a) => (a.screening?.overall ?? -1) >= min);
  }

  if (f.componentKey !== "any") {
    const min = Number(f.componentMin);
    out = out.filter((a) => (a.screening?.[f.componentKey as ComponentKey] ?? -1) >= min);
  }

  if (f.mustHave !== "any") {
    out = out.filter((a) => {
      if (!a.screening) return false;
      return f.mustHave === "met"
        ? a.screening.meetsAllMustHaves
        : !a.screening.meetsAllMustHaves;
    });
  }

  // "Still in play" is the filter Meera actually reaches for once she
  // has been through a pile once: everyone she has not yet dispositioned.
  // Offering it saves selecting three stages to express one intent.
  if (f.stage === "open") {
    out = out.filter(
      (a) => a.currentStage !== "rejected" && a.currentStage !== "on_hold",
    );
  } else if (f.stage !== "any") {
    out = out.filter((a) => a.currentStage === f.stage);
  }

  if (f.status !== "any") {
    out = out.filter((a) =>
      f.status === "review"
        ? a.screeningStatus === "needs_manual_review"
        : a.screeningStatus === "complete",
    );
  }

  // FR-66's "date received" reads `submittedAt` — when the candidate
  // applied — falling back to `createdAt` only if it is somehow absent.
  if (f.since === "custom") {
    if (f.from) {
      const start = new Date(`${f.from}T00:00:00`).getTime();
      out = out.filter((a) => receivedAt(a) >= start);
    }
    if (f.to) {
      // End of the chosen day, not its midnight — otherwise picking the
      // same date for both ends matches nothing, which reads as a bug.
      const end = new Date(`${f.to}T23:59:59.999`).getTime();
      out = out.filter((a) => receivedAt(a) <= end);
    }
  } else if (f.since !== "any") {
    const cutoff = Date.now() - Number(f.since) * 86_400_000;
    out = out.filter((a) => receivedAt(a) >= cutoff);
  }

  return {
    visible: sortItems(out, f.sort),
    hiddenForMissing,
    missingFieldLabels: [...missingLabels],
  };
}

function receivedAt(a: ApplicationListItem): number {
  return new Date(a.submittedAt ?? a.createdAt).getTime();
}

function sortItems(items: ApplicationListItem[], sort: SortKey) {
  const copy = [...items];
  switch (sort) {
    case "score-asc":
      return copy.sort(
        (a, b) => (a.screening?.overall ?? 99) - (b.screening?.overall ?? 99),
      );
    // Sorted on the same field the date filter reads, so "Newest first"
    // and "Last 7 days" can never disagree about what newest means.
    case "date-desc":
      return copy.sort((a, b) => receivedAt(b) - receivedAt(a));
    case "date-asc":
      return copy.sort((a, b) => receivedAt(a) - receivedAt(b));
    case "name":
      return copy.sort((a, b) =>
        (a.candidateName ?? "").localeCompare(b.candidateName ?? ""),
      );
    // FR-70's "any component rating". Unscreened sort last here rather
    // than first: a component filter is a question about scores, and an
    // application with none cannot answer it.
    case "component-jdFit":
    case "component-experience":
    case "component-skills":
    case "component-qualification":
    case "component-location": {
      const key = sort.slice("component-".length) as ComponentKey;
      return copy.sort(
        (a, b) => (b.screening?.[key] ?? -1) - (a.screening?.[key] ?? -1),
      );
    }
    case "score-desc":
    default:
      // Unscreened first: an application with no score yet must not be
      // buried below everyone who has one (business rule §10).
      return copy.sort(
        (a, b) => (b.screening?.overall ?? 99) - (a.screening?.overall ?? 99),
      );
  }
}

