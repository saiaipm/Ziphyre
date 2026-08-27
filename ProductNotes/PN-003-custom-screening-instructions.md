# Product Note 003 — Custom Screening Instructions

**Status:** Layer 0 shipped 28 August 2026. Layers 1 and 2 deferred —
see Decision B.
**Author:** Working note from the M7 planning session
**Related:** ProductContext Principles 1, 6, 8, 10 · Non-Goal 2 ·
FR-38 – FR-50 · TechDecisions §7 · `PN-001 §1`

---

## The ask, in one line

The admin has no control over — and no sight of — the system prompt that
judges every candidate, and should be able to shape it for their own
roles.

---

## Where the prompt is today

`ziphyre/src/lib/ai/screen-application.ts`, the `SYSTEM_PROMPT` constant
at line 51. It is about nine lines of rules and is **hard-coded, visible
to nobody, and changeable only by editing the file and redeploying**.

Its version string lives beside it as `PROMPT_VERSION = "screen-v3"` and
is written to `screening.prompt_version` on every score, so the database
already records *which* prompt produced a given assessment. That column
is the hook the rest of this note hangs on — the versioning half of the
problem is already solved, just not exposed.

The v3 in the name is real history: v1 and v2 were tightened by hand
during M2 after the must-have verdicts hallucinated on the real CA CVs
(STATUS.md, "M2 test result"). That episode is the strongest argument
*for* this feature — the prompt genuinely needed to change to fit a real
role — and the strongest argument for the guardrails below, because two
of those revisions changed how every candidate was judged.

**So the honest answer to "can this be accommodated?" is yes.** But a
plain textarea wired to `SYSTEM_PROMPT` would break four things the
product has deliberately promised, and the design has to earn its way
around them.

---

## Why a raw prompt editor is the wrong shape

**1. It breaks Principle 8 — "the same yardstick for every candidate."**
Edit the prompt after twenty CVs are screened and candidates 1–20 were
judged by different rules than 21–40. The ranking silently stops being a
ranking. This is the central problem, and everything below is mostly
about it.

**2. It punches a hole in Non-Goal 2 — "not an automatic
decision-maker."** Nothing stops an admin typing *"reject anyone without
a CA"*. The model would comply, and the product would have quietly become
the thing the roadmap calls a permanent guardrail. Today the prompt's
"never recommend an outcome, never suggest rejection" line is what holds
that; a replaceable prompt makes it optional.

**3. It breaks the output contract.** `screenApplication` requires one
verdict per must-have id, five 0–10 components, and a specific JSON
shape. The Zod schema catches a malformed *shape*, but not a prompt that
merely stops mentioning must-haves — that fails at run time, per
candidate, as a screening error the admin cannot diagnose.

**4. It violates Principle 6 — "usable on day one, no configuration
marathons."** A blank box headed *"System prompt"* is exactly the
configuration marathon the product refuses. Most admins will never touch
it; the ones who do will mostly make screening worse.

**And one risk that is not a principle but is worse than all four.**
This is a hiring product in a market with anti-discrimination law. A free
text box will eventually contain *"prefer candidates from tier-1
colleges"*, *"avoid career gaps"*, or worse. The product would be the
instrument, the customer would carry the liability, and Ziphyre would
have handed them the loaded end. Any version of this feature has to take
a position on that rather than discover it later.

---

## What admins actually want

The ask is real; the raw editor is just the wrong way to grant it. From
the M2 episode and the shape of the CA role, the genuine needs are:

| Need | Example |
|---|---|
| **Strictness of must-haves** | "Tally ERP 9 and Tally Prime both count as Tally" |
| **What a component means here** | "This is client-facing; weight communication under Skills" |
| **What to ignore** | "Everyone is remote — location shouldn't move the score" |
| **Role vocabulary** | "'Articleship' is Indian CA training, treat it as relevant experience" |
| **Seeing it at all** | "I want to know how my candidates are being judged" |

Every one of those is *context for the same job*, not a different job.
None of them requires replacing the rules that keep screening honest.

---

## Proposed design — three layers

### Layer 0: make it visible (do this regardless)

Settings → Screening shows the active prompt, read-only, with its version.
Principle 10 says say the honest thing to customers about what the product
does; an admin who cannot see how candidates are judged cannot defend a
shortlist to Rahul. **This alone answers half the ask, costs almost
nothing, and breaks nothing.** If only one layer ships, it is this one.

### Layer 1: structured controls

Bounded, per-opening settings that compose into the prompt:

