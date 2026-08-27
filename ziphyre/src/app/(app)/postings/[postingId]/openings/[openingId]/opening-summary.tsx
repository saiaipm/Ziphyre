"use client";

import {
  EMPTY_STAGE_COUNTS,
  NeedsReviewCallout,
  StageFunnel,
  SummaryTile,
  type StageCounts,
} from "@/components/pipeline/stage-funnel";
import type { ApplicationListItem } from "@/lib/applications";
import { STAGE_ORDER, STAGE_TEXT, type StageKey } from "@/lib/stages";
import { DEFAULT_FILTERS, type Filters } from "@/lib/pipeline-filtering";

/**
 * The per-opening mirror of the home and posting summaries, using the
 * same funnel component so the three cannot drift apart.
 *
 * Derived from the very array the table below renders, not fetched
 * separately — so it re-counts the moment a stage changes, without a
 * page load, and the summary and the list cannot disagree.
 */
export function OpeningSummary({
  applications,
  filters,
  onFilterChange,
}: {
  applications: ApplicationListItem[];
  filters: Filters;
  onFilterChange: (next: Filters) => void;
}) {
  const byStage: StageCounts = { ...EMPTY_STAGE_COUNTS };
  let needsReview = 0;

  for (const a of applications) {
    if (a.currentStage in byStage) byStage[a.currentStage] += 1;
    if (a.screeningStatus === "needs_manual_review") needsReview += 1;
  }

  const total = applications.length;
  if (total === 0) return null;

  /**
   * Each tile filters the list to exactly what it counts, and clicking
   * an active tile clears it — a filter you can turn on but not off
   * from the same control is a trap. The sort is preserved throughout:
   * narrowing the list is not a reason to reorder it.
   *
   * Only the tiles that *are* a filter are clickable. "Applications" is
   * the total, so it clears instead.
   */
  const apply = (patch: Partial<Filters>, isActive: boolean) => () =>
    onFilterChange(
      isActive
        ? { ...DEFAULT_FILTERS, sort: filters.sort }
        : { ...DEFAULT_FILTERS, sort: filters.sort, ...patch },
    );

  const showingAll =
    filters.stage === "any" &&
    filters.status === "any" &&
    filters.minOverall === "any";
  const onShortlisted = filters.stage === "shortlisted";
  const onInPlay = filters.stage === "open";
  const onReview = filters.status === "review";

  return (
    <section className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryTile
          label="Applications"
          value={total}
          onClick={apply({}, false)}
          active={showingAll}
        />
        <SummaryTile
          label="Shortlisted"
          value={byStage.shortlisted}
          accent={STAGE_TEXT.shortlisted}
          onClick={apply({ stage: "shortlisted" }, onShortlisted)}
          active={onShortlisted}
        />
        {/* What Meera works from once a pile has been through once:
            everyone not yet held or rejected. */}
        <SummaryTile
          label="Still in play"
          value={total - byStage.rejected - byStage.on_hold}
          outOf={total}
          onClick={apply({ stage: "open" }, onInPlay)}
          active={onInPlay}
        />
        <SummaryTile
          label="Needs review"
          value={needsReview}
          accent="text-fit-review"
          onClick={apply({ status: "review" }, onReview)}
          active={onReview}
        />
      </div>

      {/* The funnel filters too, on the same toggle rule as the tiles
          above: clicking the stage you are already on clears it. A
          stage nobody is at is disabled — "0 Rejected" is an answer,
          not a link to an empty list. */}
      <StageFunnel
        byStage={byStage}
        total={total}
        activeStage={
          STAGE_ORDER.includes(filters.stage as StageKey)
            ? (filters.stage as StageKey)
            : null
        }
        onStageClick={(stage) =>
          apply({ stage }, filters.stage === stage)()
        }
      />
      <NeedsReviewCallout count={needsReview} />
    </section>
  );
}
