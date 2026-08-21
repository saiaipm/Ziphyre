import { redirect } from "next/navigation";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { SetupBanner } from "@/components/shell/setup-banner";
import { getSessionContext } from "@/lib/session";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const session = await getSessionContext();

  // Middleware normally catches this; belt and braces so no signed-out
  // request can ever render a candidate's data.
  if (!session) redirect("/sign-in");

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          organizationName={session.organization.name}
          userEmail={session.email}
          displayName={session.displayName}
          avatarUrl={session.avatarUrl}
        />
        <SetupBanner />
        <main className="flex-1">
          <div className="mx-auto max-w-[var(--container-max)] px-4 py-6 sm:px-8 sm:py-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
