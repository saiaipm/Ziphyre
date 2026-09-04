# The Tally Story

**Why this document exists.** One real hiring case produced three
separate findings, each of which shaped the product. Told well, it is
the most persuasive ninety seconds in the demo — it turns "we added
guardrails" into "here is what happened when we didn't have them."

**Before anything else:** never name the candidate or the employer.
The candidate's data has since been deleted. "A candidate", "the
employer", "the role" is all the story needs, and it lands just as
hard.

---

## The 30-second version

> A real job description said Tally was mandatory. The strongest
> candidate in the pool — a qualified Chartered Accountant from a Big
> Four affiliate — never mentioned Tally on their CV. Any product that
> auto-rejects on a missed mandatory requirement would have thrown away
> the best applicant over an omission.
>
> Then the AI made it worse: it claimed that candidate *did* have Tally
> experience. It didn't. The CV never says so.
>
> Three things had to be true for that person to survive: a human
> decided what counted as mandatory, a missed requirement was a flag
> rather than a rejection, and a human read the AI's reasoning instead
> of trusting it.

---

## Setup: what you need to know

**Tally** is accounting software — near-ubiquitous in Indian small and
mid-sized businesses. For a finance role in this market, "knows Tally"
is a completely normal thing to ask for.

**The role** was a Chartered Accountant position, in office, in
Hyderabad. **Seven real people applied.** The job description named two
things that mattered: a CA qualification, and hands-on Tally
experience.

That's the whole setup. Everything below follows from one ambiguous
job description.

---

## Act 1 — The job description didn't say what it meant

The job description **explicitly called Tally and Excel "mandatory."**

The CA qualification? It sat under a heading called **"Educational
Requirement."** The word "mandatory" never appears anywhere near it.

So: read literally, Tally is the hard requirement and the CA
qualification is a nice-to-have. Read the way any human recruiter
would, the CA qualification is obviously non-negotiable for a
Chartered Accountant role — it's in the job title.

**Both readings are defensible from the text alone.**

We tested it both ways against the seven real applicants. Reading it
one way versus the other **completely reorders the middle of the
shortlist — three candidates swap places** on the strength of one
ambiguous line.

> ### What this changed in the product
> Requirement extraction reads the job description and lists what it
> asks for — **but marks nothing as mandatory.** Everything arrives as
> "preferred," and a person ticks the boxes that are genuinely
> non-negotiable.
>
> **The line to say out loud:** "If we let the AI decide what's
> mandatory, it would have to resolve an ambiguity that a human
> recruiter resolves with one glance at the job title. And it would do
> it silently, on every role, forever."

---

## Act 2 — The best candidate failed the mandatory requirement

With Tally marked mandatory, one candidate failed the gate.

That candidate was **the strongest applicant in the pool** — a
qualified Chartered Accountant working at a Big Four affiliate. Top of
the ranking on every other measure.

They failed because **their CV simply doesn't mention Tally.** Not
because they can't use it. A qualified CA at that level has almost
certainly used Tally; they just didn't list it, the way nobody lists
every tool they've touched.

**An automatic filter would have discarded the best applicant in the
pool over a CV omission.**

> ### What this changed in the product
> A missed must-have is shown as **a prominent flag next to the score,
> never a rejection.** It is also never averaged away — it sits beside
> the number as its own fact, so a strong-but-non-compliant candidate
> can't quietly blend in with a middling one.
>
> **The line to say out loud:** "A CV is not a person. It's a summary
> someone wrote in twenty minutes. Treating an omission as a fact about
> the candidate is the single easiest way to lose your best applicant."

---

## Act 3 — Then the AI hallucinated

Here is where it gets genuinely uncomfortable, and why this story is
worth telling honestly.

On the first screening pass, the model made **two** mistakes:

1. It marked a candidate whose CV lists only an MBA, M.Com and B.Com as
   a **qualified Chartered Accountant.** They aren't one.
2. It credited **that same top-ranked candidate with Tally experience
   their CV never mentions.**

Both were checked against the actual extracted CV text — not assumed,
not eyeballed. The text simply isn't there.

**We tightened the prompt.** It now demands the CV name the exact
credential or tool, and says explicitly that adjacent experience is not
evidence — years of accounting work does not imply a CA credential.

