import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Plus, ArrowRight, FileWarning } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getPostingDetail } from "@/lib/postings";
import {
  NeedsReviewCallout,
  StageFunnel,
  SummaryTile,
} from "@/components/pipeline/stage-funnel";
import { STAGE_TEXT } from "@/lib/stages";
import { cn } from "@/lib/utils";
import { PostingActions } from "./posting-actions";
import { PostingTitle } from "./posting-title";
import { ApplyLink } from "./apply-link";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ postingId: string }>;
}): Promise<Metadata> {
  const { postingId } = await params;
  const posting = await getPostingDetail(postingId);
  return { title: posting?.name ?? "Posting" };
}

export default async function PostingDetailPage({
  params,
}: {
  params: Promise<{ postingId: string }>;
}) {
  const { postingId } = await params;
  const posting = await getPostingDetail(postingId);
  if (!posting) notFound();

  const isClosed = posting.status === "closed";
  const hasReadyOpening = posting.openings.some((o) => o.hasJd);
  const { metrics } = posting;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PostingTitle
          postingId={posting.id}
          name={posting.name}
          openingCount={posting.openings.length}
          isClosed={isClosed}
        />
        <PostingActions
          postingId={posting.id}
          postingName={posting.name}
          isClosed={isClosed}
        />
      </div>

      {/* The posting-level dashboard: the same tiles and funnel as home
          and as each opening, scoped to this posting. A posting with
          several openings is the level at which "how is this hire
          going?" is actually asked, and it was the one level that could
          only be answered by opening each opening in turn. */}
      {metrics.totalApplications > 0 && (
        <section className="space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryTile label="Openings" value={posting.openings.length} />
            <SummaryTile
              label="Applications"
              value={metrics.totalApplications}
            />
            <SummaryTile
              label="Shortlisted"
              value={metrics.byStage.shortlisted}
              accent={STAGE_TEXT.shortlisted}
            />
            <SummaryTile
              label="Still in play"
              value={
                metrics.totalApplications -
                metrics.byStage.rejected -
                metrics.byStage.on_hold
              }
            />
          </div>

          <StageFunnel
            byStage={metrics.byStage}
            total={metrics.totalApplications}
          />
          <NeedsReviewCallout count={metrics.needsReview} />
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="label-meta">Openings</h2>
          {!isClosed && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/postings/${posting.id}/openings/new`}>
                <Plus className="size-3.5" aria-hidden />
                Add opening
              </Link>
            </Button>
          )}
        </div>

        <div className="space-y-2">
          {posting.openings.map((o) => (
            <Link
              key={o.id}
              href={`/postings/${posting.id}/openings/${o.id}`}
              className="elev-hover flex items-center justify-between gap-4 rounded-lg border border-border bg-card px-5 py-4 hover:bg-muted/40"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">{o.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {o.workLocation}
                </p>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                {/* Where the posting's candidates actually are. Without
                    this the summary above is a number with nowhere to
                    go — you could see 8 applications and still have to
                    open each opening to find them. */}
                {(() => {
                  const c = metrics.perOpening.get(o.id);
                  if (!c) return null;
                  return (
                    <span className="text-xs text-muted-foreground">
                      {c.total} application{c.total === 1 ? "" : "s"}
                      {c.shortlisted > 0 && (
                        <>
                          {" · "}
                          <span className={cn("font-medium", STAGE_TEXT.shortlisted)}>
                            {c.shortlisted} shortlisted
                          </span>
                        </>
                      )}
                    </span>
                  );
                })()}

                {!o.hasJd ? (
                  <span className="flex items-center gap-1.5 text-xs text-fit-review">
                    <FileWarning className="size-3.5" aria-hidden />
                    No job description
                  </span>
                ) : o.requirementCount === 0 ? (
                  <span className="text-xs text-muted-foreground">
                    No requirements set
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {o.mustHaveCount} must-have
                    {o.mustHaveCount === 1 ? "" : "s"} · {o.requirementCount}{" "}
                    total
                  </span>
                )}
                <ArrowRight
                  className="size-4 text-muted-foreground"
                  aria-hidden
                />
              </div>
            </Link>
          ))}
        </div>
      </section>

      <ApplyLink
        postingId={posting.id}
        applyToken={posting.applyToken}
        isClosed={isClosed}
        hasReadyOpening={hasReadyOpening}
      />
    </div>
  );
}
