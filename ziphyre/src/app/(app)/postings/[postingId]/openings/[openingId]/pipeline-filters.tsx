"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ApplicationListItem } from "@/lib/applications";
import { STAGE_LABELS, STAGE_ORDER, type StageKey } from "@/lib/stages";

/**
 * FR-66, FR-67, FR-69, FR-70 for the fields the pipeline list already
 * carries: overall score, each component rating, must-have result,
 * screening status and date received, plus sorting.
 *
 * **Filtering runs in the browser, not the query.** Tech spec §9 says
 * server-side, and that is right at scale — but the whole list is
 * already loaded into this component, and §15 puts the realistic
 * ceiling at "several hundred applications per opening". Filtering an
 * array that size is instant and needs no refetch, where a round trip
 * per keystroke would feel slower and be more code. Revisit if that
 * ceiling assumption ever stops holding.
 *
 * Still to build (the rest of FR-66, and FR-68): filters over form
 * answers — location, notice period, CTC, relocation, declared
 * experience — which need those answers plumbed into the list, and
 * carry FR-68's obligation to count and reveal the Not-provided
 * candidates a field filter excludes.
 */

export const COMPONENTS = [
  { key: "jdFit", label: "JD Fit" },
  { key: "experience", label: "Experience" },
  { key: "skills", label: "Skills" },
  { key: "qualification", label: "Qualification" },
  { key: "location", label: "Location" },
] as const;

export type ComponentKey = (typeof COMPONENTS)[number]["key"];

export type SortKey =
  | "score-desc"
  | "score-asc"
  | "date-desc"
  | "date-asc"
  | "name";

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
  sort: "score-desc",
};

const SCORE_STEPS = ["5", "6", "7", "8", "9"];

/** FR-67: every active filter narrows the result; they combine. */
export function applyFilters(
  items: ApplicationListItem[],
  f: Filters,
): ApplicationListItem[] {
  let out = items;

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

  return sortItems(out, f.sort);
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
    case "score-desc":
    default:
      // Unscreened first: an application with no score yet must not be
      // buried below everyone who has one (business rule §10).
      return copy.sort(
        (a, b) => (b.screening?.overall ?? 99) - (a.screening?.overall ?? 99),
      );
  }
}

/** FR-69: what is active must be visible, and clearable one at a time. */
function activeChips(f: Filters): { key: keyof Filters; label: string }[] {
  const chips: { key: keyof Filters; label: string }[] = [];
  if (f.minOverall !== "any")
    chips.push({ key: "minOverall", label: `Score ≥ ${f.minOverall}` });
  if (f.componentKey !== "any") {
    const label = COMPONENTS.find((c) => c.key === f.componentKey)?.label;
    chips.push({ key: "componentKey", label: `${label} ≥ ${f.componentMin}` });
  }
  if (f.mustHave !== "any")
    chips.push({
      key: "mustHave",
      label: f.mustHave === "met" ? "Meets all must-haves" : "Missing a must-have",
    });
  if (f.stage !== "any")
    chips.push({
      key: "stage",
      label:
        f.stage === "open"
          ? "Still in play"
          : STAGE_LABELS[f.stage as StageKey],
    });
  if (f.status !== "any")
    chips.push({
      key: "status",
      label: f.status === "review" ? "Needs manual review" : "Screened",
    });
  if (f.since === "custom") {
    chips.push({
      key: "since",
      label:
        f.from && f.to
          ? f.from === f.to
            ? `Received ${f.from}`
            : `Received ${f.from} → ${f.to}`
          : f.from
            ? `Received from ${f.from}`
            : `Received up to ${f.to}`,
    });
  } else if (f.since !== "any") {
    chips.push({ key: "since", label: `Last ${f.since} days` });
  }
  return chips;
}

