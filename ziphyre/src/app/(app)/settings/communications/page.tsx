import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/session";
import { getMailSettings } from "@/lib/mail/send";
import { SenderForm } from "./sender-form";

export const metadata: Metadata = { title: "Communications" };

export default async function CommunicationsSettingsPage() {
  const session = await getSessionContext();
  if (!session) redirect("/sign-in");

  const settings = await getMailSettings(session.organization.id);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-[28px] leading-tight font-semibold">
          Communications
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          How Ziphyre emails candidates on your behalf. Messages are sent from
          your own address, and nothing goes out unless you send it — except
          the confirmation a candidate gets when they apply.
        </p>
      </div>
      <SenderForm settings={settings} />
    </div>
  );
}
