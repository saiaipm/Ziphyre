"use client";

import { useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { Copy, RefreshCw, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { regenerateApplyLink } from "../actions";

/** The origin never changes for the life of the page. */
const subscribeToNothing = () => () => {};

/**
 * FR-87, FR-88. What replaced the Google form-setup card: no template,
 * no dropdown to sync, no account to connect. A link.
 */
export function ApplyLink({
  postingId,
  applyToken,
  isClosed,
  hasReadyOpening,
}: {
  postingId: string;
  applyToken: string;
  isClosed: boolean;
  hasReadyOpening: boolean;
}) {
  const [token, setToken] = useState(applyToken);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  // The origin exists only in the browser. Reading it during render
  // (`typeof window === "undefined" ? … : …`) makes the server and
  // client emit different text and fails hydration — which is exactly
  // what happened the first time this was written. useSyncExternalStore
  // is the supported way to hold a browser-only value: it takes an
  // explicit server snapshot, so both passes agree.
  const origin = useSyncExternalStore(
    subscribeToNothing,
    () => window.location.origin,
    () => "",
  );

  const path = `/apply/${token}`;
  const url = origin ? `${origin}${path}` : path;

  async function onCopy() {
    await navigator.clipboard.writeText(url);
    toast.success("Link copied");
  }

  async function onRegenerate() {
    setBusy(true);
    const result = await regenerateApplyLink(postingId);
    setBusy(false);
    setConfirming(false);
    if (result.ok) {
      setToken(result.data.applyToken);
      toast.success("New link generated", {
        description: "The previous link no longer works.",
      });
    } else {
      toast.error("Couldn't regenerate", { description: result.error });
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="border-b border-divider px-6 py-4">
        <h2 className="text-sm font-semibold">Your application link</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Share this wherever you advertise. Candidates apply here — there&rsquo;s
          nothing to set up.
        </p>
      </div>

      <div className="space-y-3 px-6 py-5">
        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-md bg-muted px-3 py-2 font-mono text-xs">
            {url}
          </code>
          <Button size="sm" variant="outline" onClick={onCopy}>
            <Copy className="size-3.5" aria-hidden />
            Copy link
          </Button>
          <Button size="sm" variant="ghost" asChild>
            <a href={`/apply/${token}`} target="_blank" rel="noreferrer">
              <ExternalLink className="size-3.5" aria-hidden />
              Preview
            </a>
          </Button>
        </div>

        {isClosed ? (
          <p className="text-xs text-fit-review">
            This posting is closed. The link no longer accepts applications.
          </p>
        ) : !hasReadyOpening ? (
          <p className="text-xs text-fit-review">
            Add a job description to at least one opening — until then, nobody
            can apply through this link.
          </p>
        ) : null}

        <Button
          size="sm"
          variant="ghost"
          className="text-muted-foreground"
          onClick={() => setConfirming(true)}
        >
          <RefreshCw className="size-3.5" aria-hidden />
          Generate a new link
        </Button>
      </div>

      <Dialog open={confirming} onOpenChange={(open) => !open && setConfirming(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate a new link?</DialogTitle>
            <DialogDescription>
              The current link stops working straight away. Anyone who already
              has it won&rsquo;t be able to apply.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={onRegenerate} disabled={busy}>
              {busy ? "Generating…" : "Generate new link"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
