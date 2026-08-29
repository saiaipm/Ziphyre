/**
 * Fixed option lists for the organisation-settings dropdowns.
 *
 * Used to also hold `seedPostings` — hardcoded, unpersisted preview
 * data for the pipeline screen shown before Supabase was connected.
 * Retired in M8 (§10B): a seeded `is_sample = true` posting, scored by
 * the real pipeline and controlled by `organization.show_sample_data`,
 * replaces it — a real row in the same list rather than a separate
 * client-only fake mode with ids nothing could click into.
 */

export const SIZE_BANDS = [
  "1–10",
  "11–50",
  "51–200",
  "201–500",
  "500+",
] as const;

export const INDUSTRIES = [
  "Media & Entertainment",
  "Manufacturing",
  "Information Technology",
  "Financial Services",
  "Healthcare",
  "Retail & E-commerce",
  "Education",
  "Construction & Real Estate",
  "Logistics",
  "Other",
] as const;

export const CURRENCIES = [
  { code: "INR", label: "Indian Rupee (₹)" },
  { code: "USD", label: "US Dollar ($)" },
  { code: "AED", label: "UAE Dirham (د.إ)" },
  { code: "GBP", label: "Pound Sterling (£)" },
  { code: "EUR", label: "Euro (€)" },
] as const;

export const TIMEZONES = [
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Europe/London",
  "America/New_York",
] as const;
