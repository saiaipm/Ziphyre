/**
 * Colour bands for screening scores.
 *
 * **Colour is a scanning aid, never the information.** The functional
 * spec's accessibility rule is explicit: score and must-have status are
 * never conveyed by colour alone — always a number or words. Every
 * caller of these helpers renders the digits too; the tone only makes a
 * strong candidate findable in a list of fifty at a glance.
 *
 * **No red.** ProductContext Principle 1 is that screening ranks and
 * never decides, and red reads as a verdict the product refuses to
 * make. A weak score gets the same slate the Rejected stage uses —
 * recessive, not alarming — so the loudest thing on the row is a good
 * candidate rather than a bad one.
 */

/** Bands are on the 0–10 scale both overall and per component. */
export type FitBand = "strong" | "moderate" | "weak";

export function fitBand(score: number): FitBand {
  if (score >= 7.5) return "strong";
  if (score >= 5) return "moderate";
  return "weak";
}

/** Text-only tone, for the five component columns. */
export const FIT_TEXT: Record<FitBand, string> = {
  strong: "text-fit-strong",
  moderate: "text-foreground",
  weak: "text-fit-rejected",
};

/** Filled tone, for the one number that carries the most weight. */
export const FIT_FILL: Record<FitBand, string> = {
  strong: "bg-fit-strong-bg text-fit-strong",
  moderate: "bg-fit-review-bg text-fit-review",
  weak: "bg-fit-rejected-bg text-fit-rejected",
};
