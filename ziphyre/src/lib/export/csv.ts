import "server-only";
import { EXPORT_HEADERS, type ExportRow } from "./rows";

/**
 * RFC 4180 quoting. Everything is quoted rather than only the fields
 * that need it — CTC answers contain commas, notice periods contain
 * quotes often enough, and a rule with no exceptions cannot be applied
 * inconsistently.
 */
function cell(value: string | number | null): string {
  if (value === null) return '""';
  return `"${String(value).replace(/"/g, '""')}"`;
}

export function buildCsv(rows: ExportRow[], marker: string): string {
  const lines = [
    // FR-75. Above the header rather than below the data: a spreadsheet
    // opened and scrolled shows row 1 first, and a marker nobody scrolls
    // to has not marked anything.
    cell(marker),
    EXPORT_HEADERS.map(cell).join(","),
    ...rows.map((r) => r.map(cell).join(",")),
  ];
  // BOM so Excel opens UTF-8 correctly — without it "₹" and accented
  // names arrive mangled on Windows, which is most of the audience.
  return "﻿" + lines.join("\r\n") + "\r\n";
}
