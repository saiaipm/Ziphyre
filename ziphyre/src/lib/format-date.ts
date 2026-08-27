/**
 * Dates rendered the same way everywhere.
 *
 * **`timeZone: "UTC"` is load-bearing, not tidiness.** Postgres returns
 * `timestamptz` as UTC; formatting it in the viewer's zone would render
 * one string on the server and another in the browser for anyone whose
 * offset crosses midnight — a hydration mismatch this codebase has been
 * bitten by before. Everything here is a *day*, not a moment, so the
 * calendar date in UTC is the honest thing to show and the only one
 * both sides can agree on.
 */
export function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
