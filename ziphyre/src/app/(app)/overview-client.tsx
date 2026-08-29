"use client";

import Link from "next/link";
import {
  Plus,
  Inbox,
  ArrowRight,
  AlertTriangle,
  FileWarning,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SampleBadge } from "@/components/sample-badge";
import { SampleDataToggle } from "@/components/sample-data-toggle";
import { cn } from "@/lib/utils";
import { STAGE_TEXT } from "@/lib/stages";
import type { PostingSummary } from "@/lib/postings";

type Props = {
  postings: PostingSummary[];
  /** FR-136 — the toggle's current state, for the control in the header. */
  showSampleData: boolean;
  /** The FR-101 summary, rendered on the server and passed through. */
  summary: React.ReactNode;
};

/**
 * Used to branch here between real postings and `lib/seed.ts`'s
 * hardcoded preview data — client-local, unpersisted, and disconnected
 * from the real pipeline (no actual candidates, no real screening,
 * fake ids nothing could click into). §10B replaces it: a sample
 * posting is now a real, seeded, `is_sample = true` row that scores
 * candidates through the actual pipeline and shows up in this exact
 * list, marked with `SampleBadge`, rather than a separate fake mode.
 */
export function OverviewClient({ postings, showSampleData, summary }: Props) {
  const open = postings.filter((p) => p.status === "open");
  const closed = postings.filter((p) => p.status === "closed");

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] leading-tight font-semibold">
            Hiring Pipeline
          </h1>
        </div>

        <div className="flex items-center gap-4">
          <SampleDataToggle checked={showSampleData} />
          <Button asChild>
            <Link href="/postings/new">
              <Plus className="size-4" aria-hidden />
              New posting
            </Link>
          </Button>
        </div>
      </div>

      {summary}

      {postings.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-8">
          {open.length > 0 && (
            <section className="space-y-3">
              {open.map((p) => (
                <RealPostingCard key={p.id} posting={p} />
              ))}
            </section>
          )}

          {closed.length > 0 && (
            <section className="space-y-3">
              <h2 className="label-meta">Closed</h2>
              {closed.map((p) => (
                <RealPostingCard key={p.id} posting={p} />
              ))}
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card px-8 py-16 text-center">
      <div className="mx-auto flex size-11 items-center justify-center rounded-full bg-muted">
        <Inbox className="size-5 text-muted-foreground" aria-hidden />
      </div>
      <h2 className="mt-4 text-base font-semibold">
        Nothing being hired for right now.
      </h2>
      <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">
        Create a posting to start receiving applications. Once you share your
        form link, they appear here on their own.
      </p>
      <Button asChild className="mt-5">
        <Link href="/postings/new">
          <Plus className="size-4" aria-hidden />
          New posting
        </Link>
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Real data. An opening shows FR-77's counts once anyone has applied, and
// falls back to setup state before that — a row reading "0 applied" on a
// role with no job description attached answers the wrong question.
// ---------------------------------------------------------------------------

function RealPostingCard({ posting }: { posting: PostingSummary }) {
  const isClosed = posting.status === "closed";

  return (
    <article
      className={cn(
        "overflow-hidden rounded-lg border border-border bg-card",
        isClosed && "opacity-70",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-divider px-5 py-3.5">
        <Link
          href={`/postings/${posting.id}`}
          className="flex items-center gap-2.5 hover:underline"
        >
          <h3 className="text-sm font-semibold">{posting.name}</h3>
          {posting.isSample && <SampleBadge />}
          {isClosed && (
            <Badge
              variant="secondary"
              className="rounded-full bg-fit-rejected-bg px-2 py-0 text-[11px] font-medium text-fit-rejected"
            >
              Closed
            </Badge>
          )}
        </Link>
        <span className="text-xs text-muted-foreground">
          {posting.openings.length}{" "}
          {posting.openings.length === 1 ? "opening" : "openings"}
        </span>
      </div>

      <ul className="divide-y divide-divider">
        {posting.openings.map((o) => (
          <li key={o.id}>
            <Link
              href={`/postings/${posting.id}/openings/${o.id}`}
              className="elev-hover flex flex-wrap items-center justify-between gap-4 px-5 py-4 hover:bg-muted/40"
            >
              <div className="min-w-[180px]">
                <p className="text-sm font-medium">{o.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {o.workLocation}
                </p>
              </div>

              {/* FR-77. Setup state only answers "is this ready?", which
                  stops being the question the moment anyone applies —
                  from then on the counts are what Rahul came for. */}
              {o.counts.applied > 0 ? (
                <div className="flex flex-wrap items-center gap-x-7 gap-y-2">
                  <Stat label="Applied" value={o.counts.applied} />
                  <Stat label="Screened" value={o.counts.screened} />
                  <Stat
                    label="Shortlisted"
                    value={o.counts.shortlisted}
                    tone="shortlisted"
                  />
                  <Stat label="New" value={o.counts.new} />
                  {o.counts.needsReview > 0 && (
                    <div className="flex items-center gap-1.5">
                      <AlertTriangle
                        className="size-3.5 text-fit-review"
                        aria-hidden
                      />
                      <span className="text-sm font-medium text-fit-review">
                        {o.counts.needsReview}{" "}
                        {o.counts.needsReview === 1 ? "needs" : "need"} review
                      </span>
                    </div>
                  )}
                </div>
              ) : !o.hasJd ? (
                <span className="flex items-center gap-1.5 text-sm text-fit-review">
                  <FileWarning className="size-3.5" aria-hidden />
                  No job description
                </span>
              ) : o.requirementCount === 0 ? (
                <span className="text-sm text-muted-foreground">
                  No requirements set
                </span>
              ) : (
                <span className="text-sm text-muted-foreground">
                  No applications yet
                </span>
              )}

              <ArrowRight
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden
              />
            </Link>
          </li>
        ))}
      </ul>
    </article>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "shortlisted";
}) {
  return (
    <div>
      <p className="label-meta text-[10px]">{label}</p>
      <p
        className={cn(
          "tabular mt-0.5 text-[15px] font-semibold",
          // Reads the shared stage colour rather than naming one, so
          // this stat and the Shortlisted badge in a pipeline stay the
          // same colour when that colour changes.
          tone === "shortlisted" && value > 0
            ? STAGE_TEXT.shortlisted
            : value === 0
              ? "text-muted-foreground"
              : "text-foreground",
        )}
      >
        {value}
      </p>
    </div>
  );
}
