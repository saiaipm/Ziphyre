import "server-only";
import { generateObject } from "ai";
import { z } from "zod";
import { getModel } from "@/lib/ai/provider";
import type { ProviderId } from "@/lib/ai/providers";

export const PROMPT_VERSION = "screen-v3";

export type RequirementInput = {
  id: string;
  text: string;
  kind: "must_have" | "preferred";
};

const ScreeningSchema = z.object({
  components: z.object({
    jdFit: z.number().int().min(0).max(10),
    experience: z.number().int().min(0).max(10),
    skills: z.number().int().min(0).max(10),
    qualification: z.number().int().min(0).max(10),
    location: z.number().int().min(0).max(10),
  }),
  mustHaves: z
    .array(
      z.object({
        requirementId: z.string(),
        met: z.boolean(),
        note: z.string(),
      }),
    )
    .describe(
      "One entry per must-have requirement, keyed by its id. Every must-have listed below must appear exactly once.",
    ),
  strengths: z.string(),
  gaps: z
    .string()
    .describe(
      "Phrased as distance from this job description's requirements — never as a characterisation of the person.",
    ),
  overallRead: z.string(),
  experienceDiscrepancy: z
    .string()
    .nullable()
    .describe(
      "Null when declared and CV-evidenced experience roughly agree. Otherwise, state the material difference.",
    ),
});

export type ScreeningResult = z.infer<typeof ScreeningSchema>;

/**
 * Exported so Settings → Screening can show it. Read-only there, and
 * fixed here on purpose: ProductContext Principle 8 is that every
 * candidate meets the same yardstick, and the "never recommend an
 * outcome" line below is what keeps Non-Goal 2 — not an automatic
 * decision-maker — structural rather than a promise. PN-003 works
 * through what editable instructions would cost and what a safe
 * version would look like.
 */
export const SYSTEM_PROMPT = `You screen candidate CVs against a job description for a hiring product. You never decide who gets hired — you produce a structured assessment a human reviews.

Rules:
- Judge each must-have requirement explicitly against its stated text. Return exactly one entry per must-have id given to you — never omit one, never invent one that wasn't given.
- A must-have naming a specific credential or a specific named tool (e.g. "Chartered Accountant", "Tally") is "met" only if the CV names that exact credential or tool. Generic adjacent experience is not evidence — years of tax/GST/accounting work does not imply a CA credential, and "professional experience" or "accounting software" does not imply a specific named tool like Tally unless the CV actually says so. If you cannot quote or closely paraphrase the CV text that satisfies a must-have, it is not met. When the CV is silent, mark it not met and say so; never guess in the candidate's favour.
- Gaps are phrased as distance from the job description ("no evidence of X in the CV"), never as a characterisation of the candidate ("weak candidate", "not driven").
- Compare declared work experience (if provided) against what the CV evidences. If they diverge materially, say so in experienceDiscrepancy; otherwise return null.
- Never recommend an outcome, never suggest rejection or acceptance. Describe fit; don't decide it.
- Score every component 0–10. Components measure: jdFit (how much of the day-to-day work in the JD this person has actually done), experience (length/seniority against what's asked), skills (tools/technical proficiencies named in the JD), qualification (credentials/education against what's asked), location (current location vs. the opening's location, together with stated willingness to relocate).`;

function buildPrompt(input: {
  jdContent: string;
  requirements: RequirementInput[];
  formAnswersSummary: string;
  cvText: string;
}): string {
  const requirementLines = input.requirements
    .map(
      (r) =>
        `- [${r.kind === "must_have" ? "MUST-HAVE" : "preferred"}] (id: ${r.id}) ${r.text}`,
    )
    .join("\n");

  return `Job description:
${input.jdContent}

Requirements:
${requirementLines || "(none recorded)"}

Candidate-declared answers:
${input.formAnswersSummary}

Candidate CV (extracted text):
${input.cvText}`;
}

/**
 * Tech spec §6.3–§6.4. Throws on failure or invalid shape so the
 * caller's `runWithFallback` chain can try the next provider — a
 * screening that fails validation is never partially saved.
 *
 * `overall` is deliberately NOT part of this schema — the caller
 * computes it in code from the five components (FR-41/42), never
 * trusting the model's arithmetic.
 */
export async function screenApplication(
  input: {
    jdContent: string;
    requirements: RequirementInput[];
    formAnswersSummary: string;
    cvText: string;
  },
  provider: { provider: ProviderId; model: string; apiKey: string },
): Promise<ScreeningResult> {
  const model = getModel(provider.provider, provider.model, provider.apiKey);
  const { object } = await generateObject({
    model,
    schema: ScreeningSchema,
    system: SYSTEM_PROMPT,
    prompt: buildPrompt(input),
  });

  const mustHaveIds = new Set(
    input.requirements.filter((r) => r.kind === "must_have").map((r) => r.id),
  );
  const returnedIds = new Set(object.mustHaves.map((m) => m.requirementId));
  for (const id of mustHaveIds) {
    if (!returnedIds.has(id)) {
      throw new Error(
        `Model omitted a verdict for must-have requirement ${id} — treating as a validation failure, not an implied pass.`,
      );
    }
  }

  return object;
}
