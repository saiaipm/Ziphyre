export type JobKind = "screen_application" | "send_message";

export type ScreenApplicationPayload = {
  applicationId: string;
  /** `reassigned` is FR-60's rescreen against the new opening's JD. */
  reason: "new" | "retry" | "rescreen" | "reassigned";
};

/** Tech spec §10A.3 — one job per recipient, never per batch. */
export type SendMessagePayload = { messageId: string };

export type JobPayload<K extends JobKind> = K extends "screen_application"
  ? ScreenApplicationPayload
  : K extends "send_message"
    ? SendMessagePayload
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
