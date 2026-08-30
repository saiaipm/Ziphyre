# Ziphyre — presentation outline

**Purpose.** The structure to hand Claude Design, alongside
`ProductContext.md`. Content and narrative live here; Claude Design
handles layout.

**Do not hand over `STATUS.md`.** It is a build handoff — defect
histories, provider configuration, internal milestone numbering, and
references to real candidates' data. It is organised by what broke,
not by what the product does. Anything from it that belongs in a deck
is already restated below in its own words.

**Audience assumed:** people who have not seen the product — a cohort
review, a prospective customer, an advisor. Adjust slide 11 for a
customer audience (they care about what it costs them to adopt, not
about what is unbuilt).

---

## The spine

One sentence per slide, so the argument survives being skimmed.

**1 — Title.** Ziphyre. *AI Powered Screening Desk.* Built for small,
agile teams.

**2 — The person, not the market.** Meera runs hiring between three
other jobs. She is not short of judgement; she is short of hours.
Open on a human, not a TAM slide — the whole product follows from who
she is.

**3 — Where the week actually goes.** Reading a hundred near-identical
CVs to find ten worth a call. Chasing availability. Retyping the same
message. A tracker stale by Wednesday. Name it as *coordination work*,
because that framing is what justifies everything after it.

**4 — What we refuse to build.** Put the guardrail early, not in the
footnotes: screening ranks, it never decides. No auto-reject, no
auto-advance, no candidate outcome without a person. Said before the
AI slide, this reads as conviction; said after, it reads as a
disclaimer.

**5 — The shape of the product.** The five pillars as one diagram —
intake, screening, pipeline, communication, candidate transparency —
with the arrow that matters: requirements set at intake are the
yardstick everything downstream measures against.

**6 — Intake.** One link, no accounts on either side, no job board.
Candidates apply on a page we host; the team can also drop CVs in
directly, because real hiring here arrives by WhatsApp and forwarded
email. Both produce the same application.

**7 — Screening, and its receipts.** A score with component ratings,
must-have results, and the reasoning in plain language. The point to
land: *the number is never alone*. Show a real assessment, including
one the model got arguably wrong — it is more persuasive than a clean
one, and it is the honest version.

**8 — Requirements are a human's call.** The job description said
Tally was mandatory and never used that word for the CA qualification.
Read either way, the shortlist reorders completely. So the product
extracts requirements and marks nothing non-negotiable until a person
does. This slide is the best single proof that the guardrail is real
rather than marketing.

**9 — The pipeline.** One live view, stage moves single or in bulk,
filters, and a history that keeps reversals. Status is a byproduct of
doing the work, never a separate chore.

**10 — Nothing sends itself.** Every message is offered at the moment
of the decision, unticked, naming how many real people will receive
it. One exception: the acknowledgement that an application arrived.
Frame it as the strong claim it is — the product makes the message
impossible to forget without ever sending it unasked.

**11 — The candidate's side.** The half nobody demos. A private link,
no account, plain-English status, and the retention promise made
before they submit. Land the rule underneath: a candidate is never
shown an outcome a person has not chosen to send them, so an internal
rejection reads as still in progress until someone tells them.

**12 — Proof, not slideware.** The journey end to end on production:
applied, screened unattended in three seconds, acknowledgement with a
working status link, shortlisted, interview booked through a real
calendar link, rejected, and the status page turning over at the
moment a person chose to send it. This is the slide that separates a
demo from a deck.

**13 — What is deliberately not built.** Not an HRMS, not a job board,
not an assessment platform, not an enterprise ATS, and not an
automatic decision-maker — permanently. Then the honest near-term
list: scheduling today carries the team's own booking link rather than
owning availability. Saying this unprompted buys more credibility than
it costs.

**14 — Where it goes.** The four roadmap themes in one line each:
deeper evaluation beyond the CV, filling the funnel, learning from
outcomes, offer to first day.

---

## Direction for Claude Design

- **Tone.** Calm, dense, confident. This product's voice is plain and
  unhedged; the deck should match. No stock imagery, no gradients, no
  rocket ships.
- **Type over decoration.** Most slides are one claim plus evidence.
  Let the claim be large and the evidence small and precise.
- **The through-line is trust.** Slides 4, 8, 10, 11 and 13 are one
  argument in five places: a person decides, and the product is honest
  about what it does and does not do. Design them as a recognisable
  family so the repetition is felt.
- **Screenshots are the proof.** Slides 7, 9, 11 and 12 should carry
  real captures, not mockups. Real data is more convincing than tidy
  data — use the sample pipeline (fabricated candidates, marked as
  sample) so no real person appears.
- **One diagram only**, on slide 5. If a second diagram appears,
  something that should have been a sentence has become a picture.

## Screenshots to capture first

The deck is only as good as these; take them before designing.

1. Home — the funnel reconciling, counts per opening
2. Pipeline table — scores, must-haves, stages, one row expanded to a
   full assessment
3. Requirements — the marking step, with must-haves set by hand
4. The apply page as a candidate sees it
5. The candidate status page, in two states — in progress, and an
   outcome that has been sent
6. The send offer — unticked, with the recipient count on the button
7. Communications outbox — sent, never "delivered"

## Two cautions

- **Use the sample pipeline, not the real one.** Fabricated
  candidates, marked as sample everywhere they appear. No real
  applicant should be on a slide.
- **Do not screenshot the screening prompt or provider settings.**
  Neither helps the story, and one of them is a credential surface.
