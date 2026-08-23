"use client";

import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { assignUnmatched } from "../actions";

export type UnmatchedItem = {
  id: string;
  claimedOption: string | null;
  candidateName: string | null;
  candidateEmail: string | null;
};

/**
 * FR-28/FR-29. Held at the top of the posting, never inside an opening's
 * pipeline — an unmatched submission doesn't belong to an opening yet, and
 * filing it under one would be a guess (§9).
 */
export function UnmatchedQueue({
  items,
  openings,
}: {
  items: UnmatchedItem[];
  openings: { id: string; title: string }[];
}) {
  if (items.length === 0) return null;

  return (
    <section className="rounded-lg border border-amber-200 bg-fit-review-bg dark:border-amber-900/40">
      <div className="flex items-start gap-3 border-b border-amber-200/60 px-6 py-4 dark:border-amber-900/30">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-fit-review" aria-hidden />
        <p className="text-sm text-amber-900 dark:text-amber-100">
          {items.length} application{items.length === 1 ? "" : "s"} named a role
          that isn&rsquo;t in this posting. Assign them to continue.
        </p>
      </div>
      <ul className="divide-y divide-amber-200/60 dark:divide-amber-900/30">
        {items.map((item) => (
          <UnmatchedRow key={item.id} item={item} openings={openings} />
        ))}
      </ul>
    </section>
  );
}

function UnmatchedRow({
  item,
  openings,
}: {
  item: UnmatchedItem;
  openings: { id: string; title: string }[];
}) {
  const [openingId, setOpeningId] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  async function onAssign() {
    if (!openingId) return;
    setBusy(true);
    const result = await assignUnmatched({ submissionId: item.id, openingId });
    setBusy(false);
    if (result.ok) {
      toast.success("Assigned — screening starts now");
    } else {
      toast.error("Couldn't assign", { description: result.error });
    }
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-6 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">
          {item.candidateName ?? item.candidateEmail ?? "Unknown candidate"}
        </p>
        <p className="text-xs text-muted-foreground">
          Applied for &ldquo;{item.claimedOption ?? "nothing"}&rdquo;
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Select value={openingId} onValueChange={setOpeningId}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Assign to an opening" />
          </SelectTrigger>
          <SelectContent>
            {openings.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={onAssign} disabled={busy || !openingId}>
          {busy ? "Assigning…" : "Assign"}
        </Button>
      </div>
    </li>
  );
}
