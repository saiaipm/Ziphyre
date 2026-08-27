import { AlertTriangle } from "lucide-react";
import {
  STAGE_LABELS,
  STAGE_ORDER,
  type OverviewMetrics,
} from "@/lib/overview";
import { cn } from "@/lib/utils";

/**
 * FR-101 – FR-105. Counts only: no trend, no rate, no average. §4 puts
 * time-to-hire and funnel analytics out of scope, and this is the
 * screen where they would otherwise creep in.
 */
export function OverviewSummary({ metrics }: { metrics: OverviewMetrics }) {
  const { byStage, totalApplications, needsReview } = metrics;

  return (
    <section className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Active postings" value={metrics.activePostings} />
        <Tile label="Active openings" value={metrics.activeOpenings} />
        <Tile label="Applications" value={totalApplications} />
        <Tile
          label="Shortlisted"
          value={byStage.shortlisted}
          accent="text-fit-shortlisted"
        />
      </div>

      {totalApplications > 0 && (
        <div className="rounded-lg border border-border bg-card px-5 py-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="label-meta">Where everyone stands</h2>
            {/* FR-102, said out loud. If these ever disagree it is a bug,
                and the reader should be able to see that for themselves. */}
            <span className="text-xs text-muted-foreground">
              {totalApplications} in total
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
      )}

      {/* FR-103. Deliberately outside the funnel above: this is a
          screening status, not a stage, and each of these applications
          is already counted once at its own stage. It sits apart
          because it is also the only number that asks for action. */}
      {needsReview > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-fit-review-bg px-5 py-4 dark:border-amber-900/40">
          <AlertTriangle
            className="mt-0.5 size-4 shrink-0 text-fit-review"
            aria-hidden
          />
          <p className="text-sm text-amber-900 dark:text-amber-100">
            <span className="font-medium">
              {needsReview} {needsReview === 1 ? "application needs" : "applications need"}{" "}
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
      <p className={cn("text-2xl font-semibold tabular-nums", accent)}>{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