export function PipelineFilters({
  filters,
  onChange,
  shown,
  total,
}: {
  filters: Filters;
  onChange: (next: Filters) => void;
  shown: number;
  total: number;
}) {
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    onChange({ ...filters, [key]: value });

  const chips = activeChips(filters);

  return (
    <div className="space-y-3 border-b border-divider pb-4">
      <div className="flex flex-wrap items-center gap-2">
        <Picker
          value={filters.minOverall}
          onValueChange={(v) => set("minOverall", v)}
          placeholder="Any score"
          width="w-[8.5rem]"
          options={[
            { value: "any", label: "Any score" },
            ...SCORE_STEPS.map((n) => ({ value: n, label: `Score ≥ ${n}` })),
          ]}
        />

        <Picker
          value={filters.componentKey}
          onValueChange={(v) => set("componentKey", v as ComponentKey | "any")}
          placeholder="Any component"
          width="w-[10rem]"
          options={[
            { value: "any", label: "Any component" },
            ...COMPONENTS.map((c) => ({ value: c.key, label: c.label })),
          ]}
        />

        {filters.componentKey !== "any" && (
          <Picker
            value={filters.componentMin}
            onValueChange={(v) => set("componentMin", v)}
            placeholder="≥ 5"
            width="w-[5.5rem]"
            options={SCORE_STEPS.map((n) => ({ value: n, label: `≥ ${n}` }))}
          />
        )}

        <Picker
          value={filters.mustHave}
          onValueChange={(v) => set("mustHave", v as Filters["mustHave"])}
          placeholder="Must-haves"
          width="w-[11rem]"
          options={[
            { value: "any", label: "Any must-have result" },
            { value: "met", label: "Meets all must-haves" },
            { value: "unmet", label: "Missing a must-have" },
          ]}
        />

        <Picker
          value={filters.stage}
          onValueChange={(v) => set("stage", v as Filters["stage"])}
          placeholder="Any stage"
          width="w-[10rem]"
          options={[
            { value: "any", label: "Any stage" },
            { value: "open", label: "Still in play" },
            ...STAGE_ORDER.map((s) => ({ value: s, label: STAGE_LABELS[s] })),
          ]}
        />

        <Picker
          value={filters.status}
          onValueChange={(v) => set("status", v as Filters["status"])}
          placeholder="Any status"
          width="w-[10rem]"
          options={[
            { value: "any", label: "Any status" },
            { value: "complete", label: "Screened" },
            { value: "review", label: "Needs review" },
          ]}
        />

        <Picker
          value={filters.since}
          onValueChange={(v) => {
            const since = v as Filters["since"];
            if (since !== "custom") {
              onChange({ ...filters, since });
              return;
            }
            // Initialised to today on the way in, so the range opens on
            // "applications received today" rather than on two blank
            // boxes the admin has to fill before anything happens.
            const today = isoDate(new Date());
            onChange({
              ...filters,
              since,
              from: filters.from || today,
              to: filters.to || today,
            });
          }}
          placeholder="Any time"
          width="w-[9.5rem]"
          options={[
            { value: "any", label: "Any time" },
            { value: "7", label: "Last 7 days" },
            { value: "30", label: "Last 30 days" },
            { value: "custom", label: "Exact dates" },
          ]}
        />

        {/* FR-66's date received, as an explicit range rather than only
            the relative buckets. Both bounds are optional: setting one
            leaves the other end open, which is what "everything since
            the ad went live" actually means. */}
        {filters.since === "custom" && (
          <div className="flex items-center gap-1.5">
            <label className="sr-only" htmlFor="received-from">
              Received from
            </label>
            <Input
              id="received-from"
              type="date"
              value={filters.from}
              max={filters.to || undefined}
              onChange={(e) => set("from", e.target.value)}
              className="h-8 w-[9.5rem] text-xs"
            />
            <span className="text-xs text-muted-foreground">to</span>
            <label className="sr-only" htmlFor="received-to">
              Received to
            </label>
            <Input
              id="received-to"
              type="date"
              value={filters.to}
              min={filters.from || undefined}
              onChange={(e) => set("to", e.target.value)}
              className="h-8 w-[9.5rem] text-xs"
            />
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Sort</span>
          <Picker
            value={filters.sort}
            onValueChange={(v) => set("sort", v as SortKey)}
            placeholder="Sort"
            width="w-[11rem]"
            options={[
              { value: "score-desc", label: "Highest score" },
              { value: "score-asc", label: "Lowest score" },
              { value: "date-desc", label: "Newest first" },
              { value: "date-asc", label: "Oldest first" },
              { value: "name", label: "Name (A–Z)" },
            ]}
          />
        </div>
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((chip) => (
            <Badge key={chip.key} variant="secondary" className="gap-1 pr-1">
              {chip.label}
              <button
                type="button"
                onClick={() => set(chip.key, DEFAULT_FILTERS[chip.key])}
                aria-label={`Remove filter: ${chip.label}`}
                className="rounded-full p-0.5 hover:bg-foreground/10"
              >
                <X className="size-3" aria-hidden />
              </button>
            </Badge>
          ))}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs text-muted-foreground"
            onClick={() => onChange({ ...DEFAULT_FILTERS, sort: filters.sort })}
          >
            Clear all
          </Button>
          <span className="ml-auto text-xs text-muted-foreground">
            Showing {shown} of {total}
          </span>
        </div>
      )}
    </div>
  );
}

function Picker({
  value,
  onValueChange,
  placeholder,
  options,
  width,
}: {
  value: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  options: { value: string; label: string }[];
  width: string;
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger size="sm" className={width}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
