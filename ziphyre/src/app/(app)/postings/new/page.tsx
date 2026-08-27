import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { NewPostingForm } from "./new-posting-form";

export const metadata: Metadata = { title: "New posting" };

export default function NewPostingPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <Link
        href="/postings"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-3.5" aria-hidden />
        Postings
      </Link>
      <div>
        <h1 className="text-[28px] leading-tight font-semibold">
          New posting
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Name the hiring drive, then set up its first opening. You can add
          more openings once this one is created.
        </p>
      </div>
      <NewPostingForm />
    </div>
  );
}
