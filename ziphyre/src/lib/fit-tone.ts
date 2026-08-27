/**
 * Colour bands for screening scores.
 *
 * **Colour is a scanning aid, never the information.** The functional
 * spec's accessibility rule is explicit: score and must-have status are
 * never conveyed by colour alone — always a number or words. Every
 * caller of these helpers renders the digits too; the tone only makes a
 * strong candidate findable in a list of fifty at a glance.
 *
 * The bands are a product decision, set 27 Aug 2026: red at or below 6,
 * amber above 6 up to 7, green above 7. Note this is a *traffic light*,
 * so the colour does read as a judgement — which is why the number is
 * always beside it and why nothing in the product acts on the band.
 * Screening still ranks and never decides (ProductContext Principle 1):
 * a red score moves no one to Rejected, and only an admin can.
 */

/** Bands are on the 0–10 scale both overall and per component. */
export type FitBand = "strong" | "moderate" | "weak";

export function fitBand(score: number): FitBand {
  if (score > 7) return "strong";
  if (score > 6) return "moderate";
  return "weak";
}

/** Text-only tone, for the five component columns. */
export const FIT_TEXT: Record<FitBand, string> = {
  strong: "text-fit-strong",
  moderate: "text-fit-review",
  weak: "text-fit-weak",
};

/** Filled tone, for the one number that carries the most weight. */
export const FIT_FILL: Record<FitBand, string> = {
  strong: "bg-fit-strong-bg text-fit-strong",
  moderate: "bg-fit-review-bg text-fit-review",
  weak: "bg-fit-weak-bg text-fit-weak",
};
