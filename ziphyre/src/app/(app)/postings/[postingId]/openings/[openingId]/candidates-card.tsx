"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Loader2,
  Upload,
  X,
  RotateCcw,
  AlertTriangle,
  FileText,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { modelLabel } from "@/lib/ai/providers";
import {
  applyFilters,
  DEFAULT_FILTERS,
  PipelineFilters,
  type Filters,
} from "./pipeline-filters";
import type { ApplicationListItem } from "@/lib/applications";
import {
  STAGE_LABELS,
  stageTakesDisposition,
  type DispositionKey,
  type StageKey,
} from "@/lib/stages";
import {
  BatchBar,
  ReassignDialog,
  RowStageMenu,
  SelectCheckbox,
  StageBadge,
  StageHistoryPanel,
  StageMoveDialog,
  type PendingMove,
} from "./stage-controls";
import {
  addCandidatesToOpening,
  changeApplicationStage,
  getCvViewUrl,
  refreshApplications,
  retryScreening,
} from "../../../actions";

const POLL_MS = 4000;

type PendingFile = { key: string; file: File; name: string };

export function CandidatesCard({
  openingId,
  postingId,
  initialApplications,
}: {
  openingId: string;
  postingId: string;
  initialApplications: ApplicationListItem[];
}) {
  const [applications, setApplications] = useState(initialApplications);
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [move, setMove] = useState<PendingMove | null>(null);
  const [moving, setMoving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sorting lives inside applyFilters, so the server's default ordering
  // and the user's chosen one can't disagree.
  const visible = applyFilters(applications, filters);

  // A selection only ever means what is currently on screen. Filtering
  // to "score ≥ 8", selecting all, then clearing the filter must not
  // silently carry twenty invisible candidates into a rejection.
  const visibleIds = new Set(visible.map((a) => a.id));
  const selectedVisible = [...selected].filter((id) => visibleIds.has(id));
  const allVisibleSelected =
    visible.length > 0 && selectedVisible.length === visible.length;

  function toggleSelected(id: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAllVisible(on: boolean) {
    setSelected(on ? new Set(visible.map((a) => a.id)) : new Set());
  }

  /**
   * FR-57 gives disposition to On hold and Rejected only, so those two
   * open the dialog and the rest move on the click. A confirm step with
   * nothing to confirm teaches people to dismiss confirm steps.
   */
  function requestMove(applicationIds: string[], toStage: StageKey) {
    if (applicationIds.length === 0) return;
    const singleName =
      applicationIds.length === 1
        ? (applications.find((a) => a.id === applicationIds[0])?.candidateName ??
          "this candidate")
        : null;

    const pendingMove: PendingMove = { applicationIds, toStage, singleName };
    if (stageTakesDisposition(toStage)) setMove(pendingMove);
    else void commitMove(pendingMove, null, "");
  }

  async function commitMove(
    pendingMove: PendingMove,
    disposition: DispositionKey | null,
    note: string,
  ) {
    setMoving(true);
    const result = await changeApplicationStage({
      applicationIds: pendingMove.applicationIds,
      toStage: pendingMove.toStage,
      disposition,
      note,
      postingId,
      openingId,
    });
    setMoving(false);
    setMove(null);

    if (!result.ok) {
      toast.error("Couldn't move", { description: result.error });
      return;
    }

    const { moved, failed } = result.data;
    // Partial success is named rather than rounded up to success —
    // an admin who is told "20 moved" and finds 17 stops trusting the
    // number that matters most on this screen.
    if (failed > 0) {
      toast.warning(`Moved ${moved} of ${moved + failed}`, {
        description: `${failed} couldn't be moved. They are unchanged — try them again.`,
      });
    } else {
      toast.success(
        moved === 1
          ? `${pendingMove.singleName} → ${STAGE_LABELS[pendingMove.toStage]}`
          : `${moved} candidates → ${STAGE_LABELS[pendingMove.toStage]}`,
        { description: "Your decision is recorded. Scores never change." },
      );
    }

    setSelected(new Set());
    const refreshed = await refreshApplications(openingId);
    if (refreshed.ok) setApplications(refreshed.data);
  }

  const hasInFlight = applications.some(
    (a) => a.screeningStatus === "pending" || a.screeningStatus === "in_progress",
  );

  useEffect(() => {
    if (!hasInFlight) return;
    const id = setInterval(async () => {
      const result = await refreshApplications(openingId);
      if (result.ok) setApplications(result.data);
    }, POLL_MS);
    return () => clearInterval(id);
  }, [hasInFlight, openingId]);

  function onFilesChosen(fileList: FileList | null) {
    if (!fileList) return;
    const next = Array.from(fileList).map((file) => ({
      key: crypto.randomUUID(),
      file,
      name: file.name.replace(/\.[^.]+$/, ""),
    }));
    setPending((prev) => [...prev, ...next]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removePending(key: string) {
    setPending((prev) => prev.filter((p) => p.key !== key));
  }

  function renamePending(key: string, name: string) {
    setPending((prev) => prev.map((p) => (p.key === key ? { ...p, name } : p)));
  }

  async function onUpload() {
    if (pending.length === 0) return;
    setUploading(true);

    const formData = new FormData();
    for (const p of pending) {
      formData.append("file", p.file);
      formData.append("name", p.name);
    }

    const result = await addCandidatesToOpening(openingId, formData);
    setUploading(false);

    if (!result.ok) {
      toast.error("Couldn't add candidates", { description: result.error });
      return;
    }

    setPending([]);
    toast.success(
      `Added ${result.data.added} candidate${result.data.added === 1 ? "" : "s"}`,
      {
        description:
          result.data.skipped.length > 0
            ? `Skipped: ${result.data.skipped.join(", ")}`
            : "Screening starts automatically.",
      },
    );

    const refreshed = await refreshApplications(openingId);
    if (refreshed.ok) setApplications(refreshed.data);
  }

  async function onRetry(applicationId: string) {
    const result = await retryScreening(applicationId);
    if (!result.ok) {
      toast.error("Couldn't retry", { description: result.error });
      return;
    }
    toast.info("Retrying screening…");
    const refreshed = await refreshApplications(openingId);
    if (refreshed.ok) setApplications(refreshed.data);
  }

  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="border-b border-divider px-6 py-4">
        <h2 className="text-sm font-semibold">Candidates</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Add candidates by uploading their CVs. Screening starts on its own
          &mdash; there&rsquo;s no button for it.
        </p>
      </div>

      <div className="space-y-4 px-6 py-5">
        <div className="space-y-3">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={(e) => onFilesChosen(e.target.files)}
            className="block text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:border-border file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground"
          />

          {pending.length > 0 && (
            <ul className="space-y-2">
              {pending.map((p) => (
                <li key={p.key} className="flex items-center gap-2">
                  <Input
                    value={p.name}
                    onChange={(e) => renamePending(p.key, e.target.value)}
                    className="flex-1"
                  />
                  <span className="w-40 shrink-0 truncate text-xs text-muted-foreground">
                    {p.file.name}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0"
                    onClick={() => removePending(p.key)}
                    aria-label="Remove"
                  >
                    <X className="size-3.5" aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          {pending.length > 0 && (
            <Button size="sm" onClick={onUpload} disabled={uploading}>
              <Upload className="size-3.5" aria-hidden />
              {uploading
                ? "Adding…"
                : `Add ${pending.length} candidate${pending.length === 1 ? "" : "s"}`}
            </Button>
          )}
        </div>

        {applications.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No candidates yet. Applications appear here once you add CVs.
          </p>
        ) : (
          <>
            <PipelineFilters
              filters={filters}
              onChange={setFilters}
              shown={visible.length}
              total={applications.length}
            />

            {visible.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No candidates match these filters.{" "}
                <button
                  type="button"
                  className="underline underline-offset-2 hover:text-foreground"
                  onClick={() =>
                    setFilters({ ...DEFAULT_FILTERS, sort: filters.sort })
                  }
                >
                  Clear them
                </button>{" "}
                to see all {applications.length}.
              </p>
            ) : (
              <>
                <div className="flex items-center gap-3 border-b border-divider pb-2">
                  <SelectCheckbox
                    checked={allVisibleSelected}
                    onCheckedChange={toggleAllVisible}
                    label={
                      allVisibleSelected
                        ? "Clear selection"
                        : `Select all ${visible.length} shown`
                    }
                  />
                  <span className="text-xs text-muted-foreground">
                    {selectedVisible.length > 0
                      ? `${selectedVisible.length} selected`
                      : `Select all ${visible.length} shown`}
                  </span>
                </div>

                <ul className="divide-y divide-divider">
                  {visible.map((app) => (
                    <ApplicationRow
                      key={app.id}
                      app={app}
                      postingId={postingId}
                      openingId={openingId}
                      onRetry={onRetry}
                      selected={selected.has(app.id)}
                      onSelectedChange={(on) => toggleSelected(app.id, on)}
                      onMove={(stage) => requestMove([app.id], stage)}
                      onReassigned={async () => {
                        const refreshed = await refreshApplications(openingId);
                        if (refreshed.ok) setApplications(refreshed.data);
                      }}
                      busy={moving}
                    />
                  ))}
                </ul>

                <BatchBar
                  count={selectedVisible.length}
                  onMove={(stage) => requestMove(selectedVisible, stage)}
                  onClear={() => setSelected(new Set())}
                  disabled={moving}
                />
              </>
            )}
          </>
        )}
      </div>

      <StageMoveDialog
        move={move}
        saving={moving}
        onCancel={() => setMove(null)}
        onConfirm={(disposition, note) => {
          if (move) void commitMove(move, disposition, note);
        }}
      />
    </section>
  );
}

function ApplicationRow({
  app,
  postingId,
  openingId,
  onRetry,
  selected,
  onSelectedChange,
  onMove,
  onReassigned,
  busy,
}: {
  app: ApplicationListItem;
  postingId: string;
  openingId: string;
  onRetry: (applicationId: string) => void;
  selected: boolean;
  onSelectedChange: (on: boolean) => void;
  onMove: (stage: StageKey) => void;
  onReassigned: () => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  // Bumped after a move made from inside the dialog, so the history
  // list below it reflects the change that was just made rather than
  // the state it was opened at.
  const [historyKey, setHistoryKey] = useState(0);
  const name = app.candidateName ?? "Unnamed candidate";

  // FR-47: an unreadable CV is held at its stage with a reason, never
  // scored. It is still a real candidate, so it is still selectable and
  // still movable — deciding without a score is exactly what this state
  // asks the admin to do.
  if (app.screeningStatus === "needs_manual_review") {
    return (
      <li className="flex items-start gap-3 py-3">
        <SelectCheckbox
          checked={selected}
          onCheckedChange={onSelectedChange}
          label={`Select ${name}`}
        />
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-fit-review" aria-hidden />
        <div className="flex-1">
          <p className="text-sm font-medium">{name}</p>
          <p className="text-xs text-muted-foreground">
            Needs manual review — {app.screeningFailureReason}
          </p>
        </div>
        <StageBadge stage={app.currentStage} />
        <RowStageMenu
          currentStage={app.currentStage}
          onMove={onMove}
          disabled={busy}
        />
        <Button size="sm" variant="outline" onClick={() => onRetry(app.id)}>
          <RotateCcw className="size-3.5" aria-hidden />
          Retry
        </Button>
      </li>
    );
  }

  if (app.screeningStatus !== "complete" || !app.screening) {
    return (
      <li className="flex items-center gap-3 py-3">
        <SelectCheckbox
          checked={selected}
          onCheckedChange={onSelectedChange}
          label={`Select ${name}`}
        />
        <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
        <p className="flex-1 text-sm font-medium">{name}</p>
        <span className="text-xs text-muted-foreground">Screening…</span>
        <StageBadge stage={app.currentStage} />
      </li>
    );
  }

  const s = app.screening;
  const mustHaveCount = s.mustHaveResult.length;
  const mustHaveMet = s.mustHaveResult.filter((m) => m.met).length;

  return (
    <>
      <li className="flex items-center gap-3 py-3 hover:bg-muted/50">
        <SelectCheckbox
          checked={selected}
          onCheckedChange={onSelectedChange}
          label={`Select ${name}`}
        />
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex flex-1 items-center gap-3 text-left"
        >
          <div className="flex-1">
            <p className="text-sm font-medium">{name}</p>
            <p className="text-xs text-muted-foreground">
              {mustHaveCount === 0
                ? "No must-haves set"
                : `${mustHaveMet}/${mustHaveCount} must-haves met`}
            </p>
          </div>
          <div className="hidden gap-3 text-xs text-muted-foreground sm:flex">
            <Score label="JD" value={s.jdFit} />
            <Score label="Exp" value={s.experience} />
            <Score label="Skills" value={s.skills} />
            <Score label="Qual" value={s.qualification} />
            <Score label="Loc" value={s.location} />
          </div>
          <Badge variant={s.meetsAllMustHaves ? "default" : "outline"}>
            {s.overall.toFixed(1)} / 10
          </Badge>
        </button>
        <StageBadge stage={app.currentStage} />
        <RowStageMenu
          currentStage={app.currentStage}
          onMove={onMove}
          disabled={busy}
        />
      </li>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[88vh] overflow-hidden sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>{name}</DialogTitle>
            <DialogDescription>
              Overall {s.overall.toFixed(1)}/10 — equal-weighted average of the
              five components below.
              {s.usedFallback && (
                <> Screened by {modelLabel(s.provider, s.model)} after your primary provider failed.</>
              )}
            </DialogDescription>
          </DialogHeader>

          {/* FR-61: the CV readable beside the assessment, without
              navigating away. Two panes on desktop, stacked on mobile. */}
          <div className="grid gap-5 overflow-hidden lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <CvPane applicationId={app.id} open={open} />

          <div className="space-y-4 overflow-y-auto pr-1 text-sm">
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              <Score label="JD Fit" value={s.jdFit} />
              <Score label="Experience" value={s.experience} />
              <Score label="Skills" value={s.skills} />
              <Score label="Qualification" value={s.qualification} />
              <Score label="Location" value={s.location} />
            </div>

            {mustHaveCount > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground">Must-haves</p>
                <ul className="mt-1 space-y-1">
                  {s.mustHaveResult.map((m) => (
                    <li key={m.requirementId} className="text-xs">
                      <span className={m.met ? "text-fit-shortlisted" : "text-fit-review"}>
                        {m.met ? "✓" : "✗"}
                      </span>{" "}
                      {m.note}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <p className="text-xs font-semibold text-muted-foreground">Strengths</p>
              <p className="mt-1 text-sm">{s.strengths}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Gaps</p>
              <p className="mt-1 text-sm">{s.gaps}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Overall read</p>
              <p className="mt-1 text-sm">{s.overallRead}</p>
            </div>
            {s.experienceDiscrepancy && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground">
                  Experience discrepancy
                </p>
                <p className="mt-1 text-sm">{s.experienceDiscrepancy}</p>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Scored by {modelLabel(s.provider, s.model)}.
            </p>

            {/* FR-59: the history belongs on the application, not on a
                separate audit screen — the question "why was this
                person dropped?" is asked while looking at them. */}
            <div className="border-t border-divider pt-4">
              <p className="text-xs font-semibold text-muted-foreground">
                Stage history
              </p>
              <div className="mt-2">
                <StageHistoryPanel
                  applicationId={app.id}
                  open={open}
                  reloadKey={historyKey}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-divider pt-4">
              <StageBadge stage={app.currentStage} />
              <RowStageMenu
                currentStage={app.currentStage}
                onMove={(stage) => {
                  setHistoryKey((k) => k + 1);
                  onMove(stage);
                }}
                disabled={busy}
              />
              <ReassignDialog
                applicationId={app.id}
                candidateName={name}
                postingId={postingId}
                fromOpeningId={openingId}
                onDone={() => {
                  setOpen(false);
                  onReassigned();
                }}
              />
            </div>
          </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * FR-61. Fetches a short-lived signed URL on open — never on render of
 * the list, so a signed URL only exists for a CV someone is actually
 * looking at. PDFs render inline; anything else (a .docx) cannot be
 * displayed by the browser, so it offers the file instead of pretending.
 */
function CvPane({ applicationId, open }: { applicationId: string; open: boolean }) {
  // Loading is *derived* from having no result yet, rather than set at
  // the top of the effect. Each row owns its own dialog, so applicationId
  // never changes under this component and a null result can only mean
  // "not fetched yet".
  const [state, setState] = useState<
    | { status: "error"; message: string }
    | { status: "ready"; url: string; mime: string; filename: string }
    | null
  >(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getCvViewUrl(applicationId).then((result) => {
      if (cancelled) return;
      setState(
        result.ok
          ? { status: "ready", ...result.data }
          : { status: "error", message: result.error },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [applicationId, open]);

  const frame =
    "flex h-[60vh] items-center justify-center rounded-lg border border-border bg-muted/30 text-sm text-muted-foreground";

  if (state === null || state.status !== "ready") {
    return (
      <div className={frame}>
        {state?.status === "error" ? (
          <span className="px-6 text-center">{state.message}</span>
        ) : (
          <Loader2 className="size-5 animate-spin" aria-hidden />
        )}
      </div>
    );
  }

  const isPdf = state.mime === "application/pdf";

  return (
    <div className="space-y-2">
      {isPdf ? (
        <iframe
          src={state.url}
          title="Candidate CV"
          className="h-[60vh] w-full rounded-lg border border-border bg-white"
        />
      ) : (
        <div className={frame}>
          <div className="px-6 text-center">
            <FileText className="mx-auto size-6" aria-hidden />
            <p className="mt-2">
              This format can&rsquo;t be shown in the browser.
            </p>
          </div>
        </div>
      )}
      <a
        href={state.url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
      >
        <ExternalLink className="size-3" aria-hidden />
        {isPdf ? "Open in a new tab" : `Download ${state.filename}`}
      </a>
    </div>
  );
}

function Score({ label, value }: { label: string; value: number }) {
  return (
    <span>
      {label} <span className="font-medium text-foreground">{value}</span>
    </span>
  );
}
