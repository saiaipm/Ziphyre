import "server-only";
import { googleJson, googleBytes } from "@/lib/google/client";

export type FormSummary = { id: string; name: string };

/**
 * FR-26: the admin picks a form from a list, never pastes a link.
 * Forms don't have their own list endpoint — they're Drive files.
 */
export async function listForms(organizationId: string): Promise<FormSummary[]> {
  const url =
    "https://www.googleapis.com/drive/v3/files" +
    "?q=" +
    encodeURIComponent("mimeType='application/vnd.google-apps.form' and trashed=false") +
    "&fields=files(id,name)&orderBy=modifiedTime desc&pageSize=100";

  const data = await googleJson<{ files?: { id: string; name: string }[] }>(
    organizationId,
    url,
  );
  return (data.files ?? []).map((f) => ({ id: f.id, name: f.name }));
}

/** The dropdown question Ziphyre matches openings against (FR-27). */
const ROLE_QUESTION_HINT = "role applied for";

type FormItem = {
  title?: string;
  questionItem?: {
    question?: {
      choiceQuestion?: { type?: string; options?: { value?: string }[] };
    };
  };
};

export type FormDetail = {
  formId: string;
  title: string;
  linkedSheetId: string | null;
  roleOptions: string[];
  /** Question titles in form order — used to map sheet columns. */
  questionTitles: string[];
};

export async function getFormDetail(
  organizationId: string,
  formId: string,
): Promise<FormDetail> {
  const data = await googleJson<{
    formId: string;
    info?: { title?: string; documentTitle?: string };
    linkedSheetId?: string;
    items?: FormItem[];
  }>(organizationId, `https://forms.googleapis.com/v1/forms/${formId}`);

  const items = data.items ?? [];

  // Prefer the question actually named "Role applied for"; fall back to the
  // last dropdown in the form, which is where the template puts it. Falling
  // back rather than failing means a renamed question degrades to a
  // mismatch warning the admin can see and fix, not an unexplained error.
  const dropdowns = items.filter(
    (i) => i.questionItem?.question?.choiceQuestion?.type === "DROP_DOWN",
  );
  const roleItem =
    dropdowns.find((i) => i.title?.trim().toLowerCase().includes(ROLE_QUESTION_HINT)) ??
    dropdowns.at(-1);

  const roleOptions = (
    roleItem?.questionItem?.question?.choiceQuestion?.options ?? []
  )
    .map((o) => o.value?.trim())
    .filter((v): v is string => Boolean(v));

  return {
    formId: data.formId,
    title: data.info?.title ?? data.info?.documentTitle ?? "Untitled form",
    linkedSheetId: data.linkedSheetId ?? null,
    roleOptions,
    questionTitles: items.map((i) => i.title?.trim() ?? ""),
  };
}

export type MatchReport = {
  /** In the form's dropdown but not configured as an opening (FR-27). */
  optionsWithoutOpening: string[];
  /** Configured as an opening but absent from the dropdown — nobody can apply. */
  openingsWithoutOption: string[];
  matched: boolean;
};

/**
 * FR-27. Matching is on the exact option string, which is why
 * `form_option_value` is stored separately from `title`: the admin may
 * word the dropdown differently from the internal role title, and
 * matching on title would silently break the moment they diverge.
 */
export function compareOptions(
  roleOptions: string[],
  openingOptionValues: string[],
): MatchReport {
  const options = new Set(roleOptions);
  const openings = new Set(openingOptionValues);

  const optionsWithoutOpening = [...options].filter((o) => !openings.has(o));
  const openingsWithoutOption = [...openings].filter((o) => !options.has(o));

  return {
    optionsWithoutOpening,
    openingsWithoutOption,
    matched:
      optionsWithoutOpening.length === 0 && openingsWithoutOption.length === 0,
  };
}

/** Reads the linked response sheet's first tab as raw rows. */
export async function readSheetRows(
  organizationId: string,
  spreadsheetId: string,
): Promise<string[][]> {
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A:Z` +
    "?majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE";
  const data = await googleJson<{ values?: unknown[][] }>(organizationId, url);
  return (data.values ?? []).map((row) => row.map((cell) => String(cell ?? "")));
}

export type DriveFile = { bytes: Buffer; mimeType: string; name: string };

export async function downloadDriveFile(
  organizationId: string,
  fileId: string,
): Promise<DriveFile> {
  const meta = await googleJson<{ name: string; mimeType: string }>(
    organizationId,
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,mimeType`,
  );
  const bytes = await googleBytes(
    organizationId,
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
  );
  return { bytes, mimeType: meta.mimeType, name: meta.name };
}

/**
 * A form file-upload answer reaches the sheet as a Drive URL, not an id.
 * Handles the several shapes Google uses, and returns null rather than a
 * wrong guess — a bad id would fail later and further from the cause.
 */
export function driveFileIdFromUrl(value: string): string | null {
  const patterns = [/[?&]id=([\w-]{10,})/, /\/file\/d\/([\w-]{10,})/, /\/open\?id=([\w-]{10,})/];
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match) return match[1];
  }
  return null;
}
