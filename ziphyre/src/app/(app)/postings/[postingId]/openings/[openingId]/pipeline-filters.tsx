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
import { STAGE_LABELS, STAGE_ORDER, type StageKey } from "@/lib/stages";
import { RELOCATION_OPTIONS } from "@/lib/apply/schema";
import {
  COMPONENTS,
  DEFAULT_FILTERS,
  TEXT_FIELDS,
  isoDate,
  type ComponentKey,
  type Filters,
  type SortKey,
} from "@/lib/pipeline-filtering";

/**
 * The filter bar. The rules it drives live in
 * `@/lib/pipeline-filtering` — this file is only the controls, the
 * chips (FR-69) and FR-68's disclosure line.
 */

const SCORE_STEPS = ["5", "6", "7", "8", "9"];

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
  if (f.fieldKey !== "any" && f.fieldValue.trim() !== "") {
    const label = TEXT_FIELDS.find((t) => t.key === f.fieldKey)?.label;
    chips.push({ key: "fieldValue", label: `${label}: “${f.fieldValue}”` });
  }
  if (f.minExperience !== "any")
    chips.push({
      key: "minExperience",
      label: `${f.minExperience}+ years experience`,
    });
  if (f.relocate !== "any")
    chips.push({ key: "relocate", label: `Relocate: ${f.relocate}` });
  return chips;
}

export function PipelineFilters({
  filters,
  onChange,
  shown,
  total,
  hiddenForMissing,
  missingFieldLabels,
}: {
  filters: Filters;
  onChange: (next: Filters) => void;
  shown: number;
  total: number;
  hiddenForMissing: number;
  missingFieldLabels: string[];
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

        <Picker
          value={filters.minExperience}
          onValueChange={(v) => set("minExperience", v)}
          placeholder="Any experience"
          width="w-[11rem]"
          options={[
            { value: "any", label: "Any experience" },
            ...["1", "2", "3", "5", "8", "10"].map((n) => ({
              value: n,
              label: `${n}+ years`,
            })),
          ]}
        />

        <Picker
          value={filters.relocate}
          onValueChange={(v) => set("relocate", v as Filters["relocate"])}
          placeholder="Relocation"
          width="w-[12rem]"
          options={[
            { value: "any", label: "Any relocation answer" },
            ...RELOCATION_OPTIONS.map((o) => ({
              value: o,
              label: `Relocate: ${o}`,
            })),
          ]}
        />

        {/* One search box against a chosen field, rather than four
            boxes. Notice period and CTC are free text on the apply
            form, so this matches text — see TEXT_FIELDS. */}
        <div className="flex items-center gap-1.5">
          <Picker
            value={filters.fieldKey}
            onValueChange={(v) => set("fieldKey", v as Filters["fieldKey"])}
            placeholder="Any field"
            width="w-[10rem]"
            options={[
              { value: "any", label: "Search a field…" },
              ...TEXT_FIELDS.map((t) => ({ value: t.key, label: t.label })),
            ]}
          />
          {filters.fieldKey !== "any" && (
            <Input
              value={filters.fieldValue}
              onChange={(e) => set("fieldValue", e.target.value)}
              placeholder={`e.g. ${
                filters.fieldKey === "currentLocation"
                  ? "Hyderabad"
                  : filters.fieldKey === "noticePeriod"
                    ? "30 days"
                    : "12 LPA"
              }`}
              className="h-8 w-[10rem] text-xs"
              aria-label={`Search ${
                TEXT_FIELDS.find((t) => t.key === filters.fieldKey)?.label
              }`}
            />
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Sort</span>
          <Picker
            value={filters.sort}
            onValueChange={(v) => set("sort", v as SortKey)}
            placeholder="Sort"
            width="w-[13rem]"
            options={[
              { value: "score-desc", label: "Highest score" },
              { value: "score-asc", label: "Lowest score" },
              { value: "date-desc", label: "Newest first" },
              { value: "date-asc", label: "Oldest first" },
              { value: "name", label: "Name (A–Z)" },
              // FR-70's "any component rating".
              ...COMPONENTS.map((c) => ({
                value: `component-${c.key}`,
                label: `Highest ${c.label}`,
              })),
            ]}
          />
        </div>
      </div>

      {/* FR-68. Excluding people for never having been asked a question
          is defensible; doing it silently is not. The count is shown
          whether or not they are currently hidden, so the number never
          disappears just because it was acted on. */}
      {hiddenForMissing > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
          <span className="text-muted-foreground">
            {hiddenForMissing}{" "}
            {hiddenForMissing === 1 ? "candidate has" : "candidates have"} no{" "}
            {missingFieldLabels.join(" or ").toLowerCase()} recorded
            {filters.includeMissing ? " — shown anyway." : " and are hidden."}
          </span>
          <button
            type="button"
            className="underline underline-offset-2 hover:text-foreground"
            onClick={() => set("includeMissing", !filters.includeMissing)}
          >
            {filters.includeMissing ? "Hide them" : "Show them"}
          </button>
        </div>
      )}

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
