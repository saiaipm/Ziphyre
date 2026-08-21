import type { Metadata } from "next";
import { NotBuiltYet } from "@/components/shell/not-built-yet";

export const metadata: Metadata = { title: "Postings" };

export default function PostingsPage() {
  return (
    <NotBuiltYet
      title="Postings"
      milestone="M1"
      summary="Creating postings, defining the openings inside them, attaching job descriptions and marking must-have requirements."
    />
  );
}
