import type { Metadata } from "next";
import { CheckCircle2, Clock, Star, XCircle } from "lucide-react";
import { getCandidateStatus, type CandidateStatus } from "@/lib/mail/candidate-status";
import { formatDay } from "@/lib/format-date";

/**
 * The product's second public page — FR-119 to FR-125.
 *
 * No login, no account, no candidate sign-in of any kind. The
 * unguessable token is the authorisation, exactly as on `/apply`.
 *
 * **What is absent is the design.** No score, no component rating, no
 * must-have result, no assessment text, no disposition (FR-121,
 * Non-Goal 9) — and the data layer does not even fetch them, so this
 * page could not show one if a later edit tried to.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your application",
  // A status page is personal data behind a guessable-only-by-luck URL.
  // It should never appear in a search result.
  robots: { index: false, follow: false },
};

const STATES: Record<
  CandidateStatus["state"],
  { icon: typeof Clock; tone: string; heading: string; body: string }
> = {
  received: {
    icon: Clock,
    tone: "text-fit-screened",
    heading: "Received",
    body: "Your application is with the team.",
  },
  under_review: {
    icon: Clock,
    tone: "text-fit-review",
    heading: "Under review",
    body: "Your application is still being considered.",
  },
  shortlisted: {
    icon: Star,
    tone: "text-fit-strong",
    heading: "Shortlisted",
    body: "The team will be in touch about next steps.",
  },
  not_moving_forward: {
    icon: XCircle,
    tone: "text-fit-weak",
    heading: "Not moving forward",
    body: "Thank you for the time you gave this application. We're grateful you thought of us, and we wish you well with your search.",
  },
};

export default async function StatusPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const status = await getCandidateStatus(token);

  // FR-125. A link the candidate bookmarked deserves an explanation
  // rather than a 404 — the data is gone because we said it would be.
  if (!status) {
    return (
      <Shell>
        <div className="text-center">
          <CheckCircle2
            className="mx-auto size-8 text-muted-foreground"
            aria-hidden
          />
          <h1 className="mt-3 text-lg font-semibold">This link has expired</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            The application it pointed to has been deleted, as promised when
            you applied.
          </p>
        </div>
      </Shell>
    );
  }

  const state = STATES[status.state];
  const Icon = state.icon;

  return (
    <Shell>
      <div>
        <h1 className="text-lg font-semibold">Your application</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {status.roleTitle} at {status.organisationName} · Applied{" "}
          {formatDay(status.appliedOn)}
        </p>
      </div>

      <div className="mt-6 flex items-start gap-3 rounded-lg border border-border bg-muted/30 px-5 py-4">
        <Icon className={`mt-0.5 size-5 shrink-0 ${state.tone}`} aria-hidden />
        <div>
          <p className="text-sm font-semibold">{state.heading}</p>
          <p className="mt-1 text-sm text-muted-foreground">{state.body}</p>
        </div>
      </div>

      {status.keptUntil && (
        <p className="mt-6 text-xs text-muted-foreground">
          Your details are kept until {formatDay(status.keptUntil)} and then
          deleted.
        </p>
      )}

      <p className="mt-2 text-xs text-muted-foreground">
        This page updates on its own — there&rsquo;s nothing to check or sign
        in to. Replies to our emails reach the hiring team directly.
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto min-h-dvh max-w-lg px-5 py-12">
      <div className="rounded-lg border border-border bg-card px-6 py-7">
        {children}
      </div>
    </main>
  );
}
