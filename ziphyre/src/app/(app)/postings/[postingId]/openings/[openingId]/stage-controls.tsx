"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ChevronDown, Loader2, ArrowRightLeft, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  ADMIN_TARGET_STAGES,
  DISPOSITIONS,
  DISPOSITION_LABELS,
  STAGE_ACTION_LABELS,
  STAGE_BADGE,
  STAGE_LABELS,
  type DispositionKey,
  type StageKey,
} from "@/lib/stages";
import type { StageEvent, ReassignTarget } from "@/lib/applications";
import type { OutcomeSendPreview } from "@/lib/mail/outcome";
import {
  loadOutcomeSendPreview,
  loadReassignTargets,
  loadStageHistory,
  reassignApplication,
} from "../../../actions";

// ---------------------------------------------------------------------------
// Stage badge
// ---------------------------------------------------------------------------

/**
 * FR-53 shows stage on every row. Never colour alone (§Accessibility) —
 * the word is the information and the colour only reinforces it.
 *
 * The colours come from `STAGE_BADGE` in `@/lib/stages` rather than
 * being written here, so this badge and the same stage's count in a
 * funnel are the same decision made once. No strikethrough on Rejected —
 * the word already says it, and striking a person's name through is
 * louder than the decision.
 */
export function StageBadge({ stage }: { stage: StageKey }) {
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        STAGE_BADGE[stage],
      )}
    >
      {STAGE_LABELS[stage]}
    </span>
  );
}

// ---------------------------------------------------------------------------
// The move dialog — FR-57, FR-58
// ---------------------------------------------------------------------------

export type PendingMove = {
  applicationIds: string[];
  toStage: StageKey;
  /** Single moves name the candidate; batch moves count them. */
  singleName: string | null;
};

/**
 * Disposition and note are both optional and both skippable, alone or
 * together (FR-57). "Skip" is a real button rather than an implication,
 * because a form that *looks* required gets filled in whether or not it
 * has anything to say — and a pile of invented reasons is worse than
 * none.
 *
 * Shortlisting and moving back never open this: FR-57 scopes
 * disposition to On hold and Rejected, and a dialog whose only content
 * is a confirm button is a speed bump, not a safeguard.
 */
