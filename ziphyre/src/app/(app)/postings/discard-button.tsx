"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Leaves a half-filled create form without submitting it.
 *
 * Confirms only when something has actually been typed. A job
 * description is usually a long paste, and losing it to a stray click
 * on the way out is a worse outcome than one extra dialog — but making
 * someone confirm their way out of an empty form is just friction.
 */
export function DiscardButton({
  dirty,
  backHref,
  label = "Cancel",
}: {
  dirty: boolean;
  backHref: string;
  label?: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);

  function leave() {
    setConfirming(false);
    router.push(backHref);
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        onClick={() => (dirty ? setConfirming(true) : leave())}
      >
        {label}
      </Button>

      <Dialog open={confirming} onOpenChange={(open) => !open && setConfirming(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Discard this draft?</DialogTitle>
            <DialogDescription>
              Nothing has been created yet. What you&rsquo;ve typed here,
              including the job description, will be lost.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)}>
              Keep editing
            </Button>
            <Button variant="destructive" onClick={leave}>
              Discard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
