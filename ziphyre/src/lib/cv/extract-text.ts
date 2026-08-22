import "server-only";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";

export type CvExtractionResult =
  | { ok: true; text: string }
  | { ok: false; reason: string };

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
    if (mime === "application/pdf") {
      text = await extractPdfText(bytes);
    } else if (
      mime ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      const result = await mammoth.extractRawText({ buffer: bytes });
      text = result.value;
    } else {
      return { ok: false, reason: "This file doesn't appear to be a CV." };
    }
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

async function extractPdfText(bytes: Buffer): Promise<string> {
  const parser = new PDFParse({ data: bytes });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}
