export type JobKind = "screen_application" | "import_submissions";

export type ScreenApplicationPayload = {
  applicationId: string;
  reason: "new" | "retry" | "rescreen";
};

export type ImportSubmissionsPayload = {
  postingId: string;
};

export type JobPayload<K extends JobKind> = K extends "screen_application"
  ? ScreenApplicationPayload
  : K extends "import_submissions"
    ? ImportSubmissionsPayload
    : never;

export type JobRow = {
  id: string;
  organization_id: string;
  kind: string;
  payload: unknown;
  status: "queued" | "running" | "succeeded" | "failed";
  attempts: number;
  max_attempts: number;
  run_after: string;
  locked_at: string | null;
  locked_by: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};
