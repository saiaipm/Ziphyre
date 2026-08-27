"use client";

import {
  EMPTY_STAGE_COUNTS,
  NeedsReviewCallout,
  StageFunnel,
  SummaryTile,
  type StageCounts,
} from "@/components/pipeline/stage-funnel";
import type { ApplicationListItem } from "@/lib/applications";
import { STAGE_TEXT } from "@/lib/stages";

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
}: {
  applications: ApplicationListItem[];
}) {
  const byStage: StageCounts = { ...EMPTY_STAGE_COUNTS };
  let needsReview = 0;

  for (const a of applications) {
    if (a.currentStage in byStage) byStage[a.currentStage] += 1;
    if (a.screeningStatus === "needs_manual_review") needsReview += 1;
  }

  const total = applications.length;
  if (total === 0) return null;

  return (
    <section className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryTile label="Applications" value={total} />
        <SummaryTile
          label="Shortlisted"
          value={byStage.shortlisted}
          accent={STAGE_TEXT.shortlisted}
        />
        {/* What Meera works from once a pile has been through once:
            everyone not yet held or rejected. */}
        <SummaryTile
          label="Still in play"
          value={total - byStage.rejected - byStage.on_hold}
        />
        <SummaryTile
          label="Needs review"
          value={needsReview}
          accent="text-fit-review"
        />
      </div>

      <StageFunnel byStage={byStage} total={total} />
      <NeedsReviewCallout count={needsReview} />
    </section>
  );
}
