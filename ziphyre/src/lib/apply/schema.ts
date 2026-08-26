/**
 * Client-safe. The apply page and both route handlers validate against
 * this same schema, so the browser's error messages and the server's
 * refusals can never drift apart.
 */
import { z } from "zod";

/** FR-94. DOC is absent deliberately: screening cannot extract text from it. */
export const ALLOWED_CV_MIME = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

export const MAX_CV_BYTES = 1024 * 1024; // FR-94, 1 MB

export const RELOCATION_OPTIONS = ["Yes", "No", "Open to discussing"] as const;

const required = (label: string) =>
  z.string().trim().min(1, `${label} is required.`);

/** FR-90, FR-91. Every field required — there is no partial submission. */
export const ApplicationFieldsSchema = z.object({
  openingId: z.string().uuid("Choose the role you're applying for."),
  fullName: required("Your name"),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  currentLocation: required("Current location"),
  // FR-92. Coerced because an HTML number input still submits a string.
  experienceYears: z.coerce
    .number({ message: "Enter your years of experience." })
    .int("Whole numbers only.")
    .min(0, "Can't be negative.")
    .max(60, "That doesn't look right."),
  experienceMonths: z.coerce
    .number({ message: "Enter months as a number." })
    .int("Whole numbers only.")
    .min(0, "Can't be negative.")
    .max(11, "Months must be 0 to 11 — use the years box for a full year."),
  // FR-93.
  willingnessToRelocate: z.enum(RELOCATION_OPTIONS, {
    message: "Choose one.",
  }),
  noticePeriod: required("Notice period"),
  currentCtc: required("Current CTC"),
  expectedCtc: required("Expected CTC"),
});

export type ApplicationFields = z.infer<typeof ApplicationFieldsSchema>;

/** Step 1 of §5.2 — asking for an upload slot. */
export const UploadSlotSchema = z.object({
  openingId: z.string().uuid(),
  email: z.string().trim().toLowerCase().email(),
  filename: z.string().min(1).max(200),
  size: z.number().int().positive().max(MAX_CV_BYTES),
  mime: z.enum(ALLOWED_CV_MIME),
});

/** Step 3 of §5.2 — the submission itself. */
export const SubmitSchema = ApplicationFieldsSchema.extend({
  storagePath: z.string().min(1),
  // Honeypot (tech spec §5.3). A real browser leaves this empty; a naive
  // bot fills every field it finds. Named to look worth filling in.
  //
  // Deliberately accepts ANY string. Validating it as empty here would
  // reject a filled honeypot with a field-specific error naming
  // "website" — telling the bot exactly which check caught it. The
  // handler inspects it instead and answers as though it worked.
  website: z.string().optional(),
});

export function cvFileError(file: File): string | null {
  if (file.size > MAX_CV_BYTES) {
    return "That file is over 1 MB. Please choose a smaller one.";
  }
  if (!(ALLOWED_CV_MIME as readonly string[]).includes(file.type)) {
    return "Please choose a PDF or a Word (.docx) file.";
  }
  return null;
}