- That **fixed the qualification error outright.**
- The **Tally hallucination survived two more prompt revisions**
  (`screen-v2`, `screen-v3`), including an explicit instruction to
  quote or closely paraphrase the CV.

**The likely reason** — and this is the interesting part — is that the
model is pattern-matching "Indian CA / accounting résumé" against its
training prior. It has seen thousands of CVs like this one, and most of
them mention Tally. It is answering from the shape of the document
rather than reading this specific document.

**Decision, 22 August 2026: accepted as a known limitation, not
chased further.** Prompt-tuning against one hallucinating case has
diminishing returns. The honest structural fix — require the model to
quote the exact CV sentence backing every "met" verdict, so a
fabricated quote fails a check in code — is recorded in
`improvements.md` as the next step.

> ### What this changed in the product
> Nothing in the pipeline treats "met: true" as ground truth. The
> reasoning is always shown next to the verdict, because a human
> reading it is the actual safeguard.
>
> **The line to say out loud:** "We could have quietly tuned this until
> the demo looked clean. We wrote it down instead — because a customer
> needs to know the failure mode exists, not discover it on a candidate
> who matters to them."

---

## The punchline: three safeguards, and this case needed all three

Follow one candidate through the whole story:

| Stage | What went wrong | What saved them |
|---|---|---|
| Reading the JD | Ambiguous about what's mandatory | **A human marked the must-haves** |
| Checking requirements | Their CV omits Tally | **A missed must-have flags, never rejects** |
| Reading the AI's verdict | The model invented Tally experience | **A human reads the reasoning** |

**Remove any one of the three and the outcome is wrong.**

- No human marking → Tally is mandatory and the CA qualification isn't
- No flag-not-gate → the best candidate is auto-rejected on an omission
- No human reading the reasoning → a hallucinated "met" passes as fact

And note the sharpest irony: **the hallucination accidentally
"rescued" the candidate from a gate they should have failed.** Two
errors cancelling out is not a system working. It's a system that got
lucky — which is exactly the argument for not letting either error
decide anything on its own.

---

## How to tell it live, in about 90 seconds

1. **Set it up.** "Real job description, real CA role in Hyderabad,
   seven real applicants. The JD says Tally is mandatory."
2. **The ambiguity.** "It calls Tally mandatory. The CA qualification
   sits under 'Educational Requirement' — the word mandatory never
   appears. Read it either way and three candidates swap places in the
   shortlist."
3. **The omission.** "So we mark Tally mandatory. The strongest
   candidate in the pool — a qualified CA at a Big Four affiliate —
   fails, because their CV doesn't happen to list Tally."
4. **Pause here.** "An auto-reject would have binned the best applicant
   over an omission."
5. **The hallucination.** "Then the AI told us they *did* have Tally
   experience. They don't. It's not in the CV. We tightened the prompt
   twice; it kept saying it."
6. **Land it.** "Three safeguards. This one case needed all three."

**If you only have 20 seconds:** points 3, 4 and 6.

---

## If someone asks

**"Couldn't you just fix the prompt?"**
We tried, twice. It fixed the qualification error and not this one.
The structural fix — make the model quote the CV sentence, then verify
that sentence actually appears in code — is written up in
`improvements.md`. That turns a hallucination from something you have
to notice into something that fails a check.

**"So the AI is unreliable?"**
On this task it's a strong first pass and an unreliable final word,
which is exactly how the product treats it. It ranks; it never decides.
The failure costs a human about thirty seconds of reading. It never
costs a candidate their application.

**"How often does this happen?"**
Honestly: we don't know, and that's a real gap. Screening quality is
currently assessed by a person comparing results against a baseline.
Building an evaluation harness that can measure it is the top item in
`improvements.md` — you can't improve what you can't measure.

**"Why is this in your demo at all?"**
Because a product that only shows you its clean runs is a product
you'll find the failure modes of yourself, later, with a real
candidate.

---

**Sources:** `ProductNotes/PN-001` §1 and the screening-output section
(the ambiguity and the omission), `TechDecisions.md` §7 (the
hallucination and the 22 Aug decision), `STATUS.md` Outstanding 11.
