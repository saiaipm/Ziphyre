"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { addOpeningToPosting } from "../../../actions";
import { DiscardButton } from "../../../discard-button";

export function NewOpeningForm({ postingId }: { postingId: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [workLocation, setWorkLocation] = useState("");
  const [jdContent, setJdContent] = useState("");
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const result = await addOpeningToPosting({
      postingId,
      openingTitle: title,
      workLocation,
      jdContent,
    });
    setSaving(false);

    if (result.ok) {
      toast.success("Opening added");
      router.push(`/postings/${postingId}/openings/${result.data.openingId}`);
    } else {
      toast.error("Couldn't add opening", { description: result.error });
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <section className="rounded-lg border border-border bg-card">
        <div className="space-y-5 px-6 py-5">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              Role title <span className="text-destructive">*</span>
            </Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Social Media Manager"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              Work location <span className="text-destructive">*</span>
            </Label>
            <Input
              value={workLocation}
              onChange={(e) => setWorkLocation(e.target.value)}
              placeholder="Hyderabad"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              Job description <span className="text-destructive">*</span>
            </Label>
            <Textarea
              value={jdContent}
              onChange={(e) => setJdContent(e.target.value)}
              rows={10}
              placeholder="Paste the job description here…"
              className="font-mono text-xs"
            />
          </div>
        </div>
      </section>
      <div className="flex items-center gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? "Adding…" : "Add opening"}
        </Button>
        <DiscardButton
          dirty={Boolean(title || workLocation || jdContent)}
          backHref={`/postings/${postingId}`}
        />
      </div>
    </form>
  );
}
