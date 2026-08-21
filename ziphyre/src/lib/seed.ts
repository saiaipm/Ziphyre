/**
 * Sample data for previewing the interface before Supabase is connected.
 *
 * Derived from Testing/baseline-ranking-CA-role.md — the human ranking of the
 * seven real Chartered Accountant applicants, written before screening existed.
 * These are NOT screening outputs. They are the recorded human baseline, shown
 * so the interface can be judged with realistic content in it.
 *
 * Delete this file once real data flows.
 */

export type SeedOpening = {
  id: string;
  title: string;
  location: string;
  counts: {
    applied: number;
    screened: number;
    shortlisted: number;
    new: number;
    needsReview: number;
  };
};

export type SeedPosting = {
  id: string;
  name: string;
  status: "open" | "closed";
  createdAt: string;
  openings: SeedOpening[];
};

export const seedPostings: SeedPosting[] = [
  {
    id: "p-finance-aug",
    name: "Finance hiring, August",
    status: "open",
    createdAt: "2026-08-04",
    openings: [
      {
        id: "o-ca",
        title: "Chartered Accountant",
        location: "Hyderabad",
        counts: {
          applied: 7,
          screened: 7,
          shortlisted: 2,
          new: 0,
          needsReview: 0,
        },
      },
      {
        id: "o-smm",
        title: "Social Media Manager",
        location: "Hyderabad",
        counts: {
          applied: 0,
          screened: 0,
          shortlisted: 0,
          new: 0,
          needsReview: 0,
        },
      },
    ],
  },
  {
    id: "p-ops-jun",
    name: "Operations, June",
    status: "closed",
    createdAt: "2026-06-11",
    openings: [
      {
        id: "o-ops",
        title: "Operations Executive",
        location: "Hyderabad",
        counts: {
          applied: 23,
          screened: 23,
          shortlisted: 4,
          new: 0,
          needsReview: 1,
        },
      },
    ],
  },
];

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
