import { CalendarClock, ShieldAlert } from "lucide-react";
import { formatDay } from "@/lib/format-date";

/**
 * Tech spec §11, made visible.
 *
 * The apply page tells every candidate their details are kept for six
 * months after the role closes and then deleted. Until now the admin
 * side said nothing about that, which left the only copy of the promise
 * on the page the admin never reads — and the deletion itself arriving
 * as a surprise.
 *
 * Two states, because they ask for different things. Beyond 30 days is
 * a fact worth knowing. Inside 30 days is a deadline: whatever is still
 * wanted has to be exported before the date, and after it nobody can
 * get it back.
 */
export function RetentionNotice({
  purgeAfter,
  daysLeft,
  applicationCount,
}: {
  purgeAfter: string | null;
  /** Computed in the data layer — see PostingDetail.daysUntilPurge. */
  daysLeft: number | null;
  applicationCount: number;
}) {
  // An open posting has no purge date, and one with nobody in it has
  // nothing to lose — neither needs telling.
  if (!purgeAfter || daysLeft === null || applicationCount === 0) return null;

  const imminent = daysLeft <= 30;

  if (imminent) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-fit-review-bg px-5 py-4 dark:border-amber-900/40">
        <ShieldAlert
          className="mt-0.5 size-4 shrink-0 text-fit-review"
          aria-hidden
        />
        <div className="text-sm text-amber-900 dark:text-amber-100">
          <p className="font-medium">
            {daysLeft <= 0
              ? "Candidate data for this posting is due to be deleted."
              : `Candidate data for this posting is deleted in ${daysLeft} ${daysLeft === 1 ? "day" : "days"}, on ${formatDay(purgeAfter)}.`}
          </p>
          <p className="mt-1">
            {applicationCount}{" "}
            {applicationCount === 1 ? "candidate’s" : "candidates’"} CVs,
            answers and written assessments go permanently. Scores, stages and
            dates are kept.{" "}
            <strong className="font-medium">
              Export anything you still need before then
            </strong>{" "}
            — Ziphyre holds the only copy.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/40 px-5 py-3">
      <CalendarClock
        className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
        aria-hidden
      />
      <p className="text-xs text-muted-foreground">
        Candidate data for this posting is deleted on{" "}
        <span className="font-medium text-foreground">
          {formatDay(purgeAfter)}
        </span>{" "}
        — six months after it closed, as promised on the application page.
        Scores, stages and dates are kept; CVs, answers and written assessments
        are not.
      </p>
    </div>
  );
}
