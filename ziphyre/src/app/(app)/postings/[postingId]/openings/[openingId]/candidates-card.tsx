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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { fitBand, passTone, FIT_FILL, FIT_TEXT } from "@/lib/fit-tone";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { modelLabel } from "@/lib/ai/providers";
import { PipelineFilters } from "./pipeline-filters";
import {
  applyFilters,
  DEFAULT_FILTERS,
  type Filters,
} from "@/lib/pipeline-filtering";
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
import { OpeningSummary } from "./opening-summary";
import {
  addCandidatesToOpening,
  changeApplicationStage,
  getCvViewUrl,
  refreshApplications,
  retryScreening,
} from "../../../actions";

const POLL_MS = 4000;

/**
 * Abbreviated in the header because five full words would set the
 * column widths for a single digit each. The full name is the `title`,
 * and the assessment dialog spells all five out in full.
 */
const COMPONENT_COLUMNS = [
  { key: "jdFit", label: "JD", full: "JD Fit" },
  { key: "experience", label: "Exp", full: "Experience" },
  { key: "skills", label: "Skills", full: "Skills" },
  { key: "qualification", label: "Qual", full: "Qualification" },
  { key: "location", label: "Loc", full: "Location" },
] as const;

/** Columns between the CV file and the stage, for colSpan on the rows
 *  that have no scores to put there yet. */
