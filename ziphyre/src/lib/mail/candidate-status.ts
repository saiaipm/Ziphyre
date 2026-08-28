import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { StageKey } from "@/lib/stages";

/**
 * The status page's data — FR-119 to FR-125, tech spec §10A.4.
 *
 * **The query does not fetch a single score column, and that is the
 * point.** Non-Goal 9 says a candidate never sees a score or an internal
 * note, "not as an option, not as a setting". The safest way to honour
 * that is to be structurally unable to leak it: nothing here selects
 * from `screening`, so no future change to the page can accidentally
 * render one.
 *
 * Uses the admin client because the reader is anonymous — there is no
 * session to scope RLS by. The unguessable token is the authorisation,
 * exactly as it is for `/apply/[token]`, and every query filters by it.
 */

export type CandidateStatus = {
  roleTitle: string;
  organisationName: string;
  appliedOn: string;
  state: "received" | "shortlisted" | "under_review" | "not_moving_forward";
  /** Tech spec §11 — what the apply page promised, restated honestly. */
  keptUntil: string | null;
};

/**
 * FR-122 and FR-123. Internal stages are never shown raw: "on hold" is
 * an internal category, and telling a candidate they are on hold is
 * worse than telling them nothing.
 *
 * The last line is FR-123 entire — a rejection becomes visible only
 * once the outcome has actually been sent, so nobody learns they were
 * rejected from a page refresh before a person chose to tell them.
 */
function toCandidateState(
  stage: StageKey,
  outcomeSentAt: string | null,
): CandidateStatus["state"] {
  switch (stage) {
    case "shortlisted":
      return "shortlisted";
    case "rejected":
      return outcomeSentAt ? "not_moving_forward" : "received";
    case "on_hold":
      return "under_review";
    default:
      return "received";
  }
}

export async function getCandidateStatus(
  token: string,
): Promise<CandidateStatus | null> {
  const admin = createAdminClient();

  const { data } = await admin
    .from("application")
    .select(
      `current_stage, outcome_sent_at, submitted_at, created_at, purged_at,
       opening:opening_id (
         title,
         posting:posting_id ( purge_after ),
         organization:organization_id ( name )
       )`,
    )
    .eq("status_token", token)
    .maybeSingle();

  // A purged application keeps its row but loses its data, and the
  // token is nulled by the purge — so this is null either way, and the
  // page shows the expired-link copy rather than a bare 404.
  if (!data || data.purged_at) return null;

  const opening = data.opening as unknown as {
    title: string;
    posting: { purge_after: string | null } | null;
    organization: { name: string } | null;
  } | null;

  if (!opening) return null;

  return {
    roleTitle: opening.title,
    organisationName: opening.organization?.name ?? "the team",
    appliedOn: data.submitted_at ?? data.created_at,
    state: toCandidateState(
      data.current_stage as StageKey,
      data.outcome_sent_at,
    ),
    keptUntil: opening.posting?.purge_after ?? null,
  };
}