export function StageMoveDialog({
  move,
  onCancel,
  onConfirm,
  saving,
}: {
  move: PendingMove | null;
  onCancel: () => void;
  onConfirm: (
    disposition: DispositionKey | null,
    note: string,
    sendOutcome: boolean,
  ) => void;
  saving: boolean;
}) {
  const [disposition, setDisposition] = useState<DispositionKey | null>(null);
  const [note, setNote] = useState("");
  // FR-109/FR-110: the offer starts unticked. An email to a real person
  // about a rejection is not something a distracted click should cause,
  // and "skippable" is only true if skipping is the resting state.
  const [sendOutcome, setSendOutcome] = useState(false);
  /**
   * Held **with the selection it describes**, so a stale preview is
   * detected at render rather than cleared by an effect. Clearing it in
   * the effect body is the `set-state-in-effect` pattern this codebase
   * bans, and the ban has caught real bugs — here it would mean a set
   * of names briefly belonging to the previous selection.
   */
  const [preview, setPreview] = useState<
    { key: string; data: OutcomeSendPreview } | null
  >(null);

  const count = move?.applicationIds.length ?? 0;
  const isBatch = count > 1;

  // Only rejections carry the offer, so only rejections pay for the
  // lookup. Keyed on the ids so reopening on a different selection
  // re-reads rather than showing the last set of names.
  const isRejection = move?.toStage === "rejected";
  const idKey = move?.applicationIds.join(",") ?? "";

  useEffect(() => {
    if (!isRejection || idKey === "") return;
    let cancelled = false;
    loadOutcomeSendPreview(idKey.split(",")).then((result) => {
      if (!cancelled && result.ok) setPreview({ key: idKey, data: result.data });
    });
    return () => {
      cancelled = true;
    };
  }, [isRejection, idKey]);

  function reset() {
    setDisposition(null);
    setNote("");
    setSendOutcome(false);
    setPreview(null);
  }

  if (!move) return null;

  const verb = STAGE_ACTION_LABELS[move.toStage];
  const who = move.singleName ?? `${count} candidates`;

  // Anything describing a different selection is not an answer about
  // this one, so it reads as still loading.
  const current = preview?.key === idKey ? preview.data : null;
  const emailable =
    current?.recipients.filter((r) => r.email && !r.alreadySent) ?? [];
  const canOffer = Boolean(current?.configured) && emailable.length > 0;
  const willSend = sendOutcome && canOffer;

  // FR-108: the confirmation names how many real people are about to be
  // emailed. A bare "Reject" while a tickbox quietly mails eleven people
  // is exactly the confirmation this requirement refuses.
  const confirmLabel = willSend
    ? emailable.length === 1
      ? `${verb} and email`
      : `${verb} ${count} and email ${emailable.length}`
    : isBatch
      ? `${verb} ${count}`
      : verb;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !saving) {
          reset();
          onCancel();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {move.toStage === "rejected" && isBatch
              ? `Reject ${count} candidates?`
              : `${verb} — ${who}`}
          </DialogTitle>
          <DialogDescription>
            You can move {isBatch ? "them" : "them"} back later. Your decision is
            recorded against your name. Scores never change.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold text-muted-foreground">
              Why? (optional)
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {DISPOSITIONS.map((d) => (
                <button
                  key={d.key}
                  type="button"
                  onClick={() =>
                    setDisposition((prev) => (prev === d.key ? null : d.key))
                  }
                  aria-pressed={disposition === d.key}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs transition-colors",
                    disposition === d.key
                      ? "border-foreground bg-foreground text-background"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-muted-foreground">
              Add a note (optional)
            </p>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="mt-2"
              placeholder={
                isBatch
                  ? "Recorded against each of these candidates."
                  : "Anything worth remembering about this decision."
              }
            />
          </div>

          {isRejection && (
            <OutcomeOffer
              preview={current}
              emailableCount={emailable.length}
              canOffer={canOffer}
              checked={sendOutcome}
              onCheckedChange={setSendOutcome}
              disabled={saving}
            />
          )}
        </div>

        <DialogFooter className="sm:justify-between">
          <Button
            variant="ghost"
            disabled={saving}
            onClick={() => {
              reset();
              // Skip means skip everything the dialog offered, the email
              // included — FR-110's "declining leaves the candidate
              // un-notified".
              onConfirm(null, "", false);
            }}
          >
            Skip
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={saving}
              onClick={() => {
                reset();
                onCancel();
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={saving}
              onClick={() => {
                const d = disposition;
                const n = note;
                const send = willSend;
                reset();
                onConfirm(d, n, send);
              }}
            >
              {saving ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : null}
              {confirmLabel}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * FR-110's offer, and FR-116's version of it when there is nothing to
 * offer with.
 *
 * Everything here is written to be readable *before* the click rather
 * than explained after it: who cannot be reached and why, what address
 * it leaves from, and the exact words that go. An outcome email is the
 * one thing in this product that reaches a stranger and cannot be
 * withdrawn.
 */
function OutcomeOffer({
  preview,
  emailableCount,
  canOffer,
  checked,
  onCheckedChange,
  disabled,
}: {
  preview: OutcomeSendPreview | null;
  emailableCount: number;
  canOffer: boolean;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled: boolean;
}) {
  if (preview === null) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
        Checking who can be emailed…
      </div>
    );
  }

  // FR-116. Say so plainly and offer the fix, rather than letting them
  // tick a box that would fail at the moment of sending.
  if (!preview.configured) {
    return (
      <div className="rounded-lg border border-border px-3 py-2.5 text-xs">
        <p className="font-medium">No sending address is set up yet.</p>
        <p className="mt-1 text-muted-foreground">
          The rejection will be recorded, but nobody will be told.{" "}
          <Link
            href="/settings/communications"
            className="underline underline-offset-2 hover:text-foreground"
          >
            Set up sending
          </Link>{" "}
          to email candidates.
        </p>
      </div>
    );
  }

  const alreadyTold = preview.recipients.filter((r) => r.alreadySent);
  const unreachable = preview.recipients.filter((r) => !r.email && !r.alreadySent);

  if (!canOffer) {
    return (
      <div className="rounded-lg border border-border px-3 py-2.5 text-xs text-muted-foreground">
        {alreadyTold.length > 0 && unreachable.length === 0
          ? "Already told the outcome — there is nothing left to send."
          : "No email address on file, so this can only be recorded, not sent. Candidates added by CV upload have no address."}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border px-3 py-2.5">
      <label className="flex items-start gap-2 text-sm">
        <Checkbox
          checked={checked}
          onCheckedChange={(v) => onCheckedChange(v === true)}
          disabled={disabled}
          className="mt-0.5"
        />
        <span>
          <span className="flex items-center gap-1.5 font-medium">
            <Mail className="size-3.5" aria-hidden />
            Email {emailableCount === 1 ? "them" : `${emailableCount} of them`}{" "}
            the outcome
          </span>
          <span className="mt-1 block text-xs text-muted-foreground">
            {/* FR-108, in the place the decision is made. */}
            Sent from {preview.fromEmail}. <strong>This cannot be unsent.</strong>{" "}
            Their status page shows the decision only once it has gone.
          </span>
        </span>
      </label>

      {(alreadyTold.length > 0 || unreachable.length > 0) && (
        <ul className="mt-2 space-y-0.5 border-t border-border pt-2 text-xs text-muted-foreground">
          {alreadyTold.map((r) => (
            <li key={r.applicationId}>
              {r.candidateName} — already told, not emailed again.
            </li>
          ))}
          {unreachable.map((r) => (
            <li key={r.applicationId}>
              {r.candidateName} — no email address on file.
            </li>
          ))}
        </ul>
      )}

      {preview.sample && (
        <details className="mt-2 border-t border-border pt-2 text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            Read what will be sent
          </summary>
          <p className="mt-2 font-medium">{preview.sample.subject}</p>
          <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
            {preview.sample.body}
          </p>
        </details>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Batch bar — FR-56
// ---------------------------------------------------------------------------

export function BatchBar({
  count,
  onMove,
  onClear,
  disabled,
}: {
  count: number;
  onMove: (stage: StageKey) => void;
  onClear: () => void;
  disabled: boolean;
}) {
  if (count === 0) return null;

  return (
    <div className="sticky bottom-4 z-10 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-4 py-3 shadow-lg">
      <span className="text-sm font-medium">{count} selected</span>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={disabled} onClick={() => onMove("shortlisted")}>
          Shortlist
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() => onMove("on_hold")}
        >
          Put on hold
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() => onMove("rejected")}
        >
          Reject
        </Button>
      </div>
      <Button
        size="sm"
        variant="ghost"
        className="ml-auto text-muted-foreground"
        onClick={onClear}
        disabled={disabled}
      >
        Clear selection
      </Button>
    </div>
  );
}

/** The row's own control. Same action, one candidate — FR-56. */
export function RowStageMenu({
  currentStage,
  onMove,
  disabled,
}: {
  currentStage: StageKey;
  onMove: (stage: StageKey) => void;
  disabled: boolean;
}) {
  const options = ADMIN_TARGET_STAGES.filter((s) => s !== currentStage);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled}
          className="h-7 gap-1 px-2 text-xs text-muted-foreground"
          onClick={(e) => e.stopPropagation()}
        >
          Move
          <ChevronDown className="size-3" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {options.map((stage) => (
          <DropdownMenuItem
            key={stage}
            onClick={(e) => {
              e.stopPropagation();
              onMove(stage);
            }}
          >
            {STAGE_ACTION_LABELS[stage]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function SelectCheckbox({
  checked,
  onCheckedChange,
  label,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <Checkbox
      checked={checked}
      onCheckedChange={(v) => onCheckedChange(v === true)}
      aria-label={label}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

// ---------------------------------------------------------------------------
// Stage history — FR-59
// ---------------------------------------------------------------------------

/**
 * Loaded when the assessment dialog opens rather than with the list —
 * it is a per-candidate question, and fetching it for fifty rows to
 * show it for one is work nobody asked for.
 */
export function StageHistoryPanel({
  applicationId,
  open,
  reloadKey,
}: {
  applicationId: string;
  open: boolean;
  /** Bump to re-fetch after a move made from inside the dialog. */
  reloadKey: number;
}) {
  const [events, setEvents] = useState<StageEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    loadStageHistory(applicationId).then((result) => {
      if (cancelled) return;
      if (result.ok) setEvents(result.data);
      else setError(result.error);
    });
    return () => {
      cancelled = true;
    };
  }, [applicationId, open, reloadKey]);

  if (error) {
    return <p className="text-xs text-muted-foreground">{error}</p>;
  }

  if (events === null) {
    return (
      <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
    );
  }

  if (events.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No stage changes yet.
      </p>
    );
  }

  return (
    <ol className="space-y-2">
      {events.map((e) => (
        <li key={e.id} className="text-sm">
          <div className="flex flex-wrap items-baseline gap-x-1.5">
            <span className="font-medium">
              {e.fromStage ? `${STAGE_LABELS[e.fromStage]} → ` : ""}
              {STAGE_LABELS[e.toStage]}
            </span>
            <span className="text-muted-foreground">
              {e.actorKind === "system"
                ? "automatically, when screening finished"
                : `by ${e.actorName ?? "an admin"}`}
              {" · "}
              {new Date(e.createdAt).toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </span>
          </div>
          {e.disposition && (
            <Badge variant="secondary" className="mt-1">
              {DISPOSITION_LABELS[e.disposition]}
            </Badge>
          )}
          {e.note && (
            <p className="mt-1 text-muted-foreground italic">{e.note}</p>
          )}
        </li>
      ))}
    </ol>
  );
}

// ---------------------------------------------------------------------------
// Reassignment — FR-60
// ---------------------------------------------------------------------------

/**
 * FR-60. Openings on the same posting only. An opening the candidate
 * has already applied to is listed but not selectable, with the reason
 * shown — tech spec §9 requires the collision to be explained rather
 * than met as a constraint error, and explaining it before the click
 * beats explaining it after.
 */
export function ReassignDialog({
  applicationId,
  candidateName,
  postingId,
  fromOpeningId,
  onDone,
}: {
  applicationId: string;
  candidateName: string;
  postingId: string;
  fromOpeningId: string;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [targets, setTargets] = useState<ReassignTarget[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [rescreen, setRescreen] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    loadReassignTargets(applicationId).then((result) => {
      if (cancelled) return;
      setTargets(result.ok ? result.data : []);
    });
    return () => {
      cancelled = true;
    };
  }, [applicationId, open]);

  async function onConfirm() {
    if (!selected) return;
    setSaving(true);
    const result = await reassignApplication({
      applicationId,
      targetOpeningId: selected,
      rescreen,
      postingId,
      fromOpeningId,
    });
    setSaving(false);

    if (!result.ok) {
      toast.error("Couldn't move this candidate", { description: result.error });
      return;
    }

    setOpen(false);
    toast.success(`Moved to ${result.data.openingTitle}`, {
      description: result.data.rescreening
        ? "Rescreening against that opening's job description now."
        : "Their existing score was produced against the previous opening's job description.",
    });
    onDone();
  }

  const target = targets?.find((t) => t.id === selected);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() => setOpen(true)}
      >
        <ArrowRightLeft className="size-3.5" aria-hidden />
        Move to another opening
      </Button>

      <Dialog open={open} onOpenChange={(v) => !saving && setOpen(v)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Move {candidateName} to another opening</DialogTitle>
            <DialogDescription>
              Openings on this posting. Their application, CV and history move
              with them.
            </DialogDescription>
          </DialogHeader>

          {targets === null ? (
            <Loader2
              className="size-4 animate-spin text-muted-foreground"
              aria-hidden
            />
          ) : targets.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              This posting has only one opening, so there is nowhere to move
              them. Add another opening first.
            </p>
          ) : (
            <div className="space-y-3">
              <ul className="space-y-1.5">
                {targets.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      disabled={t.alreadyApplied}
                      onClick={() => setSelected(t.id)}
                      className={cn(
                        "w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                        t.alreadyApplied
                          ? "cursor-not-allowed border-border opacity-60"
                          : selected === t.id
                            ? "border-foreground bg-muted"
                            : "border-border hover:bg-muted/50",
                      )}
                    >
                      <span className="font-medium">{t.title}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {t.workLocation}
                      </span>
                      {t.alreadyApplied && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Already applied here — one application per candidate
                          per opening.
                        </p>
                      )}
                    </button>
                  </li>
                ))}
              </ul>

              <label className="flex items-start gap-2 text-sm">
                <Checkbox
                  checked={rescreen}
                  onCheckedChange={(v) => setRescreen(v === true)}
                  className="mt-0.5"
                />
                <span>
                  Rescreen against that role&rsquo;s job description
                  <span className="block text-xs text-muted-foreground">
                    Without this, their score stays as it was — measured
                    against the opening they are leaving.
                  </span>
                </span>
              </label>
            </div>
          )}

          {targets !== null && targets.length > 0 && (
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button onClick={onConfirm} disabled={!selected || saving}>
                {saving ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                ) : null}
                {target ? `Move to ${target.title}` : "Move"}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
