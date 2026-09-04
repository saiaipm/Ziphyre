# Ziphyre — Improvements & Future Scope

**What this is.** Candidate improvements, assessed honestly — including
three that were proposed, of which one should not be built as stated,
one should be built in a narrower form than proposed, and one turned
out to be the best idea on the list. Ordered by value per unit of
effort, not by ambition.

**What this is not.** A roadmap commitment, and not a bug list.
Outstanding defects live in `STATUS.md`; product direction lives in
`ProductContext.md` §10.

---

## Part 1 — Three proposals, assessed

### Proposal A — RAG to ground the model's understanding

**The observation is correct. The proposed fix is the wrong size.**

A CV stating "Chartered Accountant — ICAI, 2026" had its qualification
must-have marked **unmet**, with the model reasoning that 2026 was "the
expected qualification year". It read the year as being in the future.

The cause is not a knowledge gap. `buildPrompt()` sends four things —
the job description, the requirements, the candidate's declared
answers, and the CV text. The system prompt adds rules. **Nothing
anywhere states today's date.** The model was asked to reason about a
date with no reference point and did the only thing it could.

Retrieval-augmented generation fetches relevant documents from a corpus
and injects them as context. There is no corpus that answers "what is
today's date". The fix is one interpolated string.

```
Today's date is 2 September 2026. Judge all dates relative to it.
```

> **The general lesson, worth keeping:** when a model gets something
> wrong, check what it was actually given before concluding it needs
> more machinery. Here the answer was that it was never told.

**Effort:** minutes. **Risk:** near zero. **Do this first.**

#### Where retrieval genuinely would earn its place

The *other* known failure is different in kind. The model credited a
candidate with Tally experience their CV never mentions, and this
survived two prompt revisions. That is a grounding problem — but the
grounding needed is narrow:

- **A credential and tool dictionary.** "Tally ERP 9", "Tally Prime"
  and "Tally" are one tool. ICAI membership numbers follow a known
  shape. "CA" in an Indian CV means something specific.
- Used to **check** a must-have verdict, not to generate it: if the
  model claims a named tool is met, confirm the CV text actually
  contains that token or a known alias.

Note what this is: a **curated normalisation dictionary of a few
hundred entries**, checked in code. It is not embeddings over a
document collection, and calling it RAG oversells both the machinery
and the difficulty. Vector search would be the wrong shape — these are
exact-match aliases, not semantic neighbours.

**Effort:** days. **Value:** directly attacks the one open model
limitation. **Prerequisite:** the evaluation harness below, or you
cannot tell whether it helped.

---

### Proposal B — one agent per scoring component

**Defensible reasoning, but it targets a part of the system that is not
demonstrably broken.**

The proposal: separate agents for `jdFit`, `experience`, `skills`,
`qualification` and `location`, each doing one job well.

**The case against, in three parts.**

1. **It does not address the observed failures.** Both known errors —
   the Tally hallucination and the 2026 date — are **must-have verdict**
   errors, not component-score errors. Five specialised scorers would
   not have caught either.

2. **Roughly 5× the cost per screening.** Input tokens dominate: the CV
   and the JD would be re-sent to every agent. Latency need not rise if
   the calls run in parallel, but token spend does, and this is a BYOK
   product — the customer pays it and will notice.

3. **It loses the reads that need the whole picture.** `overallRead`,
   `strengths` and `gaps` are comparative judgements across the whole
   CV. `experienceDiscrepancy` spans the CV *and* the declared answers
   — no single-component agent can see both. There is also a new
   failure mode the current design does not have: three agents succeed
   and two fail, and something must decide what a partial screening
   means. Today the call is atomic — it either produces a complete,
   validated assessment or none at all.

**Two refinements of the same instinct that are worth doing.**

**B1 — Split must-have verdicts from component scores.** These are
genuinely different tasks. A must-have verdict is binary, evidence-bound,
and should quote the CV. A component score is holistic and comparative.
They fail differently and deserve different prompts, and the errors we
have seen are all on the verdict side. This is a **two-way split**, not
a five-way one: roughly 2× cost rather than 5×, aimed squarely at where
the defects are.

**B2 — Take `location` out of the model entirely.** Candidate location
versus the opening's location, plus a stated relocation answer, is a
deterministic comparison. Moving it to code makes it cheaper, fully
explainable, and incapable of hallucinating. It also shrinks what the
model is asked to hold.

> A useful test for any "add an agent" proposal: **name the observed
> failure it would have prevented.** If you cannot, the change is
> architecture for its own sake.

---

### Proposal C — rate candidates by hand and use them as a reference set

