"use client";

import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { STAGE_LABELS, STAGE_ORDER, type StageKey } from "@/lib/stages";
import type { ApplicationListItem } from "@/lib/applications";

/**
 * The per-opening mirror of the home screen's summary (FR-101 – FR-105),
 * under the same two rules that keep those numbers honest:
 *
 * - **The funnel sums to the total** (FR-102). It is derived from the
 *   very array the table below renders, not fetched separately, so the
 *   summary and the list cannot drift apart — and it re-counts the
 *   moment a stage changes, without a page load.
 * - **Needs review sits outside the funnel** (FR-103). It is a screening
 *   status, not a stage; every application counted there is already
 *   counted once at whatever stage it sits in, and adding it as a sixth
 *   step would double-count and break the arithmetic.
 *
 * Counts only — no averages, no rates, no time-to-anything. §4 puts
 * those out of scope, and a per-role screen is exactly where they would
 * otherwise creep in.
 */
export function OpeningSummary({
  applications,
}: {
  applications: ApplicationListItem[];
}) {
  const byStage: Record<StageKey, number> = {
    new: 0,
    screened: 0,
    shortlisted: 0,
    on_hold: 0,
    rejected: 0,
  };
  let needsReview = 0;

  for (const a of applications) {
    if (a.currentStage in byStage) byStage[a.currentStage] += 1;
    if (a.screeningStatus === "needs_manual_review") needsReview += 1;
  }

  const total = applications.length;
  const stillInPlay = total - byStage.rejected - byStage.on_hold;

  if (total === 0) return null;

  return (
    <section className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Applications" value={total} />
        <Tile
          label="Shortlisted"
          value={byStage.shortlisted}
          accent="text-fit-shortlisted"
        />
        {/* The number Meera actually works from once a pile has been
            through once: everyone not yet held or rejected. */}
        <Tile label="Still in play" value={stillInPlay} />
        <Tile
          label="Needs review"
          value={needsReview}
          accent={needsReview > 0 ? "text-fit-review" : undefined}
        />
      </div>

      <div className="rounded-lg border border-border bg-card px-5 py-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="label-meta">Candidate status</h2>
          <span className="text-xs text-muted-foreground">
            {total} in total
          </span>
        </div>

        <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-5">
          {STAGE_ORDER.map((stage) => (
            <li key={stage} className="flex items-baseline gap-2">
              <span className="text-lg font-semibold tabular-nums">
                {byStage[stage]}
              </span>
              <span className="text-xs text-muted-foreground">
                {STAGE_LABELS[stage]}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {needsReview > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-fit-review-bg px-5 py-4 dark:border-amber-900/40">
          <AlertTriangle
            className="mt-0.5 size-4 shrink-0 text-fit-review"
            aria-hidden
          />
          <p className="text-sm text-amber-900 dark:text-amber-100">
            <span className="font-medium">
              {needsReview}{" "}
              {needsReview === 1 ? "application needs" : "applications need"}{" "}
              manual review.
            </span>{" "}
            Their CVs couldn&rsquo;t be screened, so they carry no score and
            won&rsquo;t appear in a ranked list. They&rsquo;re counted in their
            stage above.
          </p>
        </div>
      )}
    </section>
  );
}

function Tile({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <p className={cn("text-2xl font-semibold tabular-nums", accent)}>
        {value}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
