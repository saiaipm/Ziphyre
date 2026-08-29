"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { setShowSampleData } from "@/app/(app)/settings/organization/actions";

/**
 * FR-136. The toggle, where the sample data actually is.
 *
 * It also lives in Settings → Organization, saved with the rest of that
 * form. But a demo toggle buried under Identity/Profile/Regional is a
 * control nobody finds when they want it, which is exactly while they
 * are *looking at* the sample pipeline and want it gone. So it sits
 * here too, on Home and Postings, and saves on the spot rather than
 * waiting for a Save button.
 */
export function SampleDataToggle({ checked }: { checked: boolean }) {
  const [on, setOn] = useState(checked);
  const [saving, setSaving] = useState(false);

  async function onChange(next: boolean) {
    // Optimistic: the switch should move under the finger, not after a
    // round trip. Reverted below if the write actually fails.
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
    <div className="flex items-center gap-2.5">
      <Switch
        id="sample-data"
        checked={on}
        onCheckedChange={onChange}
        disabled={saving}
      />
      <Label
        htmlFor="sample-data"
        className="text-sm font-normal text-muted-foreground"
      >
        Show sample data
      </Label>
    </div>
  );
}