- **Must-have strictness** — *Exact naming required* (today's behaviour)
vs *Allow clearly equivalent evidence*, with the equivalences typed in.
- **Component emphasis** — mark any of the five as *more* or *less*
important for this role, or *not applicable* (which is what "we're all
remote" really means about Location).
- **Role glossary** — term → what it should be treated as. Directly
addresses the CA vocabulary problem.

These are safe because they cannot remove a rule, only qualify one, and
they are trivially versionable.

### Layer 2: additional context, appended and bounded

A free-text box, capped (say 2,000 characters), inserted **between** the
immutable rules and the immutable output contract, and introduced to the
model as context that cannot override what precedes it. This is where
genuine role nuance lives.

**The immutable core is not editable at any layer:** never decide an
outcome, never recommend rejection or acceptance, gaps phrased as
distance from the JD rather than characterisations of a person, one
verdict per must-have id, five components 0–10, and the JSON contract.
Those are what make the score defensible and the product not an automatic
decision-maker. They stay in code.

---

## The mechanics that make it safe

**Versioning, mirroring `jd_version`.** A new `screening_prompt` table,
append-only, one row per saved revision, with the composed prompt text
and a version label. `screening.prompt_version` stores that row's id
instead of the string `"screen-v3"`. Editing never overwrites; it creates
v2. Two scores can then still be compared honestly, or shown as not
comparable — which is FR-49's whole point.

**Changing it offers a rescreen — the same way the JD already does.**
This is the answer to Principle 8. The offer must state plainly how many
already-screened candidates were judged by the previous version, because
declining leaves a pile scored two different ways.

**Mixed piles are marked, not hidden.** Where a list contains scores from
more than one prompt version, say so. A quiet mixed ranking is worse than
a visible one.

**Preview before saving.** Run the draft against one already-screened
candidate and show old vs new side by side. This turns an abstract text
edit into an observable consequence, and is the single feature most
likely to stop a bad prompt reaching the pile.

**One-click restore to default.**

---

## What it costs — stated honestly

- **A new table, migration, and settings surface.** Moderate, well-trodden
here: `jd_version` is the same pattern.
- **The rescreen fan-out already exists** (tech spec §6.5, built in M4 for
reassignment), so "offer a rescreen" is wiring, not new machinery.
- **Screening failures become partly the customer's fault.** Today a
failed screening is our bug. With custom instructions it may be their
prompt, and the error surface has to say which — otherwise support
becomes unanswerable.
- **Every provider behaves differently.** A prompt tuned on GPT-4o mini
may behave differently on the NVIDIA fallback. The fallback chain means
the admin cannot fully control which model reads their instructions.
- **It weakens the "usable on day one" promise slightly**, and the
mitigation is that every layer is optional with a sane default.

---

## What this is *not*

- Not a way to make screening decide. The immutable core stays.
- Not per-candidate instructions. That is the opposite of Principle 8.
- Not model or temperature tuning — provider choice is already Settings.
- Not a prompt *library* or marketplace in v1.

---

## Open decisions — for the product owner

**A. Scope.** Per opening, per organisation, or an org default that
openings inherit and may override?
*Recommendation:* org default + per-opening override. "Same yardstick" is
per role, but re-typing a glossary for every opening fails Principle 5.

**B. How far does freedom go?** Layer 0 only, Layers 0–1, or all three?
**Decided 28 August 2026: Layer 0 only.** The product owner's reading was
that editable instructions introduce complexity they do not want to carry,
but that the prompt should at least be visible. That is the whole of the
felt need met, at none of the cost — and it leaves A, C and D unanswered
because nothing yet depends on them. Revisit only if a real customer asks
for judgement they cannot get by changing requirements.

**C. The discrimination guardrail.** Warning text at the point of
editing, an explicit blocklist of protected characteristics, or trust the
customer?
*Recommendation:* at minimum a visible warning plus the immutable "judge
only against the job description and its requirements" rule. A blocklist
is worth discussing but will produce false positives ("no gaps in the
schedule") and cannot be comprehensive. **This is the decision I would
least like to defer.**

**D. Mid-pile changes.** Force a rescreen, offer one, or allow divergence?
*Recommendation:* offer, and mark mixed piles. Forcing it would burn the
customer's API credits without consent; hiding it would break Principle 8
silently.

---

## Next steps

**Layer 0 is built** — Settings → Screening, "How candidates are judged":
the prompt verbatim, its version, what else is sent per candidate, and two
lines saying plainly that it is fixed and why. It also names the control
the admin *does* have, because "no control over screening" turned out to
mean the requirements-and-must-haves control was invisible rather than
absent.

**Layers 1 and 2 are not built and are not scheduled.** If they are ever
picked up, decisions A, C and D above are the ones to answer first, and C
— the discrimination guardrail — should be settled before a single
character of free text is accepted from a customer.
