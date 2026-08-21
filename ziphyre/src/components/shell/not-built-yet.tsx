import Link from "next/link";
import { Hammer } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Honest placeholder for routes whose milestone hasn't been built.
 * Better than a 404, and it never pretends to be the real screen.
 */
export function NotBuiltYet({
  title,
  milestone,
  summary,
}: {
  title: string;
  milestone: string;
  summary: string;
}) {
  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <div className="mx-auto flex size-11 items-center justify-center rounded-full bg-muted">
        <Hammer className="size-5 text-muted-foreground" aria-hidden />
      </div>
      <h1 className="mt-5 text-xl font-semibold">{title}</h1>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
        {summary}
      </p>
      <p className="mt-4 inline-block rounded-full bg-fit-shortlisted-bg px-3 py-1 text-xs font-medium text-fit-shortlisted">
        Planned for {milestone}
      </p>
      <div className="mt-7">
        <Button asChild variant="outline">
          <Link href="/">Back to overview</Link>
        </Button>
      </div>
    </div>
  );
}
