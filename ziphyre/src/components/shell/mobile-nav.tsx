"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

const nav = [
  { href: "/", label: "Home" },
  { href: "/postings", label: "Postings" },
  { href: "/communications", label: "Communications" },
];

// `/settings/connections` was here until now — it 404s. The route went
// with the Google intake path in M3.5 and this link was never updated.
const settings = [
  { href: "/settings/organization", label: "Organization" },
  { href: "/settings/screening", label: "Screening" },
];

/**
 * Navigation below the `lg` breakpoint, where the sidebar is hidden.
 * Without this there is no way to move around the app on a narrow screen.
 */
export function MobileNav() {
  const pathname = usePathname();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden -ml-2 size-8"
          aria-label="Open navigation"
        >
          <Menu className="size-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        {nav.map((item) => (
          <DropdownMenuItem key={item.href} asChild>
            <Link
              href={item.href}
              aria-current={pathname === item.href ? "page" : undefined}
            >
              {item.label}
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Settings
        </DropdownMenuLabel>
        {settings.map((item) => (
          <DropdownMenuItem key={item.href} asChild>
            <Link
              href={item.href}
              aria-current={pathname === item.href ? "page" : undefined}
            >
              {item.label}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
