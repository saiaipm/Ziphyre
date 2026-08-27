import "server-only";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { ApplicationListItem } from "@/lib/applications";
import { STAGE_LABELS, type StageKey } from "@/lib/stages";

/**
 * FR-72. Each candidate with their scores, must-have result and
 * assessment summary, **in the order currently shown on screen** — the
 * caller passes the already-filtered, already-sorted array, so the
 * document's order is the screen's order by construction rather than by
 * a second sort that could drift from the first.
 *
 * No fonts are registered: @react-pdf's built-in Helvetica needs no
 * network fetch at render time, and a font download failing inside a
 * request would turn an export into a 500. The cost is that scripts
 * outside Latin-1 will not render, which is worth revisiting when the
 * product meets a candidate whose name needs it.
 */

const s = StyleSheet.create({
  page: { paddingTop: 36, paddingBottom: 44, paddingHorizontal: 40, fontSize: 9.5, color: "#0f172a" },
  marker: { fontSize: 7.5, color: "#7a5b00", backgroundColor: "#fff7e0", padding: 5, marginBottom: 14 },
  h1: { fontSize: 15, marginBottom: 2 },
  sub: { fontSize: 9, color: "#64748b", marginBottom: 14 },
  card: { borderTopWidth: 1, borderTopColor: "#e2e8f0", paddingTop: 9, marginBottom: 9 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  name: { fontSize: 11 },
  meta: { fontSize: 8, color: "#64748b", marginTop: 1 },
  scores: { flexDirection: "row", gap: 14, marginTop: 6, marginBottom: 5 },
  score: { fontSize: 8, color: "#64748b" },
  scoreNum: { fontSize: 9, color: "#0f172a" },
  label: { fontSize: 7.5, color: "#64748b", marginTop: 5, textTransform: "uppercase" },
  body: { fontSize: 9, marginTop: 2, lineHeight: 1.45 },
  overall: { fontSize: 12 },
  foot: { position: "absolute", bottom: 22, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between" },
  footText: { fontSize: 7.5, color: "#94a3b8" },
});

function Candidate({ a }: { a: ApplicationListItem }) {
  const sc = a.screening;
  const met = sc ? sc.mustHaveResult.filter((m) => m.met).length : 0;
  const total = sc ? sc.mustHaveResult.length : 0;

  return (
    <View style={s.card} wrap={false}>
      <View style={s.rowBetween}>
        <View>
          <Text style={s.name}>{a.candidateName ?? "Unnamed candidate"}</Text>
          <Text style={s.meta}>
            {STAGE_LABELS[a.currentStage as StageKey] ?? a.currentStage}
            {total > 0 ? ` · ${met}/${total} must-haves met` : ""}
            {a.answers.currentLocation ? ` · ${a.answers.currentLocation}` : ""}
          </Text>
        </View>
        <Text style={s.overall}>
          {sc ? `${sc.overall.toFixed(1)} / 10` : "Not scored"}
        </Text>
      </View>

      {sc ? (
        <>
          <View style={s.scores}>
            {(
              [
                ["JD Fit", sc.jdFit],
                ["Experience", sc.experience],
                ["Skills", sc.skills],
                ["Qualification", sc.qualification],
                ["Location", sc.location],
              ] as const
            ).map(([label, value]) => (
              <Text key={label} style={s.score}>
                {label} <Text style={s.scoreNum}>{value}</Text>
              </Text>
            ))}
          </View>

          {total > 0 && (
            <>
              <Text style={s.label}>Must-haves</Text>
              {sc.mustHaveResult.map((m, i) => (
                <Text key={i} style={s.body}>
                  {m.met ? "[met] " : "[not met] "}
                  {m.note}
                </Text>
              ))}
            </>
          )}

          <Text style={s.label}>Strengths</Text>
          <Text style={s.body}>{sc.strengths}</Text>
          <Text style={s.label}>Gaps</Text>
          <Text style={s.body}>{sc.gaps}</Text>
          <Text style={s.label}>Overall read</Text>
          <Text style={s.body}>{sc.overallRead}</Text>
          {sc.experienceDiscrepancy && (
            <>
              <Text style={s.label}>Experience discrepancy</Text>
              <Text style={s.body}>{sc.experienceDiscrepancy}</Text>
            </>
          )}
        </>
      ) : (
        <Text style={s.body}>
          {a.screeningStatus === "needs_manual_review"
            ? `Needs manual review — ${a.screeningFailureReason ?? ""}`
            : "Screening has not completed for this candidate."}
        </Text>
      )}
    </View>
  );
}

export async function buildPdf(
  applications: ApplicationListItem[],
  marker: string,
  openingTitle: string,
): Promise<Buffer> {
  const doc = (
    <Document title={`${openingTitle} — candidates`}>
      <Page size="A4" style={s.page}>
        {/* FR-75, on every page: a PDF is read a page at a time and
            forwarded whole, so marking only the first page marks
            nothing for anyone who opens it at page four. */}
        <Text style={s.marker} fixed>
          {marker}
        </Text>
        <Text style={s.h1}>{openingTitle}</Text>
        <Text style={s.sub}>
          {applications.length}{" "}
          {applications.length === 1 ? "candidate" : "candidates"}, in the order
          shown on screen.
        </Text>

        {applications.map((a) => (
          <Candidate key={a.id} a={a} />
        ))}

        <View style={s.foot} fixed>
          <Text style={s.footText}>Ziphyre — internal use only</Text>
          <Text
            style={s.footText}
            render={({ pageNumber, totalPages }) =>
              `${pageNumber} of ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );

  return renderToBuffer(doc);
}
