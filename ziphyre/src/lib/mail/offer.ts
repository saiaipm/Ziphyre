/**
 * Which direction a stage-change offer runs, and who it applies to.
 *
 * **Client-safe on purpose**, like `templates.ts`: the move dialog needs
 * the eligibility rule to count who is about to be emailed, and the
 * server needs the same rule to decide who actually gets a message.
 * Written once so the count on the button and the messages that leave
 * cannot disagree — the failure this file exists to prevent is a
 * confirmation saying "and email 3" while 2 are sent.
 *
 * `reject` is FR-110 — telling someone they are out. `reversal` is its
 * inverse, and the two invert each other's eligibility exactly: a
 * rejection is offered to people who have *not* been told, an update
 * only to people who *have*, because they are the only ones holding
 * something that is no longer true.
 *
 * PN-004's rule was "the page never tells a candidate something worse
 * than what they have already been told", and the guard was built one
 * way. Better news delivered silently is not harmful the way worse news
 * is, but it reads like a mistake — and Principle 4 says every state
 * change reaches the people it affects.
 */

export type OfferKind = "reject" | "reversal";

export type OutcomeRecipient = {
  applicationId: string;
  candidateName: string;
  /** Null for a manual upload's placeholder address. */
  email: string | null;
  /** Whether the outcome message has actually gone (FR-123's gate). */
  alreadySent: boolean;
};

export function isEligible(r: OutcomeRecipient, kind: OfferKind): boolean {
  if (!r.email) return false;
  return kind === "reject" ? !r.alreadySent : r.alreadySent;
}
