import type { FormFieldKey } from "@/lib/applications";

/**
 * Maps response-sheet columns onto the field keys screening already reads
 * (`FORM_FIELD_KEYS` in src/lib/applications.ts), so a form submission and
 * a manual upload converge on one shape.
 *
 * Matching is on the header text, not column position: an admin who adds a
 * question, or reorders two, shouldn't silently start writing notice periods
 * into the CTC field. Anything unrecognised is ignored rather than guessed.
 */
const HEADER_PATTERNS: { key: FormFieldKey; test: RegExp }[] = [
  { key: "currentLocation", test: /current\s*location|^location/i },
  { key: "willingnessToRelocate", test: /relocat/i },
  { key: "experienceYears", test: /experience.*year|year.*experience/i },
  { key: "experienceMonths", test: /experience.*month|month.*experience/i },
  { key: "noticePeriod", test: /notice/i },
  { key: "currentCtc", test: /current\s*ctc/i },
  { key: "expectedCtc", test: /expected\s*ctc/i },
];

const NAME_PATTERN = /full\s*name|^name/i;
const EMAIL_PATTERN = /e-?mail/i;
const CV_PATTERN = /cv|resum/i;
const ROLE_PATTERN = /role|position applied/i;

export type ColumnMap = {
  name: number | null;
  email: number | null;
  cv: number | null;
  role: number | null;
  fields: Partial<Record<FormFieldKey, number>>;
};

export function mapColumns(header: string[]): ColumnMap {
  const map: ColumnMap = { name: null, email: null, cv: null, role: null, fields: {} };

  header.forEach((raw, index) => {
    const title = raw.trim();
    if (!title) return;

    // Identity and the CV come first: "Full name" would otherwise also
    // satisfy a broader field pattern later in the list.
    if (map.email === null && EMAIL_PATTERN.test(title)) {
      map.email = index;
      return;
    }
    if (map.name === null && NAME_PATTERN.test(title)) {
      map.name = index;
      return;
    }
    if (map.cv === null && CV_PATTERN.test(title)) {
      map.cv = index;
      return;
    }
    if (map.role === null && ROLE_PATTERN.test(title)) {
      map.role = index;
      return;
    }

    for (const { key, test } of HEADER_PATTERNS) {
      if (map.fields[key] === undefined && test.test(title)) {
        map.fields[key] = index;
        return;
      }
    }
  });

  return map;
}

export type ParsedResponse = {
  email: string | null;
  fullName: string | null;
  claimedOption: string | null;
  cvCell: string | null;
  /**
   * Only keys the form actually asked. A key absent here reads as
   * "Not provided" downstream; a key present but empty reads as blank
   * (tech spec §2.4's three-state rule).
   */
  formAnswers: Record<string, string | null>;
};

export function parseRow(row: string[], columns: ColumnMap): ParsedResponse {
  const cell = (index: number | null | undefined) =>
    index === null || index === undefined ? null : (row[index] ?? "").trim() || null;

  const formAnswers: Record<string, string | null> = {};
  for (const [key, index] of Object.entries(columns.fields)) {
    formAnswers[key] = cell(index);
  }

  return {
    email: cell(columns.email)?.toLowerCase() ?? null,
    fullName: cell(columns.name),
    claimedOption: cell(columns.role),
    cvCell: cell(columns.cv),
    formAnswers,
  };
}
