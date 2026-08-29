# Baseline Ranking — Mock Chartered Accountant candidates (M8 sample data)

**Date:** 29 August 2026
**Purpose:** The intended ranking for the six fabricated CA candidates
built for the sample-data toggle (PN-005), recorded *before* — and
compared honestly against — what the real screening pipeline actually
produced. Same role `baseline-ranking-CA-role.md` plays for the seven
real applicants: the yardstick, written so it can't be adjusted after
seeing the result.

**No real person is described here.** Every candidate, employer and CV
in `MockData/CA-Role-Sample-CVs/` is fabricated. Unlike the real
baseline this document sits beside, there is no privacy reason to
gitignore this one.

**How it was produced.** Not by clicking through the UI — no
authenticated browser session was available to do that. Each step
called this project's own real functions directly: `extractRequirements()`
for the requirement list, and `runScreenApplication()` — the literal
job handler a real candidate's CV runs through — for every score. See
`scripts/seed-sample-data.ts`. No score in this document was authored
by hand; PN-005's one rule holds for the fabricated candidates exactly
as it holds for real ones.

---

## The JD's must-haves

Same two decisions the real CA opening's admin made (`STATUS.md`, "M2
test result"): **Qualified Chartered Accountant (ICAI)** and **hands-on
Tally experience** are must-haves. Everything else the extraction
proposed — MS Excel, analytical/communication skills, 2–4 years'
experience, Hyderabad location — stayed preferred, the same shape as
the real opening.

---

## Intended ranking

| # | Candidate | Intended | Why |
|---|---|---|---|
| 1 | Ananya Krishnan | Shortlist | Qualified CA, 3 yrs post-qual, direct GST/TDS/reconciliation/finalisation experience, daily Tally use |
| 2 | Rohan Deshmukh | Shortlist | Qualified CA, 4 yrs in-house corporate finance, MIS/budgeting/audit-facilitation, daily Tally use |
| 3 | Vikram Nair | Neutral | Fully qualified CA (2026) but freshly qualified, articleship-only depth, "exposure to Tally" rather than confirmed hands-on use |
| 4 | Priya Varadarajan | Neutral | Real GST/TDS/Tally experience via articleship, but genuinely not yet CA-qualified — the must-have-as-hard-gate case |
| 5 | Kavya Reddy | Reject | B.Com only, CA attempted and not completed, thin bookkeeping-only experience |
| 6 | Arjun Malhotra | Reject | No accounting background at all — sales/BD, applying speculatively |

---

## What the real pipeline actually produced

| Candidate | Overall | Must-haves | Landed |
|---|---|---|---|
| Ananya Krishnan | **9.0** | Met | Shortlist — matches intent |
| Rohan Deshmukh | **8.2** | Met | Shortlist — matches intent |
| Vikram Nair | **6.6** | **Not met** | Reject-leaning, not neutral |
| Priya Varadarajan | **3.8** | Not met | Reject-leaning, not neutral |
| Kavya Reddy | **4.0** | Not met | Reject — matches intent |
| Arjun Malhotra | **2.4** | Not met | Reject — matches intent |

**Good: the two clear ends landed exactly where intended.** Ananya and
Rohan cleared both must-haves and scored highest; Kavya and Arjun
failed the CA must-have and scored lowest, in the right order relative
to each other (Arjun's total absence of accounting experience read as
meaningfully worse than Kavya's real, if thin, bookkeeping background).

**Real finding: neither "neutral" candidate landed in the middle.**
Both intended-neutral candidates failed a must-have, and in this
product's design a failed must-have is a hard gate that suppresses the
score — by design, not a bug (the same design the real baseline
document's central finding argues *for*: a reader assumes CA is a hard
gate, and this product makes sure the model does too). There is no
path to a true middle band for a candidate who fails one. That is a
flaw in how these two CVs were built, not in the screening: to get a
genuinely neutral result, a candidate needs to **clear both must-haves**
and be middling on everything else — which neither Vikram nor Priya
does by design (both were written to miss the CA qualification).

Vikram and Priya still discriminate usefully from each other and from
the two clear rejects (6.6 and 3.8, against 4.0 and 2.4) — the ranking
inside the "missed a must-have" cluster is coherent even though none of
these four cleanly is a "shortlist vs. clearly-not" split the way the
top and bottom pairs are.

**A specific model limitation worth recording, in the same spirit as
TechDecisions §7's Tally hallucination.** Vikram Nair's CV states
plainly: *"Chartered Accountant — Institute of Chartered Accountants of
India (ICAI), 2026."* He is, on paper, unambiguously qualified. The
model marked the CA must-have **not met**, with this note:

> "The CV states the candidate is a recently qualified Chartered
> Accountant, but does not specify 'qualified Chartered Accountant
> (ICAI)'. The expected qualification year is 2026."

That reads as the model treating **2026 as a future, not-yet-reached
year** — reasonable only if it has no notion of today's date, which it
doesn't: nothing in the screening prompt or its inputs supplies one.
Today, per this session, is 29 August 2026 — Vikram's qualification is
eight months in the past, not pending. **Accepted, not fixed, exactly
like the Tally hallucination** — recorded here because it is a second,
independent instance of the same class of failure (the model inferring
something the CV doesn't actually leave ambiguous), and because a
future candidate whose CV states a *current-year* qualification is
likely to hit the same misreading. Worth revisiting if the pattern
repeats with a real candidate, not chased further here.

The Tally half of Vikram's must-have miss is a fair, defensible read:
his CV says "exposure to Tally… during audit assignments," which is
genuinely short of "hands-on experience" — the model got that one
right.

---

## Verdict

**Trustworthy for what it is asked to do**, the same conclusion the
real baseline reaches: it ranks the strongest candidates first,
separates the qualified from the unqualified correctly at both ends,
and the one surprising call (Vikram) is explainable and narrow rather
than a wrong ranking. The lesson for building test fixtures, not for
the product: a "neutral" candidate for a role with hard must-haves has
to clear them to land in the middle — missing one is definitionally a
reject-leaning outcome here, and that is the design working as
intended.
