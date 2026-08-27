import {
  NeedsReviewCallout,
  StageFunnel,
  SummaryTile,
} from "@/components/pipeline/stage-funnel";
import type { OverviewMetrics } from "@/lib/overview";

/**
 * FR-101 – FR-105. Counts only: no trend, no rate, no average. §4 puts
 * time-to-hire and funnel analytics out of scope, and this is the
 * screen where they would otherwise creep in.
 *
 * The funnel and the callout are shared with the posting and opening
 * summaries, so the same stage reads the same on all three.
 */
export function OverviewSummary({ metrics }: { metrics: OverviewMetrics }) {
  const { byStage, totalApplications, needsReview } = metrics;

  return (
    <section className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryTile label="Active postings" value={metrics.activePostings} />
        <SummaryTile label="Active openings" value={metrics.activeOpenings} />
        <SummaryTile label="Applications" value={totalApplications} />
        <SummaryTile
          label="Shortlisted"
          value={byStage.shortlisted}
          accent="text-fit-shortlisted"
        />
      </div>

      {totalApplications > 0 && (
        <StageFunnel byStage={byStage} total={totalApplications} />
      )}

      <NeedsReviewCallout count={needsReview} />
    </section>
  );
}
