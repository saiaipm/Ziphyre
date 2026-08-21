import type { Metadata } from "next";
import { ShieldOff } from "lucide-react";

export const metadata: Metadata = { title: "No access" };

export default function NoAccessPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-8">
      <div className="max-w-md text-center">
        <div className="mx-auto flex size-11 items-center justify-center rounded-full bg-muted">
          <ShieldOff className="size-5 text-muted-foreground" aria-hidden />
        </div>
        <h1 className="mt-5 text-xl font-semibold">
          You don&rsquo;t have access to an organization yet.
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Ask an admin to invite you. Signing in doesn&rsquo;t create an
          organization on its own — someone already inside has to add you.
        </p>
      </div>
    </div>
  );
}
