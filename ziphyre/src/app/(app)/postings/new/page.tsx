import type { Metadata } from "next";
import { NewPostingForm } from "./new-posting-form";

export const metadata: Metadata = { title: "New posting" };

export default function NewPostingPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-8">
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
