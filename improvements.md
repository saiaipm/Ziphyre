# Ziphyre — Improvements & Future Scope

**What this is.** Candidate improvements, assessed honestly — including
two that were proposed and one of which should not be built as
proposed. Ordered by value per unit of effort, not by ambition.

**What this is not.** A roadmap commitment, and not a bug list.
Outstanding defects live in `STATUS.md`; product direction lives in
`ProductContext.md` §10.

---

## Part 1 — Two proposals, assessed

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

### 3. Require evidence quotes on every must-have verdict

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

### 4. Move screening out of the request

Tech spec §10 already argues this. Screening runs inside a web request
via `after()`, best-effort, with a daily cron as the only backstop on
the current plan. The 29 August incident showed the design has no
safety margin: one wrong callback shape and the whole path went silent
with nothing in the logs.

Needs a paid plan for frequent cron, or a queue that outlives the
request. **This is the main thing standing between the current build
and something a paying customer depends on.**

### 5. Record `was_fallback` at write time

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
3. **Evidence quotes on must-have verdicts** — attacks the one open model limitation
4. **Screening out of the request** — the gap between a demo and a dependency
5. **Location scoring in code** (Proposal B2) — cheaper, deterministic
6. **Split verdicts from scores** (Proposal B1) — only once the harness can prove it helped
7. **Credential/tool dictionary** (Proposal A, narrowed) — same caveat

**The one-line version:** the cheapest fix on this list closes a real
bug today, and the second item is what makes every remaining item
measurable rather than hopeful.
