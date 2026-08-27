import { NextResponse } from "next/server";
import JSZip from "jszip";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/session";
import { getApplicationsForOpening } from "@/lib/applications";
import { exportMarker, toExportRow } from "@/lib/export/rows";
import { buildCsv } from "@/lib/export/csv";
import { buildXlsx } from "@/lib/export/xlsx";
import { buildPdf } from "@/lib/export/pdf";

/**
 * FR-71 – FR-75. A route handler rather than a Server Action because
 * this returns a file: an action can return bytes, but only a response
 * can carry the Content-Disposition that makes a browser save it with
 * the right name.
 *
 * **The client sends ids and an order, never data.** Everything in the
 * file is re-read here through the user's own Supabase client, so RLS
 * decides what is exportable and a tampered request cannot widen the
 * scope beyond the caller's organisation.
 */

const BodySchema = z.object({
  // FR-74. The already-filtered, already-sorted ids from the screen —
  // the order matters, because FR-72 requires the document to present
  // candidates in the order currently shown.
  applicationIds: z.array(z.string().uuid()).min(1).max(1000),
  format: z.enum(["csv", "xlsx", "pdf"]),
  includeCvs: z.boolean().default(false),
});

/**
 * Tech spec §10 puts CV bundles behind a `build_export` job because
 * their size is unpredictable. That job does not exist yet, so bundles
 * are built in-request and capped — refusing 200 CVs with an
 * explanation is honest, where streaming 200 MB through a serverless
 * function and timing out halfway is not.
 */
const MAX_BUNDLED_CVS = 40;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ openingId: string }> },
) {
  const session = await getSessionContext();
  if (!session) {
    return NextResponse.json({ message: "Not signed in." }, { status: 401 });
  }

  const { openingId } = await params;
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: "Bad request." }, { status: 400 });
  }
  const { applicationIds, format, includeCvs } = parsed.data;

  const supabase = await createClient();
  const { data: opening } = await supabase
    .from("opening")
    .select("id, title")
    .eq("id", openingId)
    .maybeSingle();
  if (!opening) {
    return NextResponse.json({ message: "Opening not found." }, { status: 404 });
  }

  // Re-read, then re-order to match what the screen showed. Anything
  // the caller asked for that RLS did not return simply is not in the
  // file — it is never invented from the request.
  const all = await getApplicationsForOpening(openingId);
  const byId = new Map(all.map((a) => [a.id, a]));
  const applications = applicationIds
    .map((id) => byId.get(id))
    .filter((a): a is NonNullable<typeof a> => Boolean(a));

  if (applications.length === 0) {
    return NextResponse.json(
      { message: "Nothing to export." },
      { status: 400 },
    );
  }

  // FR-71's disposition column: the latest admin stage event per
  // application, which is where a disposition is recorded (FR-57).
  const { data: events } = await supabase
    .from("stage_event")
    .select("application_id, disposition, created_at")
    .in("application_id", applications.map((a) => a.id))
    .eq("actor_kind", "admin")
    .not("disposition", "is", null)
    .order("created_at", { ascending: false });

  const dispositions = new Map<string, string>();
  for (const e of events ?? []) {
    if (!dispositions.has(e.application_id)) {
      dispositions.set(e.application_id, e.disposition as string);
    }
  }

  const marker = exportMarker(session.displayName ?? session.email);
  const stamp = new Date().toISOString().slice(0, 10);
  const base = `${opening.title.replace(/[^\w\s-]/g, "").trim() || "candidates"} ${stamp}`;

  let body: Buffer;
  let filename: string;
  let contentType: string;

  if (format === "pdf") {
    body = await buildPdf(applications, marker, opening.title);
    filename = `${base}.pdf`;
    contentType = "application/pdf";
  } else {
    const rows = applications.map((a) =>
      toExportRow(a, dispositions.get(a.id) ?? null),
    );
    if (format === "csv") {
      body = Buffer.from(buildCsv(rows, marker), "utf8");
      filename = `${base}.csv`;
      contentType = "text/csv; charset=utf-8";
    } else {
      body = await buildXlsx(rows, marker, opening.title);
      filename = `${base}.xlsx`;
      contentType =
        "application/vnd.openxmlformats-officedocument.spreadsheetml.document";
    }
  }

  // FR-73. The report goes in beside the CVs rather than being replaced
  // by them — a folder of PDFs named after strangers is not a shortlist.
  if (includeCvs) {
    const withCvs = applications.filter((a) => a.cvOriginalFilename);
    if (withCvs.length > MAX_BUNDLED_CVS) {
      return NextResponse.json(
        {
          message: `Bundling CVs is limited to ${MAX_BUNDLED_CVS} candidates at a time, and this export has ${withCvs.length}. Narrow the filters or select fewer, or export without CV files.`,
        },
        { status: 413 },
      );
    }

    const zip = new JSZip();
    zip.file(filename, body);
    // FR-75 again: a zip is unpacked and the report may be separated
    // from the CVs, so the marker travels as its own file too.
    zip.file("READ ME — internal use only.txt", `${marker}\n`);

    const cvs = zip.folder("CVs")!;
    const used = new Set<string>();
    for (const a of applications) {
      const path = await cvStoragePath(supabase, a.id);
      if (!path) continue;
      const { data: blob } = await supabase.storage.from("cvs").download(path);
      if (!blob) continue;
      const ext = a.cvOriginalFilename?.split(".").pop() ?? "pdf";
      // Named after the candidate, not the stored uuid — the point of
      // the bundle is that a human can open it and know who is who.
      let name = `${(a.candidateName ?? "candidate").replace(/[/\\:*?"<>|]/g, "-")}.${ext}`;
      let n = 2;
      while (used.has(name)) {
        name = `${(a.candidateName ?? "candidate").replace(/[/\\:*?"<>|]/g, "-")} (${n++}).${ext}`;
      }
      used.add(name);
      cvs.file(name, Buffer.from(await blob.arrayBuffer()));
    }

    body = await zip.generateAsync({ type: "nodebuffer" });
    filename = `${base}.zip`;
    contentType = "application/zip";
  }

  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(body.byteLength),
      // Never cached: this is personal data with a per-request marker
      // naming who exported it and when.
      "Cache-Control": "no-store, private",
    },
  });
}

async function cvStoragePath(
  supabase: Awaited<ReturnType<typeof createClient>>,
  applicationId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("application")
    .select("cv_storage_path")
    .eq("id", applicationId)
    .maybeSingle();
  return data?.cv_storage_path ?? null;
}
