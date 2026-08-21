import type { Metadata } from "next";
import { NotBuiltYet } from "@/components/shell/not-built-yet";

export const metadata: Metadata = { title: "New posting" };

export default function NewPostingPage() {
  return (
    <NotBuiltYet
      title="New posting"
      milestone="M1"
      summary="Name the hiring drive, add its openings, attach a job description to each, then review the requirements Ziphyre pulls out and mark what's non-negotiable."
    />
  );
}
