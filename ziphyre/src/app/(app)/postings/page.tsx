import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getPostingsForOrg } from "@/lib/postings";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Postings" };

export default async function PostingsPage() {
  const postings = await getPostingsForOrg();
  const open = postings.filter((p) => p.status === "open");
  const closed = postings.filter((p) => p.status === "closed");

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] leading-tight font-semibold">Postings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every hiring drive, open and closed.
          </p>
        </div>
        <Button asChild>
          <Link href="/postings/new">
            <Plus className="size-4" aria-hidden />
            New posting
          </Link>
        </Button>
      </div>

      {postings.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card px-8 py-16 text-center">
          <div className="mx-auto flex size-11 items-center justify-center rounded-full bg-muted">
            <Briefcase className="size-5 text-muted-foreground" aria-hidden />
          </div>
          <h2 className="mt-4 text-base font-semibold">No postings yet.</h2>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">
            Create one to start defining what you&rsquo;re hiring for.
          </p>
          <Button asChild className="mt-5">
            <Link href="/postings/new">
              <Plus className="size-4" aria-hidden />
              New posting
            </Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-8">
          {open.length > 0 && (
            <section className="space-y-3">
              {open.map((p) => (
                <PostingRow key={p.id} posting={p} />
              ))}
            </section>
          )}
          {closed.length > 0 && (
            <section className="space-y-3">
              <h2 className="label-meta">Closed</h2>
              {closed.map((p) => (
                <PostingRow key={p.id} posting={p} />
              ))}
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function PostingRow({
  posting,
}: {
  posting: Awaited<ReturnType<typeof getPostingsForOrg>>[number];
}) {
  const isClosed = posting.status === "closed";
  return (
    <Link
      href={`/postings/${posting.id}`}
      className={cn(
        "elev-hover block rounded-lg border border-border bg-card px-5 py-4 hover:bg-muted/40",
        isClosed && "opacity-70",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <h3 className="text-sm font-semibold">{posting.name}</h3>
          {isClosed && (
            <Badge
              variant="secondary"
              className="rounded-full bg-fit-rejected-bg px-2 py-0 text-[11px] font-medium text-fit-rejected"
            >
              Closed
            </Badge>
          )}
        </div>
        <span className="text-xs text-muted-foreground">
          {posting.openings.length}{" "}
          {posting.openings.length === 1 ? "opening" : "openings"}
        </span>
      </div>
      {posting.openings.length > 0 && (
        <p className="mt-1.5 text-xs text-muted-foreground">
          {posting.openings.map((o) => o.title).join(" · ")}
        </p>
      )}
    </Link>
  );
}