const SCORE_COLSPAN = COMPONENT_COLUMNS.length + 2;

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
  const { visible, hiddenForMissing, missingFieldLabels } = applyFilters(
    applications,
    filters,
  );

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
    <div className="space-y-6">
      {/* Counted from `applications` — the same state the table renders
          — so a shortlist made below updates the tiles above it without
          a refetch, and the two can never disagree. */}
      <OpeningSummary applications={applications} />

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
              hiddenForMissing={hiddenForMissing}
              missingFieldLabels={missingFieldLabels}
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
                {/* The five component ratings used to repeat their own
                    label on every row — "JD 9 Exp 8 Skills 6" fifty times
                    over. A header row says each name once and lets the
                    digits line up in columns, which is what makes a
                    column of scores comparable at a glance. */}
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-8">
                        <SelectCheckbox
                          checked={allVisibleSelected}
                          onCheckedChange={toggleAllVisible}
                          label={
                            allVisibleSelected
                              ? "Clear selection"
                              : `Select all ${visible.length} shown`
                          }
                        />
                      </TableHead>
                      <TableHead>Candidate</TableHead>
                      <TableHead>CV file</TableHead>
                      {COMPONENT_COLUMNS.map((c) => (
                        <TableHead
                          key={c.key}
                          className="text-center text-xs font-medium text-muted-foreground"
                          title={c.full}
                        >
                          {c.label}
                        </TableHead>
                      ))}
                      <TableHead className="text-center">Overall</TableHead>
                      <TableHead className="text-center">Must-haves</TableHead>
                      <TableHead>Stage</TableHead>
                      <TableHead className="w-8">
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
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
                  </TableBody>
                </Table>

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
    </div>
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
      <TableRow>
        <TableCell>
          <SelectCheckbox
            checked={selected}
            onCheckedChange={onSelectedChange}
            label={`Select ${name}`}
          />
        </TableCell>
        <TableCell className="font-medium">{name}</TableCell>
        <CvFileCell filename={app.cvOriginalFilename} />
        <TableCell colSpan={SCORE_COLSPAN}>
          <span className="flex items-center gap-1.5 text-xs text-fit-review">
            <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
            Needs manual review — {app.screeningFailureReason}
          </span>
        </TableCell>
        <TableCell>
          <StageBadge stage={app.currentStage} />
        </TableCell>
        <TableCell className="text-right">
          <div className="flex items-center justify-end gap-1">
            <RowStageMenu
              currentStage={app.currentStage}
              onMove={onMove}
              disabled={busy}
            />
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              onClick={() => onRetry(app.id)}
            >
              <RotateCcw className="size-3.5" aria-hidden />
              Retry
            </Button>
          </div>
        </TableCell>
      </TableRow>
    );
  }

  if (app.screeningStatus !== "complete" || !app.screening) {
    return (
      <TableRow>
        <TableCell>
          <SelectCheckbox
            checked={selected}
            onCheckedChange={onSelectedChange}
            label={`Select ${name}`}
          />
        </TableCell>
        <TableCell className="font-medium">{name}</TableCell>
        <CvFileCell filename={app.cvOriginalFilename} />
        <TableCell colSpan={SCORE_COLSPAN}>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden />
            Screening…
          </span>
        </TableCell>
        <TableCell>
          <StageBadge stage={app.currentStage} />
        </TableCell>
        <TableCell />
      </TableRow>
    );
  }

  const s = app.screening;
  const mustHaveCount = s.mustHaveResult.length;
  const mustHaveMet = s.mustHaveResult.filter((m) => m.met).length;

  return (
    <>
      <TableRow>
        <TableCell>
          <SelectCheckbox
            checked={selected}
            onCheckedChange={onSelectedChange}
            label={`Select ${name}`}
          />
        </TableCell>

        {/* The name is the button, not the row: a whole clickable row
            is unreachable by keyboard, and §Accessibility requires the
            pipeline to be fully keyboard-operable. */}
        <TableCell>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="block max-w-[12rem] truncate text-left text-sm font-medium hover:underline underline-offset-2"
            title={`${name} — open assessment`}
          >
            {name}
          </button>
        </TableCell>

        <CvFileCell filename={app.cvOriginalFilename} />

        {COMPONENT_COLUMNS.map((c) => {
          const value = s[c.key];
          return (
            <TableCell
              key={c.key}
              className={cn(
                "text-center text-xs tabular-nums",
                FIT_TEXT[fitBand(value)],
              )}
            >
              {value}
            </TableCell>
          );
        })}

        <TableCell className="text-center">
          <span
            className={cn(
              "inline-block rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
              FIT_FILL[fitBand(s.overall)],
            )}
          >
            {s.overall.toFixed(1)}
          </span>
        </TableCell>

        {/* Numbers, not a tick: §Accessibility forbids conveying
            must-have status by colour alone, and "1/2" also says how
            far off the candidate is, which a tick cannot. */}
        <TableCell className="text-center text-xs tabular-nums">
          {mustHaveCount === 0 ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <span className={passTone(s.meetsAllMustHaves)}>
              {mustHaveMet}/{mustHaveCount}
            </span>
          )}
        </TableCell>

        <TableCell>
          <StageBadge stage={app.currentStage} />
        </TableCell>

        <TableCell className="text-right">
          <RowStageMenu
            currentStage={app.currentStage}
            onMove={onMove}
            disabled={busy}
          />
        </TableCell>
      </TableRow>

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
                      <span className={passTone(m.met)}>
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
      {label}{" "}
      <span className={cn("font-medium", FIT_TEXT[fitBand(value)])}>
        {value}
      </span>
    </span>
  );
}

/**
 * The uploaded file's own name, alongside the candidate's.
 *
 * These are often the same string: a manual upload defaults the
 * candidate's name to the filename, so a CV added as
 * `A Candidate.pdf` produces a candidate called "a CA-qualified candidate"
 * until someone edits it. They diverge for anyone who applied through
 * the apply page, where the candidate typed their own name and the file
 * is whatever they happened to attach — and that divergence is exactly
 * what makes the column worth showing: it is how you notice a CV that
 * does not belong to the person who sent it.
 */
function CvFileCell({ filename }: { filename: string | null }) {
  if (!filename) {
    return (
      <TableCell className="text-xs text-muted-foreground">
        <span className="italic">No file</span>
      </TableCell>
    );
  }
  return (
    <TableCell className="max-w-[9rem] truncate text-xs text-muted-foreground">
      <span title={filename}>{filename}</span>
    </TableCell>
  );
}
