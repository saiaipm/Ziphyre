"use client";

import { useState } from "react";
import { toast } from "sonner";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { closePosting, reopenPosting, deletePosting } from "../actions";

export function PostingActions({
  postingId,
  postingName,
  isClosed,
}: {
  postingId: string;
  postingName: string;
  isClosed: boolean;
}) {
  const [confirming, setConfirming] = useState<"close" | "delete" | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  async function onReopen() {
    setBusy(true);
    const result = await reopenPosting(postingId);
    setBusy(false);
    if (result.ok) {
      toast.success("Posting reopened");
    } else {
      toast.error("Couldn't reopen", { description: result.error });
    }
  }

  async function onConfirmClose() {
    setBusy(true);
    const result = await closePosting(postingId);
    setBusy(false);
    setConfirming(null);
    if (result.ok) {
      toast.success("Posting closed");
    } else {
      toast.error("Couldn't close", { description: result.error });
    }
  }

  async function onConfirmDelete() {
    setBusy(true);
    const result = await deletePosting(postingId);
    // deletePosting redirects on success — it never returns {ok:true}
    // to this branch. Only a failure produces a value to react to.
    if (!result.ok) {
      setBusy(false);
      setConfirming(null);
      toast.error("Couldn't delete", { description: result.error });
    }
  }

  return (
    <>
      <div className="flex items-center gap-2">
        {isClosed ? (
          <Button variant="outline" size="sm" onClick={onReopen} disabled={busy}>
            Reopen posting
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfirming("close")}
          >
            Close posting
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8" aria-label="More actions">
              <MoreHorizontal className="size-4" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              variant="destructive"
              onSelect={(e) => {
                e.preventDefault();
                setConfirming("delete");
              }}
            >
              Delete posting
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Dialog
        open={confirming === "close"}
        onOpenChange={(open) => !open && setConfirming(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Close this posting?</DialogTitle>
            <DialogDescription>
              New applications will stop arriving. Everyone already in the
              pipeline stays exactly as they are.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirming(null)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button onClick={onConfirmClose} disabled={busy}>
              {busy ? "Closing…" : "Close posting"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirming === "delete"}
        onOpenChange={(open) => !open && setConfirming(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete &ldquo;{postingName}&rdquo;?</DialogTitle>
            <DialogDescription>
              No one has applied yet — nothing else is affected. This cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirming(null)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={onConfirmDelete}
              disabled={busy}
            >
              {busy ? "Deleting…" : "Delete permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
