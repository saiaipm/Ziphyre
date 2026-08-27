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

/**
 * The tile used across all three summaries.
 *
 * `outOf` renders the value as "7 / 8" for tiles that are a **subset**
 * of the total rather than a total themselves. Without it "Still in
 * play: 7" sits beside "Applications: 8" and reads as the same number
 * gone wrong — it was misread that way during review, by the person who
 * specified the rule that these numbers must reconcile. Showing the
 * denominator makes the relationship visible instead of inferable,
 * which is cheaper than being right and disbelieved.
 */
export function SummaryTile({
  label,
  value,
  accent,
  outOf,
  onClick,
  active,
}: {
  label: string;
  value: number;
  accent?: string;
  outOf?: number;
  /** When given, the tile filters the list below it to what it counts. */
  onClick?: () => void;
  active?: boolean;
}) {
  const inner = (
    <>
      <p className="text-2xl font-semibold tabular-nums">
        <span className={value === 0 ? undefined : accent}>{value}</span>
        {outOf !== undefined && (
          <span className="text-base font-normal text-muted-foreground">
            {" / "}
            {outOf}
          </span>
        )}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </>
  );

  const shell = "rounded-lg border bg-card px-4 py-3 text-left";

  if (!onClick) {
    return <div className={cn(shell, "border-border")}>{inner}</div>;
  }

  // A real button, not a clickable div: this is now a control, and the
  // pipeline is required to be fully keyboard-operable.
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      // A tile counting nobody filters to an empty list, which reads as
      // a broken screen rather than an answered question.
      disabled={value === 0}
      className={cn(
        shell,
        "w-full transition-colors",
        active
          ? "border-foreground bg-muted"
          : "border-border enabled:hover:bg-muted/50",
        value === 0 && "cursor-default",
      )}
    >
      {inner}
      <span className="sr-only">
        {value === 0
          ? " — nothing to show"
          : active
            ? " — filtering by this; activate to clear"
            : " — activate to filter the list below"}
      </span>
    </button>
  );
}
