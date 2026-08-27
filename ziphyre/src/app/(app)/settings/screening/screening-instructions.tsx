import { ChevronRight } from "lucide-react";
import { PROMPT_VERSION, SYSTEM_PROMPT } from "@/lib/ai/screen-application";

/**
 * PN-003, Layer 0 — the screening instructions, visible.
 *
 * Principle 10 is to say the honest thing to customers about what the
 * product does and does not decide, and until now the rules that judge
 * every candidate were readable only in the source. An admin who cannot
 * see how a shortlist was produced cannot defend it to the person who
 * asks why someone was dropped.
 *
 * Read-only, and the copy says so plainly rather than implying a
 * setting is coming. It also points at the control the admin *does*
 * have — requirements and must-have marks — because "I have no control
 * over screening" is usually that control being invisible rather than
 * absent.
 *
 * A native `<details>`, so it collapses with no client JavaScript and
 * no hydration surface. This codebase has been bitten by hydration
 * twice; a disclosure triangle is not worth a third.
 */
export function ScreeningInstructions() {
  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="border-b border-divider px-6 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">How candidates are judged</h2>
          <span className="text-xs text-muted-foreground">
            Version {PROMPT_VERSION}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          The instructions given to the model for every candidate, on every
          role. Shown so a score can be explained &mdash; and questioned.
        </p>
      </div>

      <div className="space-y-4 px-6 py-5">
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-medium hover:text-foreground [&::-webkit-details-marker]:hidden">
            <ChevronRight
              className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
              aria-hidden
            />
            Read the instructions
          </summary>

          <pre className="mt-3 max-h-96 overflow-auto rounded-lg border border-border bg-muted/40 p-4 text-xs leading-relaxed whitespace-pre-wrap">
            {SYSTEM_PROMPT}
          </pre>

          <p className="mt-3 text-xs text-muted-foreground">
            Sent with these, per candidate: the opening&rsquo;s job
            description, its requirements with your must-have marks, the
            answers the candidate gave on the application form, and the text
            extracted from their CV. The CV file itself is never sent &mdash;
            only text read from it.
          </p>
        </details>

        <div className="space-y-2 border-t border-divider pt-4 text-xs text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">
              These instructions are the same for every candidate and every
              role, and can&rsquo;t be edited.
            </span>{" "}
            That is deliberate: a shortlist is only defensible if everyone in
            it was measured the same way, and the rule that screening never
            recommends an outcome is what keeps the decision yours.
          </p>
          <p>
            <span className="font-medium text-foreground">
              What you do control is what gets judged.
            </span>{" "}
            The requirements on each opening — and which of them you mark
            must-have — are what change the ranking for your role. Editing
            those is the intended way to make screening fit a job.
          </p>
        </div>
      </div>
    </section>
  );
}
