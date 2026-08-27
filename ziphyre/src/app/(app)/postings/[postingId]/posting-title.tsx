"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDay } from "@/lib/format-date";
import { updatePostingName } from "../actions";

export function PostingTitle({
  postingId,
  name,
  openingCount,
  isClosed,
  createdAt,
  closedAt,
}: {
  postingId: string;
  name: string;
  openingCount: number;
  isClosed: boolean;
  createdAt: string;
  closedAt: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [nameVal, setNameVal] = useState(name);
  const [saving, setSaving] = useState(false);

  async function onSave() {
    setSaving(true);
    const result = await updatePostingName({ postingId, name: nameVal });
    setSaving(false);
    if (result.ok) {
      toast.success("Renamed");
      setEditing(false);
    } else {
      toast.error("Couldn't rename", { description: result.error });
    }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <Input
          value={nameVal}
          onChange={(e) => setNameVal(e.target.value)}
          className="h-auto max-w-sm text-[28px] font-semibold"
          autoFocus
        />
        <Button size="sm" onClick={onSave} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setNameVal(name);
            setEditing(false);
          }}
          disabled={saving}
        >
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2.5">
        <h1 className="text-[28px] leading-tight font-semibold">{name}</h1>
        {isClosed && (
          <span className="rounded-full bg-fit-rejected-bg px-2.5 py-0.5 text-xs font-medium text-fit-rejected">
            Closed
          </span>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={() => setEditing(true)}
          aria-label="Rename posting"
        >
          <Pencil className="size-3.5" aria-hidden />
        </Button>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {openingCount} {openingCount === 1 ? "opening" : "openings"}
        {" · "}
        {/* When the hunt started — the first thing asked of a posting
            that has been open a while, and the number every "how long
            has this been running?" question is measured from. */}
        Created {formatDay(createdAt)}
        {isClosed && closedAt && <> · Closed {formatDay(closedAt)}</>}
      </p>
    </div>
  );
}
