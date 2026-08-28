/**
 * Default message templates and the variable vocabulary — FR-126 to
 * FR-129.
 *
 * **The variable list is a Non-Goal made concrete.** Non-Goal 9 says
 * candidates never see scores or internal notes, "not as an option, not
 * as a setting" — and a template variable *is* a setting. So there is no
 * score variable, no component variable, no assessment variable and no
 * disposition variable, and `render` substitutes only from this list.
 * Anything else in a template stays as literal text rather than
 * resolving, which fails visibly instead of leaking.
 *
 * Client-safe on purpose: the template editor and its preview run in the
 * browser, and both need this vocabulary.
 */

export const MESSAGE_KINDS = [
  "application_received",
  "interview_invite",
  "outcome_rejected",
  "outcome_reversed",
  "general_update",
] as const;

export type MessageKind = (typeof MESSAGE_KINDS)[number];

export const MESSAGE_KIND_LABELS: Record<MessageKind, string> = {
  application_received: "Application received",
  interview_invite: "Interview invite",
  outcome_rejected: "Not moving forward",
  outcome_reversed: "Back under consideration",
  general_update: "General update",
};

/** The only variables that exist. See the note above on why. */
export const TEMPLATE_VARIABLES = [
  { key: "candidateName", label: "Candidate name", sample: "Priya Sharma" },
  { key: "roleTitle", label: "Role title", sample: "Chartered Accountant" },
  { key: "organisationName", label: "Company name", sample: "Ziphyre Demo Org" },
  { key: "bookingLink", label: "Booking link", sample: "https://cal.example/interview" },
  { key: "statusLink", label: "Status link", sample: "https://ziphyre.app/status/…" },
] as const;

export type TemplateVars = Record<
  (typeof TEMPLATE_VARIABLES)[number]["key"],
  string
>;

export type MessageTemplate = { subject: string; body: string };

/**
 * Deliberately plain text, and deliberately short. These reach a person
 * who is waiting to hear about a job; the tone is the product's voice
 * and Principle 10 — say the honest thing — applies to every line.
 *
 * Note what the rejection template does NOT do: it gives no reason. The
 * assessment is internal (Non-Goal 9), and a generic invented reason
 * would be worse than none.
 */
export const DEFAULT_TEMPLATES: Record<MessageKind, MessageTemplate> = {
  application_received: {
    subject: "We've received your application — {{roleTitle}}",
    body: `Hi {{candidateName}},

Thanks for applying for {{roleTitle}} at {{organisationName}}. Your application has reached the team.

You can check where it stands at any time here:
{{statusLink}}

We'll be in touch.

{{organisationName}}`,
  },

  interview_invite: {
    subject: "Interview — {{roleTitle}} at {{organisationName}}",
    body: `Hi {{candidateName}},

We'd like to talk to you about {{roleTitle}}.

Pick a time that suits you here:
{{bookingLink}}

If none of those times work, just reply to this email and we'll find another.

{{organisationName}}`,
  },

  // FR-124 is why the status link is here. The candidate already holds
  // one from their confirmation email, and until this message is sent
  // that page still reads "under review" (FR-123). Re-including the same
  // link is what stops the product going on telling them something that
  // is no longer true — it is not a second link, and no new one is ever
  // issued.
  outcome_rejected: {
    subject: "Your application — {{roleTitle}}",
    body: `Hi {{candidateName}},

Thank you for applying for {{roleTitle}} at {{organisationName}}, and for the time you put into it.

We won't be taking your application further on this occasion.

Your application status is here, and will stay up to date:
{{statusLink}}

We're grateful you thought of us, and we wish you well with your search.

{{organisationName}}`,
  },

  // A reversal says one specific thing and can be written properly in
  // advance, so it gets its own kind rather than borrowing
  // `general_update` — whose body is deliberately a blank to fill in.
  // Reusing that one meant "[Write your update here.]" was sendable to a
  // real candidate, which is exactly what happened before this existed.
  //
  // The wording claims nothing about the outcome. A reversal means the
  // application is open again, not that anyone has decided anything —
  // Principle 1's line between ranking and deciding applies to what
  // candidates are told as much as to the pipeline.
  outcome_reversed: {
    subject: "Your application is open again — {{roleTitle}}",
    body: `Hi {{candidateName}},

We wrote to you recently to say we would not be taking your application for {{roleTitle}} further. That has changed, and your application is under consideration again.

We are sorry for the confusion. You can see where it stands here, and this page will stay up to date:
{{statusLink}}

Thank you for your patience.

{{organisationName}}`,
  },

  general_update: {
    subject: "An update on your application — {{roleTitle}}",
    body: `Hi {{candidateName}},

A quick update on your application for {{roleTitle}} at {{organisationName}}.

[Write your update here.]

You can check where your application stands here:
{{statusLink}}

{{organisationName}}`,
  },
};

/**
 * Substitutes only known variables. An unknown `{{token}}` is left
 * exactly as written — visible in the preview, so a typo is caught by
 * the admin rather than mailed to a candidate as a blank.
 */
export function render(template: string, vars: Partial<TemplateVars>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (whole, key: string) => {
    const value = vars[key as keyof TemplateVars];
    return value === undefined || value === "" ? whole : value;
  });
}

/** Which variables a template actually uses, for the preview and for
 *  FR-132's "an invite needs a booking link" check. */
export function usedVariables(template: string): string[] {
  return [...new Set([...template.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]))];
}
