import Link from "next/link";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { MobileNav } from "@/components/shell/mobile-nav";
import { AccountMenu } from "@/components/shell/account-menu";

type TopbarProps = {
  organizationName: string;
  userEmail: string;
  displayName: string | null;
  avatarUrl: string | null;
};

export function Topbar({
  organizationName,
  userEmail,
  displayName,
  avatarUrl,
}: TopbarProps) {
  const initials = organizationName
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-[var(--container-max)] items-center justify-between gap-3 px-4 py-3 sm:px-8">
        <div className="flex min-w-0 items-center gap-1.5">
          <MobileNav />
          <Link
            href="/settings/organization"
            className="flex min-w-0 items-center gap-2 rounded px-2 py-1 -mx-1 transition-colors hover:bg-muted"
          >
            <Avatar className="size-6 shrink-0 rounded">
              <AvatarFallback className="rounded bg-primary text-[10px] font-semibold text-primary-foreground">
                {initials || "Z"}
              </AvatarFallback>
            </Avatar>
            <span className="truncate text-sm font-medium">
              {organizationName}
            </span>
          </Link>
        </div>

        <div className="flex shrink-0 items-center">
          <AccountMenu
            displayName={displayName}
            email={userEmail}
            avatarUrl={avatarUrl}
          />
        </div>
      </div>
    </header>
  );
}
