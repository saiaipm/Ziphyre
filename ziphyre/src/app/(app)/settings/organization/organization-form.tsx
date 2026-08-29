"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SIZE_BANDS, INDUSTRIES, CURRENCIES, TIMEZONES } from "@/lib/seed";
import { saveOrganization, setShowSampleData } from "./actions";

export type OrgForm = {
  name: string;
  legalName: string;
  website: string;
  industry: string;
  sizeBand: string;
  primaryLocation: string;
  timezone: string;
  currency: string;
};

export function OrganizationForm({
  initial,
  showSampleData,
}: {
  initial: OrgForm;
  /** FR-136/§10B. Deliberately *not* part of `initial` — see below. */
  showSampleData: boolean;
}) {
  const [form, setForm] = useState<OrgForm>(initial);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof OrgForm>(key: K, value: OrgForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function onSave() {
    if (!form.name.trim()) {
      toast.error("Organization name is required.");
      return;
    }
    setSaving(true);
    const result = await saveOrganization(form);
    setSaving(false);

    if (result.ok) {
      toast.success("Organization saved");
    } else {
      toast.error("Couldn't save", { description: result.error });
    }
  }

  return (
    <div className="space-y-6">
      <Section
        title="Identity"
        description="How your business appears in Ziphyre."
      >
        <Field
          label="Organization name"
          hint="What you'll recognise in the interface."
          required
        >
          <Input
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="Acme Media"
          />
        </Field>

        <Field label="Legal name" hint="If it differs from the above.">
          <Input
            value={form.legalName}
            onChange={(e) => set("legalName", e.target.value)}
            placeholder="Acme Media Private Limited"
          />
        </Field>

        <Field label="Website">
          <Input
            type="url"
            value={form.website}
            onChange={(e) => set("website", e.target.value)}
            placeholder="https://acme.example"
          />
        </Field>
      </Section>

      <Section
        title="Profile"
        description="Context that helps screening understand your business."
      >
        <Field label="Industry">
          <Select
            value={form.industry}
            onValueChange={(v) => set("industry", v)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select an industry" />
            </SelectTrigger>
            <SelectContent>
              {INDUSTRIES.map((i) => (
                <SelectItem key={i} value={i}>
                  {i}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Company size">
          <Select
            value={form.sizeBand}
            onValueChange={(v) => set("sizeBand", v)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Number of employees" />
            </SelectTrigger>
            <SelectContent>
              {SIZE_BANDS.map((s) => (
                <SelectItem key={s} value={s}>
                  {s} employees
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Primary location">
          <Input
            value={form.primaryLocation}
            onChange={(e) => set("primaryLocation", e.target.value)}
            placeholder="Hyderabad, India"
          />
        </Field>
      </Section>

      <Section
        title="Regional"
        description="Applied to every date and salary figure in the product."
      >
        <Field label="Timezone">
          <Select
            value={form.timezone}
            onValueChange={(v) => set("timezone", v)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIMEZONES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t.replace("_", " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field
          label="Currency"
          hint="Used for current and expected salary on every application."
        >
          <Select
            value={form.currency}
            onValueChange={(v) => set("currency", v)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CURRENCIES.map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </Section>

      <Section
        title="Sample data"
        description="A seeded, fabricated demo pipeline — never a real applicant, always marked wherever it shows."
      >
        <SampleDataCheckbox initial={showSampleData} />
      </Section>

      <div className="flex items-center gap-3">
        <Button onClick={onSave} disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}

/**
 * FR-136. Saves on the spot, exactly like the header toggle on Home and
 * Postings — and deliberately outside this page's Save button.
 *
 * It used to be a field in `OrgForm`, saved with everything else. That
 * made it the one setting with a second, independent control elsewhere
 * in the product, and a whole-form Save writes every field it holds. So
 * a Settings tab left open kept a stale copy: toggle on Home, come back
 * to that tab, press Save for an unrelated change, and the stale value
 * silently reverted you — last write wins, no conflict, no warning.
 *
 * Taking it out of the batch removes the hazard at its root rather than
 * detecting it: there is no stale copy to write back, because the
 * checkbox is no longer part of what Save sends. It also makes the
 * control behave the same way in all three places it appears.
 */
function SampleDataCheckbox({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [saving, setSaving] = useState(false);

  async function onChange(next: boolean) {
    setOn(next);
    setSaving(true);
    const result = await setShowSampleData(next);
    setSaving(false);

    if (!result.ok) {
      setOn(!next);
      toast.error("Couldn't change that", { description: result.error });
      return;
    }
    toast.success(next ? "Showing sample data" : "Sample data hidden", {
      description: next
        ? "The sample pipeline is back on Home and Postings."
        : "Nothing was deleted — turn it back on any time.",
    });
  }

  return (
    <label className="flex cursor-pointer items-start gap-3">
      <Checkbox
        checked={on}
        onCheckedChange={(v) => onChange(v === true)}
        disabled={saving}
        className="mt-0.5"
      />
      <span className="text-sm">
        Show sample data
        <span className="block text-xs font-normal text-muted-foreground">
          On by default so an empty workspace has something to explore.
          Turning this off hides it from Home and Postings — nothing is
          deleted, and turning it back on restores exactly what was there.
          Saved as soon as you change it, not with Save changes.
        </span>
      </span>
    </label>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="border-b border-divider px-6 py-4">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="space-y-5 px-6 py-5">{children}</div>
    </section>
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
    <div className="grid gap-1.5 sm:grid-cols-[200px_1fr] sm:items-start sm:gap-5">
      <div className="sm:pt-2">
        <Label className="text-sm font-medium">
          {label}
          {required && <span className="ml-0.5 text-destructive">*</span>}
        </Label>
      </div>
      <div>
        {children}
        {hint && (
          <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>
        )}
      </div>
    </div>
  );
}
