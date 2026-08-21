"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, LogOut, Building2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createClient } from "@/lib/supabase/client";

type Props = {
  displayName: string | null;
  email: string;
  avatarUrl: string | null;
};

function initialsFrom(name: string | null, email: string) {
  if (name?.trim()) {
    return name
      .trim()
      .split(/\s+/)
      .map((w) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

/**
 * Account menu.
 *
 * The email address is deliberately NOT rendered in the top bar — it is
 * personal, and this product gets demonstrated on shared screens and
 * projectors. It lives one click away, masked until asked for.
 */
export function AccountMenu({ displayName, email, avatarUrl }: Props) {
  const router = useRouter();
  const [revealed, setRevealed] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const name = displayName?.trim() || "Account";
  const initials = initialsFrom(displayName, email);

  const [localPart, domain] = email.split("@");
  const masked = `${localPart.slice(0, 2)}${"•".repeat(
    Math.max(localPart.length - 2, 3),
  )}@${domain ?? ""}`;

  async function signOut() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/sign-in");
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex min-w-0 items-center gap-2 rounded px-2 py-1 transition-colors hover:bg-muted"
          aria-label="Account menu"
        >
          <Avatar className="size-7 shrink-0">
            {avatarUrl && (
              <AvatarImage
                src={avatarUrl}
                alt=""
                referrerPolicy="no-referrer"
              />
            )}
            <AvatarFallback className="bg-muted text-[11px] font-medium text-muted-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
          <span className="hidden truncate text-sm font-medium sm:inline">
            {name}
          </span>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64">
        <div className="px-2 py-1.5">
          <p className="truncate text-sm font-medium">{name}</p>
          <div className="mt-1 flex items-center gap-1.5">
            <span
              className="truncate text-xs text-muted-foreground"
              title={revealed ? email : undefined}
            >
              {revealed ? email : masked}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                setRevealed((v) => !v);
              }}
              className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
              aria-label={
                revealed ? "Hide email address" : "Show email address"
              }
            >
              {revealed ? (
                <EyeOff className="size-3.5" aria-hidden />
              ) : (
                <Eye className="size-3.5" aria-hidden />
              )}
            </button>
          </div>
        </div>

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <Link href="/settings/organization">
            <Building2 className="size-4" aria-hidden />
            Organization settings
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            void signOut();
          }}
          disabled={signingOut}
        >
          <LogOut className="size-4" aria-hidden />
          {signingOut ? "Signing out…" : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
