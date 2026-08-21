import type { Metadata } from "next";
import { ScreeningForm } from "./screening-form";

export const metadata: Metadata = { title: "Screening" };

export default function ScreeningSettingsPage() {
  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-[28px] leading-tight font-semibold">Screening</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose who screens your candidates and use your own key. This controls
          what screening costs you and where your applicants&rsquo; information
          is processed.
        </p>
      </div>
      <ScreeningForm />
    </div>
  );
}
