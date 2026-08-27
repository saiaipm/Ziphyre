import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  STAGE_LABELS,
  STAGE_ORDER,
  STAGE_TEXT,
  type StageKey,
} from "@/lib/stages";

export type StageCounts = Record<StageKey, number>;

export const EMPTY_STAGE_COUNTS: StageCounts = {
  new: 0,
  screened: 0,
  shortlisted: 0,
  on_hold: 0,
  rejected: 0,
};

/**
 * The five-stage funnel, rendered identically wherever it appears —
 * organisation, posting, opening. One component rather than three
 * copies, because FR-102's promise is that these numbers reconcile, and
 * three hand-maintained versions is how a "0 On hold" ends up meaning
 * something different on one screen than another.
 *
 * Counts only. §4 puts trend, rate and time-to-anything out of scope.
 */
export function StageFunnel({
  byStage,
  total,
}: {
  byStage: StageCounts;
  total: number;
}) {
  return (
    <div className="rounded-lg border border-border bg-card px-5 py-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="label-meta">Candidate status</h2>
        {/* FR-102, said out loud. If these ever disagree it is a bug,
            and the reader should be able to see that for themselves. */}
        <span className="text-xs text-muted-foreground">{total} in total</span>
      </div>

      <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-5">
        {STAGE_ORDER.map((stage) => (
          <li key={stage} className="flex items-baseline gap-2">
            <span
              className={cn(
                "text-lg font-semibold tabular-nums",
                // A zero stays grey whatever the stage. Painting "0
                // Rejected" red would draw the eye to the one number on
                // the row that says nothing happened.
                byStage[stage] === 0
                  ? "text-muted-foreground"
                  : STAGE_TEXT[stage],
              )}
            >
              {byStage[stage]}
            </span>
            <span className="text-xs text-muted-foreground">
              {STAGE_LABELS[stage]}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * FR-103. Deliberately outside the funnel: this is a screening status,
 * not a stage, and each of these applications is already counted once
 * at whatever stage it sits in. Adding it as a sixth step would
 * double-count and break the arithmetic above.
 */
export function NeedsReviewCallout({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-fit-review-bg px-5 py-4 dark:border-amber-900/40">
      <AlertTriangle
        className="mt-0.5 size-4 shrink-0 text-fit-review"
        aria-hidden
      />
      <p className="text-sm text-amber-900 dark:text-amber-100">
        <span className="font-medium">
          {count} {count === 1 ? "application needs" : "applications need"}{" "}
          manual review.
        </span>{" "}
        Their CVs couldn&rsquo;t be screened, so they carry no score and
        won&rsquo;t appear in a ranked list. They&rsquo;re counted in their
        stage above.
      </p>
    </div>
  );
}

/** The tile used across all three summaries. */
export function SummaryTile({
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
      <p
        className={cn(
          "text-2xl font-semibold tabular-nums",
          value === 0 ? undefined : accent,
        )}
      >
        {value}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
