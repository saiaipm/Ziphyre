# Product Note 005 — Sample data

**Status:** Building, 29 August 2026.
**Author:** Working note from the M8 session.
**Related:** ProductContext Principle 1 (screening ranks, never decides)
· TechDecisions §7 (scores are immutable, always model-produced) ·
STATUS.md "M2 test result" · tech spec §19.

---

## The ask, in one line

Every candidate in the product today is a real person. That was right
for proving the screening pipeline in M2; it is wrong the moment a
prospective client is shown the product, and it will still be wrong the
moment a real customer signs up with nothing in their pipeline yet.

---

## Two separate problems, one feature

**1. A demo should never show a stranger's real CV.** The seven CVs in
`CA Role Sample Resumes/` are real applicants' real documents. They were
gitignored from day one specifically because they're not Ziphyre's to
share (`STATUS.md`, "Local setup notes"). Showing them to anyone outside
this project — a prospective client, a teammate screen-sharing a demo —
is the exact leak that gitignore was protecting against, just through a
different door.

**2. A brand-new org has nothing to look at.** Flow A in the functional
spec is "Meera signs in to an empty workspace… create the first
posting." That's correct and honest, but it means the very first thing
anyone sees is a blank product. A seeded, clearly-marked sample pipeline
lets a new org explore filtering, scoring, the pipeline table, and
exports before they've posted a single real role.

Both problems are solved by the same mechanism: fabricated candidates,
scored for real, that an org can show or hide.

---

## Why fabricated, and why scored for real

The alternative to writing six fictional CVs would be hand-entering
plausible-looking scores directly into `screening`. That breaks the one
rule this product has never broken: **a score always comes from the
model** (TechDecisions §7; `screening` has no update policy specifically
so a score, once produced, cannot be quietly changed by anyone,
including by seeding it). A demo showing a number no model ever produced
would be lying about the one thing screening exists to be honest about —
Principle 1, "screening ranks, never decides," implicitly assumes the
ranking is real.

So the six candidates are fabricated **people**, but their scores are
produced by the same screening pipeline every real candidate goes
through — extraction, must-have marking, the AI call, the fallback
chain, all of it. If the model doesn't land them exactly where intended,
that's reported honestly, the same way the real M2 test reported the
Tally hallucination rather than hiding it.

---

## Why a toggle, not a one-time swap

The original ask was simpler — replace the real CVs on the existing
opening with fabricated ones. Two reasons that's the wrong shape:

**It only solves problem 1.** A one-time swap does nothing for a brand
new org exploring an empty workspace six months from now.

**It's not reversible in the right direction.** Once real applicants
exist, an org wants its own pipeline back, not the sample one — a
one-time swap has no way back. A toggle does: `organization.
show_sample_data`, off by choice once real data exists, on by default
until then.

---

## Where the flag lives, and why not somewhere else

`posting.is_sample`, not `opening.is_sample` or `candidate.is_sample`.
Every place that lists postings or aggregates across them —
`getPostingsForOrg()`, `getOverviewMetrics()` — already fetches at the
posting level and derives openings, applications, and the funnel from
that one fetch. Marking the posting is the single point that propagates
to everywhere the toggle needs to reach, without touching every
downstream table.

This is deliberately **not** an RLS policy. RLS answers "which
organisation can see this row" — a tenant boundary. This is "does this
one organisation want to see this row right now" — a display
preference, decided per request from a column already on the session.
Filtering it in the two functions that already assemble the lists is
simpler than teaching Postgres about a concept it doesn't need to know.

---

## What stays out of scope here

**Retiring the seven real CVs is not this feature.** It's a deliberate,
irreversible, human decision about real people's data, on the user's own
timeline — this note and the toggle exist independently of when, or
whether, that happens.

**No mail, ever, to a sample candidate.** They get the same placeholder
address a manual upload gives a real candidate with no verified email
(`manual+<uuid>@ziphyre.internal`) — never a real-looking one that could
one day collide with an actual person's address.

**No change to the real CA posting.** It keeps its data and its
`is_sample = false`; the toggle cannot touch it either way.