**The strongest of the three proposals — but "golden dataset" means
three different things, and only two of them are worth doing.**

**First, the finding that makes this proposal land.** The five
components have **no rubric at all.** This is the complete scoring
instruction in the system prompt:

> Score every component 0–10. Components measure: jdFit (how much of
> the day-to-day work in the JD this person has actually done),
> experience (length/seniority against what's asked), skills
> (tools/technical proficiencies named in the JD), qualification
> (credentials/education against what's asked), location …

One clause per component. **Nothing anywhere says what separates a 6
from a 7.** The only constraint is the schema: an integer, 0–10.

That is very likely why the same CV scored 9.0 then 8.6 minutes apart.
The component that moved was **skills, 9 then 7** — and with no anchor
for what a 7 means, drift is expected behaviour rather than a mystery.

#### C1 — As an evaluation set: necessary, but improves nothing by itself

Rate candidates, then measure the model against those ratings. This is
the evaluation harness in Part 2. **It does not make the model more
accurate — it makes accuracy measurable.**

Worth stating plainly, because it is a common and expensive confusion:
teams build an eval set, observe that quality did not change, and
conclude the exercise failed. Its whole value is that every subsequent
change becomes falsifiable.

#### C2 — As calibration examples in the prompt: the best cheap win available

Put a handful of rated examples in the prompt — this CV, against this
JD, scored skills 7, and here is the reasoning. The model calibrates
against real anchors instead of inventing a scale on each run.

**This is very likely a better use of effort than Proposal B**: it
attacks the variance directly, costs a few hundred extra input tokens
rather than 5× the call volume, and needs no new architecture.

**A cheaper version needs no dataset at all.** Hand-written anchors —
one sentence each for what a 2, a 5 and an 8 look like per component —
can ship today and capture most of the benefit. Rated real examples are
the better version of the same idea, not a prerequisite for it.

#### C3 — As fine-tuning data: wrong for this product, at least for now

Fine-tuning needs hundreds of examples, pins you to one provider, and
breaks two properties this product deliberately has: the multi-provider
fallback chain, and the guarantee that any two scores are comparable
because the model and prompt version behind each are recorded. Revisit
only if C2 has been done and measurably falls short.

#### Two caveats to carry into any customer conversation

**Rated examples encode the rater's biases.** Calibrate to one hiring
manager's judgement and you have automated that manager's taste,
including whatever bias sits inside it. The product would become
*consistent* — but consistently reproducing one person's preferences,
which is not what Principle 8 means by "the same yardstick for every
candidate." Mitigation: multiple raters, and treating disagreement
between them as information rather than noise. Inter-rater agreement in
hiring is typically poor, and a set built from one person fits noise as
readily as signal.

**Cold start.** A new customer has no rated data on day one, and
calibration is unlikely to transfer across role types — a set built on
Chartered Accountant applicants will not anchor a sales role. So this
is a "gets better the more you use it" capability, not a launch
feature. Hand-written anchors (C2, cheap version) are what covers day
one.

---

## Part 2 — What I would do first, and why

### 1. Put today's date in the prompt

One line. Closes a known, reproduced defect. Nothing else on this list
is this cheap.

### 2. Build an evaluation harness — the highest-value item here

**Right now, screening quality cannot be measured, only eyeballed.**
Assessment is a human comparing results against
`Testing/baseline-ranking-*.md` by reading. That means:

- No prompt change can be shown to be an improvement
- No model swap can be evaluated before it reaches real candidates
- Neither of the fixes above can be validated
- The observed non-determinism (9.0 then 8.6 on identical input) cannot
  be quantified, only noticed

What it needs: a fixed set of CV/JD pairs with human-agreed expected
outcomes, a runner that screens them all, and a report of ordering
accuracy, must-have verdict accuracy, and run-to-run variance.

**Everything else on this list is guesswork without it.** It is also
the least glamorous item, which is precisely why it gets deferred.

### 3. Give the component scores an anchor

Today nothing in the prompt says what a 6 means versus a 7 — see
Proposal C. Add one sentence per component describing what a 2, a 5 and
an 8 look like.

This needs no dataset, no architecture, and no extra call. It is the
cheapest available attack on the run-to-run variance, and it makes
every score easier to defend to an admin who asks "why 7?".

### 4. Require evidence quotes on every must-have verdict

The prompt already says "if you cannot quote or closely paraphrase the
CV text that satisfies a must-have, it is not met." Make that
**structural**: add a required `evidence` field to the schema, and
validate in code that the quoted string actually appears in the
extracted CV text.

This turns the Tally hallucination from an invisible error into a
**failed validation** — the model must show its work, and a fabricated
quote fails the check rather than reaching a human as fact. It attacks
the same problem as the dictionary in Proposal A, more cheaply, and
without a corpus to maintain.

### 5. Move screening out of the request

Tech spec §10 already argues this. Screening runs inside a web request
via `after()`, best-effort, with a daily cron as the only backstop on
the current plan. The 29 August incident showed the design has no
safety margin: one wrong callback shape and the whole path went silent
with nothing in the logs.

Needs a paid plan for frequent cron, or a queue that outlives the
request. **This is the main thing standing between the current build
and something a paying customer depends on.**

### 6. Record `was_fallback` at write time

Today the "used a fallback" note is derived by comparing a stored
provider against the *current* chain, so it lies after any reorder. The
screening job already knows the truth at the moment it writes. Store it
as a column. *(STATUS Outstanding 4.)*

---

## Part 3 — Product gaps worth closing

- **Structured CTC and notice period.** Free text today ("8 LPA",
  "₹12,00,000", "2 months", "Immediate"), so they can only be searched,
  never ranged. What a recruiter wants is "expected CTC under 12 LPA".
  This is a change to the **apply form**, not the filter — parsing the
  existing strings would mean guessing at a dozen notations, and a wrong
  guess silently drops a candidate. *(Outstanding 5.)*
- **Export bundles as a background job.** CV bundles are capped at 40
  and built in-request; a serverless response has a size ceiling local
  development does not. *(Outstanding 6.)*
- **Non-Latin names in PDF exports.** No font is registered, so
  Helvetica is used and a candidate whose name needs Devanagari or Tamil
  will not render. For an Indian market this is not hypothetical.
  *(Outstanding 8.)*
- **Scheduling that owns availability.** Today the product carries the
  customer's booking link. Reading interviewer calendars, offering
  slots, and handling reschedules natively is the larger product
  described in `ProductContext.md` Pillar 3.
- **Surface score variance in the UI.** Nothing currently tells an
  admin that a rescreen may move a number without anything about the
  candidate having changed. One line of copy. *(Outstanding 14.)*
- **The status page walking backwards.** Rejecting without sending the
  email moves a candidate's page from "Shortlisted" to "Received" with
  no explanation — the one case where the product tells someone
  something worse than what they were already told. Needs a product
  decision, not a patch. *(Outstanding 16.)*

---

## Part 4 — Things that look like improvements and are not

Recorded so they are not proposed again without reading the reasoning.

| Proposal | Why not |
|---|---|
| Auto-reject below a score threshold | Non-Goal 2, permanently. The guardrail is the product |
| Let the model mark must-haves | The whole reason the human step exists — the CA/Tally ambiguity reorders the shortlist |
| Show candidates their scores | Non-Goal 9. Not as an option, not as a setting |
| Send PDFs natively to the model | The open-weight fallback has no vision; it would fail exactly when the fallback is needed |
| `-latest` model aliases | Silently swaps the model, breaking the promise that two scores are comparable |
| Parse existing CTC strings into numbers | A wrong guess silently drops a candidate — the exact failure the filter's transparency exists to prevent |
| Editable screening prompt | PN-003 works through the cost. Every candidate meets the same yardstick |

---

## Summary — the order I would take these

1. **Today's date in the prompt** — minutes, closes a known defect
2. **Evaluation harness** — without it, every change below is unfalsifiable
3. **Hand-written scoring anchors** (Proposal C2, cheap version) — the
   cheapest attack on run-to-run variance; needs no data
4. **Evidence quotes on must-have verdicts** — attacks the one open model limitation
5. **Screening out of the request** — the gap between a demo and a dependency
6. **Location scoring in code** (Proposal B2) — cheaper, deterministic
7. **Rated examples as calibration** (Proposal C2, full version) — once
   there is rated data and a harness to prove it helped
8. **Split verdicts from scores** (Proposal B1) — same caveat
9. **Credential/tool dictionary** (Proposal A, narrowed) — same caveat

**The one-line version:** the cheapest fix on this list closes a real
bug today, the second makes every remaining item measurable rather than
hopeful, and the third is probably the largest accuracy gain per hour
of work — none of which are the two changes originally proposed.

**Note on where the proposals landed.** Proposal A was the wrong size
for the problem it named. Proposal B was aimed at a part of the system
that is not demonstrably broken. **Proposal C was the strongest of the
three** and produced items 3 and 7. Recording that is the point of this
document: the value was in checking each against an observed failure,
not in accepting or rejecting them wholesale.
