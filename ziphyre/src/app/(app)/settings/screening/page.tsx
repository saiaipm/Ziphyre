import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ScreeningForm } from "./screening-form";
import { getSessionContext } from "@/lib/session";
import { getConfiguredProviders } from "@/lib/provider-settings";

export const metadata: Metadata = { title: "Screening" };

export default async function ScreeningSettingsPage() {
  const session = await getSessionContext();
  if (!session) redirect("/sign-in");

  const configured = await getConfiguredProviders();

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-[28px] leading-tight font-semibold">Screening</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose who screens your candidates and use your own key. This controls
          what screening costs you and where your applicants&rsquo; information
          is processed.
        </p>
      </div>
      <ScreeningForm configured={configured} />
    </div>
  );
}
