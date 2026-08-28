"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2, RotateCcw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { MESSAGE_KIND_LABELS } from "@/lib/mail/templates";
import type { OutboxRow } from "@/lib/mail/outbox";
import { retryMessage } from "./actions";

/**
 * FR-133's list, and FR-111's failure surface.
 *
 * **The status column says "Sent", never "Delivered".** FR-112 is
 * explicit that Ziphyre reports what it sent and never claims knowledge
 * it does not have — the mail server accepting a message is not the same
 * as a person receiving it, and a column that blurred the two would be
 * the product lying quietly.
 */

const STATUS_TONE: Record<OutboxRow["status"], string> = {
  sent: "text-fit-strong",
  queued: "text-muted-foreground",
  failed: "text-fit-weak",
};

const STATUS_LABEL: Record<OutboxRow["status"], string> = {
  sent: "Sent",
  queued: "Sending…",
  failed: "Failed",
};

export function OutboxTable({ rows }: { rows: OutboxRow[] }) {
  const [retrying, setRetrying] = useState<string | null>(null);

  async function onRetry(id: string) {
    setRetrying(id);
    const result = await retryMessage(id);
    setRetrying(null);
    if (result.ok) toast.success("Queued to send again");
    else toast.error("Couldn't retry", { description: result.error });
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-border px-4 py-10 text-center">
        <p className="text-sm font-medium">Nothing sent yet</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Messages appear here once a candidate applies, or once you send one
          from a pipeline. Ziphyre never emails anyone on its own.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Candidate</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Message</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>When</TableHead>
            <TableHead>Sent by</TableHead>
            <TableHead className="w-8">
              <span className="sr-only">Retry</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="text-base font-medium">
                {row.purged ? (
                  <span className="text-muted-foreground italic">
                    Details deleted
                  </span>
                ) : (
                  (row.candidateName ?? "Unknown")
                )}
                {!row.purged && (
                  <span className="block text-xs text-muted-foreground">
                    {row.toEmail}
                  </span>
                )}
              </TableCell>

              <TableCell className="text-sm text-muted-foreground">
                {row.postingId && row.openingId ? (
                  <Link
                    href={`/postings/${row.postingId}/openings/${row.openingId}`}
                    className="underline-offset-2 hover:underline"
                  >
                    {row.roleTitle}
                  </Link>
                ) : (
                  (row.roleTitle ?? "—")
                )}
              </TableCell>

              <TableCell className="text-sm">
                {MESSAGE_KIND_LABELS[row.kind] ?? row.kind}
              </TableCell>

              <TableCell>
                <span
                  className={cn("text-sm font-medium", STATUS_TONE[row.status])}
                >
                  {STATUS_LABEL[row.status]}
                </span>
                {/* FR-111: the reason in plain language, against the
                    candidate it was meant for — never a silent failure. */}
                {row.status === "failed" && row.error && (
                  <span className="mt-0.5 flex max-w-xs items-start gap-1 text-xs text-muted-foreground">
                    <AlertTriangle
                      className="mt-0.5 size-3 shrink-0"
                      aria-hidden
                    />
                    {row.error}
                  </span>
                )}
              </TableCell>

              <TableCell className="text-sm whitespace-nowrap text-muted-foreground">
                {new Date(row.sentAt ?? row.createdAt).toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </TableCell>

              <TableCell className="text-sm text-muted-foreground">
                {/* FR-117's confirmation is the only message no person
                    chose to send, and saying so is more honest than a
                    blank cell. */}
                {row.sentByName ?? (
                  <span className="italic">Automatic</span>
                )}
              </TableCell>

              <TableCell>
                {row.status === "failed" && !row.purged && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 px-2 text-xs"
                    disabled={retrying === row.id}
                    onClick={() => onRetry(row.id)}
                  >
                    {retrying === row.id ? (
                      <Loader2 className="size-3.5 animate-spin" aria-hidden />
                    ) : (
                      <RotateCcw className="size-3.5" aria-hidden />
                    )}
                    Retry
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
