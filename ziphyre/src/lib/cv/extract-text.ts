import "server-only";
import mammoth from "mammoth";
import { ensureDomMatrix } from "./dom-matrix-polyfill";

/**
 * **`pdf-parse` is imported lazily, and that is load-bearing.**
 *
 * It pulls in `pdfjs-dist`, which touches `DOMMatrix` — a browser API
 * that exists in local Node but not on Vercel's serverless runtime. As a
 * top-level import it was evaluated whenever this module was loaded, so
 * merely importing `extractDocumentText` anywhere brought the whole
 * module graph down in production:
 *
 *   Failed to load external module pdf-parse: ReferenceError: DOMMatrix is not defined
 *
 * `postings/actions.ts` imports this file for JD upload, so every server
 * action in that file — stage moves, the send-check, everything —
 * inherited the failure, on a route that never touches a PDF. Deferring
 * the import confines the cost to the code path that actually parses one.
 *
 * The polyfill is installed before the import, not after: pdfjs builds
 * `SCALE_MATRIX` at module scope, so by the time the import resolves it
 * is already too late.
 */
async function loadPdfParse() {
  ensureDomMatrix();
  const { PDFParse } = await import("pdf-parse");
  return PDFParse;
}

export type CvExtractionResult =
  | { ok: true; text: string }
  | { ok: false; reason: string };

export const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Below this many extractable characters, treat the file as unreadable rather than as a very short CV. */
const MIN_CHARS = 200;

const CV_SIGNAL_PATTERN =
  /@|\bexperience\b|\beducation\b|\bskills?\b|\bemployment\b|\bqualifications?\b/i;

/**
 * FR-47. Runs before the provider call so an unreadable file is cheap to
 * detect and the reason is specific — never a silent zero score.
 *
 * `.doc` (legacy binary format) has no maintained pure-JS extractor, so
 * it always fails here with its own reason rather than attempting a
 * shaky parse. It's still accepted at upload per FR-24; this is where
 * it lands instead.
 */
export async function extractCvText(
  bytes: Buffer,
  mime: string,
): Promise<CvExtractionResult> {
  if (mime === "application/msword") {
    return {
      ok: false,
      reason:
        "We can't read old .doc files yet — save it as PDF or DOCX and try again.",
    };
  }

  let text: string;
  try {
    const extracted = await extractDocumentText(bytes, mime);
    if (extracted === null) {
      return { ok: false, reason: "This file doesn't appear to be a CV." };
    }
    text = extracted;
  } catch (err) {
    // Logged, not swallowed — otherwise a real parser regression looks
    // identical to an actually-corrupt file and can't be told apart.
    console.error("extractCvText: parse failed", err);
    return { ok: false, reason: "This file is damaged or empty." };
  }

  const trimmed = text.trim();
  if (trimmed.length < MIN_CHARS) {
    return {
      ok: false,
      reason: "We couldn't read this file — it may be a scanned image.",
    };
  }

  if (!CV_SIGNAL_PATTERN.test(trimmed)) {
    return { ok: false, reason: "This file doesn't appear to be a CV." };
  }

  return { ok: true, text: trimmed };
}

/**
 * Format handling only — no judgement about what the document *is*.
 * Shared by CV screening and job-description upload, which need the
 * same parsing and very different validation: a JD has no reason to
 * mention "experience" or an email address, so the CV-shaped checks in
 * `extractCvText` must not be applied to one.
 *
 * Returns null for a format we cannot read at all.
 */
export async function extractDocumentText(
  bytes: Buffer,
  mime: string,
): Promise<string | null> {
  if (mime === "application/pdf") return extractPdfText(bytes);
  if (mime === DOCX_MIME) {
    const result = await mammoth.extractRawText({ buffer: bytes });
    return result.value;
  }
  if (mime === "text/markdown" || mime === "text/plain") {
    return bytes.toString("utf8");
  }
  return null;
}

async function extractPdfText(bytes: Buffer): Promise<string> {
  const started = Date.now();
  const PDFParse = await loadPdfParse();
  const loaded = Date.now();
  const parser = new PDFParse({ data: bytes });
  try {
    const result = await parser.getText();
    // Timed because "the job never finished" says nothing about which
    // stage was slow, and on serverless a killed function logs nothing
    // at all. These two numbers separate "pdfjs is the problem" from
    // "the model is the problem" in one line.
    console.log(
      `[pdf] import ${loaded - started}ms, parse ${Date.now() - loaded}ms, ${result.text.length} chars`,
    );
    return result.text;
  } finally {
    await parser.destroy();
  }
}
