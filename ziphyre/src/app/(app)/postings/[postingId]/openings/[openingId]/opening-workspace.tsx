"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Sparkles,
  Plus,
  X,
  Pencil,
  Upload,
  Download,
  Loader2,
  AlertTriangle,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatDay } from "@/lib/format-date";
import { modelLabel } from "@/lib/ai/providers";
import type { ApplicationListItem } from "@/lib/applications";
import {
  updateOpeningDetails,
  updateOpeningJd,
  uploadOpeningJd,
  extractRequirementsForOpening,
  saveRequirements,
  updateOpeningBookingUrl,
} from "../../../actions";
import { CandidatesCard } from "./candidates-card";

type Requirement = {
  id: string;
  text: string;
  kind: "must_have" | "preferred";
};

type Props = {
  openingId: string;
  postingId: string;
  title: string;
  workLocation: string;
  createdAt: string;
  bookingUrl: string | null;
  orgBookingUrl: string | null;
  jdContent: string | null;
  jdVersion: number | null;
  initialRequirements: Requirement[];
  initialApplications: ApplicationListItem[];
};

export function OpeningWorkspace({
  openingId,
  postingId,
  title,
  workLocation,
  createdAt,
  bookingUrl,
  orgBookingUrl,
  jdContent,
  jdVersion,
  initialRequirements,
  initialApplications,
}: Props) {
  // Setup and the pipeline are different jobs done at different times:
  // the JD and its requirements are settled once, then Meera returns
  // daily to work the pile. Stacking them on one scroll made the daily
  // task sit below the one-off one.
  //
  // Pipeline leads as soon as anyone has applied — FR-78 says choosing
  // an opening from home opens its *pipeline*, and an opening with no
  // applications has nothing to open, so Setup is the honest landing
  // place only while it is still empty.
  const hasApplications = initialApplications.length > 0;

  return (
    <div className="space-y-6">
      <DetailsCard
        openingId={openingId}
        title={title}
        workLocation={workLocation}
        createdAt={createdAt}
      />

      <Tabs defaultValue={hasApplications ? "pipeline" : "setup"}>
        <TabsList>
          <TabsTrigger value="pipeline">
            Pipeline
            {hasApplications && (
              <Badge variant="secondary" className="ml-1.5">
                {initialApplications.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="setup">Setup</TabsTrigger>
        </TabsList>

        <TabsContent value="pipeline" className="space-y-6">
          <CandidatesCard
            openingId={openingId}
            postingId={postingId}
            initialApplications={initialApplications}
          />
        </TabsContent>

        <TabsContent value="setup" className="space-y-6">
          <JdCard openingId={openingId} jdContent={jdContent} jdVersion={jdVersion} />
          <RequirementsCard
            openingId={openingId}
            hasJd={Boolean(jdContent)}
            initialRequirements={initialRequirements}
          />
          <BookingCard
            openingId={openingId}
            postingId={postingId}
            bookingUrl={bookingUrl}
            orgBookingUrl={orgBookingUrl}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Title / location
// ---------------------------------------------------------------------------

function DetailsCard({
  openingId,
  title,
  workLocation,
  createdAt,
}: {
  openingId: string;
  title: string;
  workLocation: string;
  createdAt: string;
}) {
  const [editing, setEditing] = useState(false);
  const [titleVal, setTitleVal] = useState(title);
  const [locationVal, setLocationVal] = useState(workLocation);
  const [saving, setSaving] = useState(false);

  async function onSave() {
    setSaving(true);
    const result = await updateOpeningDetails({
      openingId,
      title: titleVal,
      workLocation: locationVal,
    });
    setSaving(false);
    if (result.ok) {
      toast.success("Updated");
      setEditing(false);
    } else {
      toast.error("Couldn't save", { description: result.error });
    }
  }

  if (!editing) {
    return (
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[28px] leading-tight font-semibold">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {workLocation} · Created {formatDay(createdAt)}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
          <Pencil className="size-3.5" aria-hidden />
          Edit
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card px-5 py-4">
      <Input value={titleVal} onChange={(e) => setTitleVal(e.target.value)} />
      <Input
        value={locationVal}
        onChange={(e) => setLocationVal(e.target.value)}
      />
      <div className="flex gap-2">
        <Button size="sm" onClick={onSave} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setTitleVal(title);
            setLocationVal(workLocation);
            setEditing(false);
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Job description
// ---------------------------------------------------------------------------

function JdCard({
  openingId,
  jdContent,
  jdVersion,
}: {
  openingId: string;
  jdContent: string | null;
  jdVersion: number | null;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(jdContent ?? "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onUpload(file: File) {
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    const result = await uploadOpeningJd(openingId, formData);
    setUploading(false);
    if (result.ok) {
      toast.success("Job description uploaded", {
        description: `Read ${result.data.characters.toLocaleString()} characters. Saved as a new version.`,
      });
    } else {
      toast.error("Couldn't read that file", { description: result.error });
    }
  }

  /** Exports what is actually stored — the extracted text, not the
      original file, which is the version screening was run against. */
  function onExport() {
    const blob = new Blob([jdContent ?? ""], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `job-description-v${jdVersion ?? 1}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onSave() {
    setSaving(true);
    const result = await updateOpeningJd({ openingId, jdContent: draft });
    setSaving(false);
    if (result.ok) {
      toast.success("Job description updated", {
        description:
          "This is a new version. Existing requirement suggestions are unaffected until you ask for new ones.",
      });
      setEditing(false);
    } else {
      toast.error("Couldn't save", { description: result.error });
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-divider px-6 py-4">
        <div>
          <h2 className="text-sm font-semibold">Job description</h2>
          {jdVersion && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Version {jdVersion}
            </p>
          )}
        </div>
        {!editing && (
          <div className="flex items-center gap-1">
            {jdContent && (
              <Button variant="ghost" size="sm" onClick={onExport}>
                <Download className="size-3.5" aria-hidden />
                Download
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
            >
              <Upload className="size-3.5" aria-hidden />
              {uploading ? "Reading…" : "Upload"}
            </Button>
            {jdContent && (
              <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
                <Pencil className="size-3.5" aria-hidden />
                Edit
              </Button>
            )}
          </div>
        )}
      </div>

      {/* FR-7 has always allowed a document; only the paste half was
          built. The file is parsed to text and stored as an ordinary
          new version — we keep the words, not the file, because
          everything downstream already works on text. */}
      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.docx,.md,.markdown,.txt"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void onUpload(file);
        }}
      />
      <div className="px-6 py-5">
        {editing ? (
          <div className="space-y-3">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={12}
              className="font-mono text-xs"
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={onSave} disabled={saving}>
                {saving ? "Saving…" : "Save new version"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setDraft(jdContent ?? "");
                  setEditing(false);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : jdContent ? (
          <p className="max-h-64 overflow-y-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-muted-foreground">
            {jdContent}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            No job description yet. Upload a PDF, Word, Markdown or text file,
            or{" "}
            <button
              type="button"
              className="underline underline-offset-2 hover:text-foreground"
              onClick={() => setEditing(true)}
            >
              paste it as text
            </button>
            .
          </p>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Requirements
// ---------------------------------------------------------------------------

function RequirementsCard({
  openingId,
  hasJd,
  initialRequirements,
}: {
  openingId: string;
  hasJd: boolean;
  initialRequirements: Requirement[];
}) {
  const [items, setItems] = useState<Requirement[]>(initialRequirements);
  const [extracting, setExtracting] = useState(false);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [usedModel, setUsedModel] = useState<string | null>(null);
  const [attemptedAutoExtract, setAttemptedAutoExtract] = useState(
    initialRequirements.length > 0,
  );
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const autoRan = useRef(false);

  const mustHaveCount = items.filter((i) => i.kind === "must_have").length;

  async function runExtraction() {
    setExtracting(true);
    setExtractionError(null);
    const result = await extractRequirementsForOpening(openingId);
    setExtracting(false);
    setAttemptedAutoExtract(true);

    if (!result.ok) {
      setExtractionError(result.error);
      return;
    }

    const suggested = result.data.suggestions.map((text) => ({
      id: crypto.randomUUID(),
      text,
      kind: "preferred" as const,
    }));
    setItems((prev) => [...prev, ...suggested]);
    if (suggested.length > 0) setDirty(true);

    setUsedModel(modelLabel(result.data.usedProvider, result.data.usedModel));

    // A silent fallback is the failure mode worth naming: the admin
    // asked for one model and quietly got another.
    if (result.data.fellBack) {
      toast.info("Used a fallback provider", {
        description: `Your primary provider failed, so ${modelLabel(
          result.data.usedProvider,
          result.data.usedModel,
        )} produced these suggestions instead.`,
      });
    }
  }

  // FR-13: proposes a list the moment a JD exists and nothing has been
  // extracted yet. Never re-runs itself — a manual re-suggest is a
  // deliberate action below, not something that fires on every visit.
  useEffect(() => {
    if (autoRan.current) return;
    if (hasJd && !attemptedAutoExtract) {
      autoRan.current = true;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; the setState calls happen inside the async AI call's result handling, not synchronously in the effect body
      void runExtraction();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateItem(id: string, patch: Partial<Requirement>) {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    );
    setDirty(true);
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    setDirty(true);
  }

  function addRow() {
    setItems((prev) => [
      ...prev,
      { id: crypto.randomUUID(), text: "", kind: "preferred" },
    ]);
    setDirty(true);
  }

  async function onSave() {
    setSaving(true);
    const result = await saveRequirements({
      openingId,
      requirements: items.map((i) => ({ text: i.text, kind: i.kind })),
    });
    setSaving(false);
    if (result.ok) {
      toast.success("Requirements saved");
      setDirty(false);
    } else {
      toast.error("Couldn't save", { description: result.error });
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="border-b border-divider px-6 py-4">
        <div className="flex items-center gap-1.5">
          <h2 className="text-sm font-semibold">What matters for this role?</h2>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info
                className="size-3.5 cursor-help text-muted-foreground"
                aria-label="Why this matters"
              />
            </TooltipTrigger>
            <TooltipContent className="max-w-64">
              Job descriptions don&rsquo;t always say which requirements are
              firm. Marking them means the ranking reflects what you actually
              need.
            </TooltipContent>
          </Tooltip>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          We&rsquo;ve pulled these from your job description. Edit anything
          that&rsquo;s wrong, delete what doesn&rsquo;t matter, and mark
          what&rsquo;s non-negotiable.
        </p>
      </div>

      <div className="px-6 py-5">
        {!hasJd ? (
          <p className="text-sm text-muted-foreground">
            Attach a job description above to get requirement suggestions.
          </p>
        ) : extracting && items.length === 0 ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Reading your job description…
          </div>
        ) : (
          <div className="space-y-4">
            {extractionError && (
              <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-fit-review-bg px-4 py-3 dark:border-amber-900/40">
                <AlertTriangle
                  className="mt-0.5 size-4 shrink-0 text-fit-review"
                  aria-hidden
                />
                <div className="flex-1 text-sm text-amber-900 dark:text-amber-100">
                  <p>Couldn&rsquo;t generate suggestions: {extractionError}</p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2"
                    onClick={runExtraction}
                    disabled={extracting}
                  >
                    Try again
                  </Button>
                </div>
              </div>
            )}

            {!extractionError && items.length === 0 && attemptedAutoExtract && (
              <p className="text-sm text-muted-foreground">
                We couldn&rsquo;t pull clear requirements from this job
                description. Add them yourself below — a few lines is enough.
              </p>
            )}

            {items.length > 0 && (
              <ul className="space-y-2">
                {items.map((item) => (
                  <RequirementRow
                    key={item.id}
                    item={item}
                    onChange={(patch) => updateItem(item.id, patch)}
                    onRemove={() => removeItem(item.id)}
                  />
                ))}
              </ul>
            )}

            {items.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {mustHaveCount === 0
                  ? "No must-haves set. Every candidate will pass the must-have check."
                  : `${mustHaveCount} must-have${mustHaveCount === 1 ? "" : "s"} of ${items.length}.`}
                {usedModel && <> Suggested by {usedModel}.</>}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={addRow}>
                <Plus className="size-3.5" aria-hidden />
                Add a requirement
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={runExtraction}
                disabled={extracting}
              >
                <Sparkles className="size-3.5" aria-hidden />
                {extracting ? "Suggesting…" : "Suggest requirements again"}
              </Button>
              <div className="flex-1" />
              <Button size="sm" onClick={onSave} disabled={saving || !dirty}>
                {saving ? "Saving…" : "Save requirements"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function RequirementRow({
  item,
  onChange,
  onRemove,
}: {
  item: Requirement;
  onChange: (patch: Partial<Requirement>) => void;
  onRemove: () => void;
}) {
  return (
    <li className="flex items-center gap-2">
      <Input
        value={item.text}
        onChange={(e) => onChange({ text: e.target.value })}
        placeholder="e.g. Qualified Chartered Accountant"
        className="flex-1"
      />
      <div className="flex shrink-0 gap-1 rounded-md bg-muted p-1">
        {(["must_have", "preferred"] as const).map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => onChange({ kind })}
            className={cn(
              "rounded px-2.5 py-1 text-xs font-medium transition-colors",
              item.kind === kind
                ? kind === "must_have"
                  ? "bg-fit-accent-bg text-fit-accent"
                  : "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {kind === "must_have" ? "Must-have" : "Preferred"}
          </button>
        ))}
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="size-8 shrink-0"
        onClick={onRemove}
        aria-label="Remove requirement"
      >
        <X className="size-3.5" aria-hidden />
      </Button>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Interview booking link — FR-130, FR-131
// ---------------------------------------------------------------------------

/**
 * The link an interview invite carries for this role.
 *
 * Blank means the organisation's link is used — the opening stores no
 * copy of it, so changing the default in Settings reaches every opening
 * that never set its own. The card says which one is actually in effect,
 * because "inherited" and "empty" look identical in a text field and
 * only one of them means an invite cannot be sent.
 */
function BookingCard({
  openingId,
  postingId,
  bookingUrl,
  orgBookingUrl,
}: {
  openingId: string;
  postingId: string;
  bookingUrl: string | null;
  orgBookingUrl: string | null;
}) {
  const [value, setValue] = useState(bookingUrl ?? "");
  const [saving, setSaving] = useState(false);

  const effective = value.trim() || orgBookingUrl;

  async function onSave() {
    setSaving(true);
    const result = await updateOpeningBookingUrl({
      openingId,
      postingId,
      bookingUrl: value,
    });
    setSaving(false);
    if (result.ok) {
      toast.success(
        value.trim()
          ? "Booking link saved for this opening"
          : "Using the organisation's booking link",
      );
    } else {
      toast.error("Couldn't save", { description: result.error });
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="border-b border-divider px-6 py-4">
        <h2 className="text-sm font-semibold">Interview booking link</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Where candidates pick a time when you send an interview invite for
          this role.
        </p>
      </div>

      <div className="space-y-3 px-6 py-5">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={
            orgBookingUrl
              ? `Leave blank to use ${orgBookingUrl}`
              : "https://calendar.app.google/…"
          }
        />

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={onSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
          {value.trim() && (
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground"
              onClick={() => setValue("")}
              disabled={saving}
            >
              Use the organisation&rsquo;s link
            </Button>
          )}
        </div>

        {effective ? (
          <p className="text-xs text-muted-foreground">
            Invites for this role will point at{" "}
            <span className="font-medium text-foreground">{effective}</span>
            {!value.trim() && " — the organisation's link"}.
          </p>
        ) : (
          <p className="flex items-start gap-1.5 text-xs text-fit-review">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            No booking link set here or in Settings, so an interview invite
            can&rsquo;t be sent for this role yet.
          </p>
        )}
      </div>
    </section>
  );
}
