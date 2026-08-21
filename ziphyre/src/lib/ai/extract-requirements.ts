import "server-only";
import { generateObject } from "ai";
import { z } from "zod";
import { getModel } from "@/lib/ai/provider";
import type { ProviderId } from "@/lib/ai/providers";

const ExtractionSchema = z.object({
  requirements: z
    .array(z.string().min(1))
    .describe(
      "Discrete, individually markable requirements pulled from the job description — each one thing a candidate either has or doesn't. Split compound bullets into separate items.",
    ),
});

const SYSTEM_PROMPT = `You read job descriptions for a hiring product and pull out discrete, checkable requirements.

Rules:
- Each requirement is ONE thing: a qualification, a skill, a tool, an experience range, a location constraint. Not a sentence of prose.
- Split compound bullets. "GST, TDS and reconciliation" becomes three separate requirements, not one.
- Use the job description's own words where possible. Don't editorialise or add requirements that aren't there.
- Do not judge which requirements are mandatory versus preferred. That is a human decision made after this list is produced — never guess it, never imply it in the wording.
- If the description is too thin to extract anything meaningful, return an empty list. Do not invent requirements to fill space.`;

/**
 * FR-13. Proposes requirement TEXT only — no must-have/preferred
 * judgement. That split is FR-15's job, made explicitly by the admin,
 * because the JD's own wording can't be trusted to signal its own
 * priorities (see PN-001 §1, the Tally-vs-CA-qualification finding).
 *
 * Throws on failure so the caller's fallback chain can catch it and try
 * the next provider.
 */
export async function extractRequirements(
  jdContent: string,
  provider: { provider: ProviderId; model: string; apiKey: string },
): Promise<string[]> {
  const model = getModel(provider.provider, provider.model, provider.apiKey);
  const { object } = await generateObject({
    model,
    schema: ExtractionSchema,
    system: SYSTEM_PROMPT,
    prompt: `Job description:\n\n${jdContent}`,
  });
  return object.requirements;
}
