"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createPostingWithOpening } from "../actions";

export function NewPostingForm() {
  const router = useRouter();
  const [postingName, setPostingName] = useState("");
  const [openingTitle, setOpeningTitle] = useState("");
  const [workLocation, setWorkLocation] = useState("");
  const [jdContent, setJdContent] = useState("");
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const result = await createPostingWithOpening({
      postingName,
      openingTitle,
      workLocation,
      jdContent,
    });
    setSaving(false);

    if (result.ok) {
      toast.success("Posting created");
      router.push(
        `/postings/${result.data.postingId}/openings/${result.data.openingId}`,
      );
    } else {
      toast.error("Couldn't create posting", { description: result.error });
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <section className="rounded-lg border border-border bg-card">
        <div className="border-b border-divider px-6 py-4">
          <h2 className="text-sm font-semibold">Posting</h2>
        </div>
        <div className="px-6 py-5">
          <Field
            label="What are you calling this hiring drive?"
            hint={'Something you’ll recognise later — "Finance hiring, August" works fine.'}
            required
          >
            <Input
              value={postingName}
              onChange={(e) => setPostingName(e.target.value)}
              placeholder="Finance hiring, August"
            />
          </Field>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card">
        <div className="border-b border-divider px-6 py-4">
          <h2 className="text-sm font-semibold">First opening</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Screening measures every candidate against this job description.
          </p>
        </div>
        <div className="space-y-5 px-6 py-5">
          <Field label="Role title" required>
            <Input
              value={openingTitle}
              onChange={(e) => setOpeningTitle(e.target.value)}
              placeholder="Chartered Accountant"
            />
          </Field>
          <Field label="Work location" required>
            <Input
              value={workLocation}
              onChange={(e) => setWorkLocation(e.target.value)}
              placeholder="Hyderabad"
            />
          </Field>
          <Field
            label="Job description"
            hint="Paste the full text. Ziphyre will read this to propose requirements next."
            required
          >
            <Textarea
              value={jdContent}
              onChange={(e) => setJdContent(e.target.value)}
              rows={10}
              placeholder="Paste the job description here…"
              className="font-mono text-xs"
            />
          </Field>
        </div>
      </section>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? "Creating…" : "Create posting"}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
