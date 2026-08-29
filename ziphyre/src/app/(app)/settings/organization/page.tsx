import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OrganizationForm } from "./organization-form";
import { getSessionContext } from "@/lib/session";

export const metadata: Metadata = { title: "Organization" };

export default async function OrganizationSettingsPage() {
  const session = await getSessionContext();
  if (!session) redirect("/sign-in");

  const org = session.organization;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-[28px] leading-tight font-semibold">Organization</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Details about your business. Timezone and currency are used
          throughout — every salary figure and every date reads from them.
        </p>
      </div>
      <OrganizationForm
        initial={{
          name: org.name ?? "",
          legalName: org.legal_name ?? "",
          website: org.website ?? "",
          industry: org.industry ?? "",
          sizeBand: org.size_band ?? "",
          primaryLocation: org.primary_location ?? "",
          timezone: org.timezone ?? "Asia/Kolkata",
          currency: org.currency ?? "INR",
        }}
        showSampleData={org.show_sample_data}
      />
    </div>
  );
}
