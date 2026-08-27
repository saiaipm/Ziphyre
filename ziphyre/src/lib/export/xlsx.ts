import "server-only";
import ExcelJS from "exceljs";
import { EXPORT_HEADERS, type ExportRow } from "./rows";

/**
 * FR-71's Excel half. A real workbook rather than a CSV with an .xlsx
 * name: the numbers arrive as numbers, so a recruiter can sort by
 * overall score without Excel treating "8.6" as text.
 */
export async function buildXlsx(
  rows: ExportRow[],
  marker: string,
  sheetName: string,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.created = new Date();

  // Excel refuses sheet names over 31 chars or containing []*/\?:
  const safeName = sheetName.replace(/[[\]*/\\?:]/g, " ").slice(0, 31) || "Candidates";
  const ws = wb.addWorksheet(safeName);

  // FR-75, row 1, merged across the table so it cannot be missed or
  // sorted away from the data it describes.
  ws.addRow([marker]);
  ws.mergeCells(1, 1, 1, EXPORT_HEADERS.length);
  const markerCell = ws.getCell(1, 1);
  markerCell.font = { italic: true, size: 9, color: { argb: "FF7A5B00" } };
  markerCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFFFF7E0" },
  };

  const header = ws.addRow([...EXPORT_HEADERS]);
  header.font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 2 }];

  for (const r of rows) ws.addRow(r);

  // Autofilter over the header so the recipient can slice it further,
  // which is most of why a spreadsheet is asked for over a PDF.
  ws.autoFilter = {
    from: { row: 2, column: 1 },
    to: { row: 2 + rows.length, column: EXPORT_HEADERS.length },
  };

  ws.columns.forEach((col, i) => {
    const header = String(EXPORT_HEADERS[i] ?? "");
    const longest = rows.reduce(
      (max, r) => Math.max(max, String(r[i] ?? "").length),
      header.length,
    );
    col.width = Math.min(Math.max(longest + 2, 10), 40);
  });

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}
