# Product Note 001 — Admin Dashboard, Form Intake & Automated Screening

**Status:** Ready for Functional Spec
**Date:** 15 August 2026 (revised)
**Reads with:** `ProductContext.md` (product truth — personas, pillars, principles, glossary)
**Pillars touched:** Roles & Application Intake · Screening & Scoring · Pipeline Tracking & Shortlisting

---

## The ask, in one line

Give an MSME admin a single dashboard where applications arriving through a Google Form are automatically screened against the job description, scored on named components, and worked through a pipeline they can filter and export.

---

## Why this, why now

This is Ziphyre's first working slice. It targets the pain ProductContext identifies as the biggest and least rewarding part of Meera's week: reading the CV pile. Everything else in the product — scheduling, outreach, candidate status — only earns its place once the hiring team trusts what comes out of screening.

We use Google Forms for intake because it is the reliable, zero-build option in the ecosystem MSMEs already live in. The admin does not have to learn a new tool to receive applications, and candidates do not have to trust an unfamiliar site with their CV.

The first real test case is a live Chartered Accountant role at the pilot company, with seven real applicant CVs already in hand.

---

## Who this is for

**Primary: Meera (HR Generalist) and Rahul (Founder).** Both operate as the single Admin in this build. Meera lives in the dashboard daily; Rahul opens it to see whether hiring is moving.

**Not served in this build:** Priya (Candidate) sees nothing beyond Google's own form receipt. Arjun (Hiring Manager) and Sana (External Recruiter) have no access — they receive exported files instead.

---

## How the pieces relate

Four concepts. Getting these right matters more than any screen.

**Posting** — a hiring drive the admin opens from the dashboard. Owns exactly one Google Form, one response sheet, and one shareable link. Has a lifecycle: open, then closed. A posting is what the admin shares to a job board, WhatsApp group, or their network.

**Opening** — a specific role inside a posting: Chartered Accountant, Social Media Manager, Designer. Candidates pick one from a dropdown on the form. **Each opening carries its own job description and its own scoring weights** — this is what screening measures against. A posting with three openings screens its applicants three different ways.

**Application** — one candidate's submission for one opening. Carries their form answers, their CV, and everything Ziphyre adds: score, assessment, stage, notes.

**Candidate** — a person, identified by their verified email. The same person may hold applications across several openings and postings. Ziphyre should recognise them as one person even when their applications live in different sheets.

> **Note for ProductContext:** the glossary currently names *Role* as the single organising object. This note introduces a level above it. ProductContext should be updated so *Posting* and *Opening* are defined, with *Role* clarified as a synonym for *Opening*. Flagged rather than done — it's a change to product truth, not to this feature.

---

## What we're building

### 1. Create and manage a posting

The admin creates a posting in the dashboard, defines the openings within it, and attaches a job description to each opening. Ziphyre provides a form template for the admin to copy; the admin connects the resulting form and its response sheet back to the posting, and shares the link wherever they normally advertise.

**Attaching the JD is not enough — the admin must mark which requirements are must-haves.** Job descriptions do not reliably signal their own priorities. The real pilot CA description explicitly calls Tally and Excel "mandatory" but files the CA qualification under a heading called "Educational Requirement," never using the word. A person reads that as a hard requirement; nothing in the text says so. Testing against seven real applicants showed that reading it one way versus the other **completely reorders the middle of the shortlist** — three candidates swap places on the strength of one ambiguous line.

So when an opening is created, Ziphyre asks the admin to mark each key requirement as **must-have** or **preferred**. This is a short step, and it is the difference between a ranking the admin agrees with and one they have to argue with.

The form's role dropdown must list the same openings the admin configured. Where a submission arrives naming an opening Ziphyre doesn't recognise, it must be surfaced clearly rather than silently dropped.

Closing a posting stops it accepting new applications. Existing applications remain fully workable.

### 2. The form template

Generic for this build — the same fields for every posting. Customisation comes later.

Name · Email · Location · Work experience · Notice period · Current CTC · Expected CTC · CV upload · Role applied for (dropdown)

**Work experience is captured as two numeric boxes — years and months** — rather than free text, so it can be filtered and sorted as a real quantity. Years accepts 0 upward; months accepts 0 to 11. Free text ("3 yrs 6 months", "since March 2022") cannot be filtered on, and asking the candidate for a number is far cheaper than interpreting what they typed.

Two settings are deliberate, not incidental:
- **Google sign-in is required**, because the CV upload demands it. This verifies the candidate's email, which is what makes duplicate detection trustworthy.
- **Google's one-response limit stays off.** It caps responses per *form*, not per *opening*, and would stop a candidate applying to a second opening in the same posting. Once-per-opening is enforced by Ziphyre instead.

### 3. Intake and seeding

Applications reach a posting two ways:

**Through the form** — the main path. New submissions appear in the dashboard on their own, without the admin refreshing or importing anything.

**Added by the admin** — CVs that arrive by email, WhatsApp, or referral, uploaded directly into an opening, singly or in bulk. This is a permanent capability, not a testing convenience: it is how MSMEs actually receive CVs, and it is the fallback for candidates who can't or won't sign in to Google. Manually added candidates are screened exactly like form submissions.

**These candidates have no form answers.** No declared experience, notice period, or CTC — only a CV. The consequence is concrete: they are absent from any filter built on those fields, so an admin filtering for "3+ years" would not see them at all. The dashboard must make this visible as *not provided* rather than showing an empty cell, and the admin must be able to fill the fields in by hand. Silently excluding a candidate from a filter is the same failure as losing them.

The seven existing CA resumes enter through this path.

### 4. Automatic screening

Screening starts on its own when an application arrives — no button. While it runs, the application is visible in the dashboard in a clearly unfinished state. A candidate must never be invisible because their screening hasn't finished.

Each screened application produces:

- **Component ratings, each out of 10** — JD Fit, Experience, Skills, Qualification, **Location**. Fixed set for this build.
- **An overall score out of 10**, a weighted roll-up of the components. **This build weights all five components equally — a straight average.** Custom weights per opening are a later refinement. Whatever the weighting, it is always stated on screen; a roll-up the admin can't see the shape of is the same trust problem as a bare number.
- **A must-have check** — whether the candidate meets every requirement the admin marked as mandatory, and which ones they miss.

**Location is scored, not gated.** The pilot role is Hyderabad, in office, six days a week; three of seven test applicants are in other cities. That is real, material, and none of the other components capture it — so it becomes a component of its own. It is deliberately *not* a gate: people relocate, particularly for the right role, and a hard geographic cut would silently discard candidates worth a conversation.

**A must-have failure is never averaged away.** This is the point of keeping the check separate from the score. A candidate who misses a mandatory requirement but is strong everywhere else will still roll up to a respectable overall — in testing, two applicants who failed a stated requirement outright still landed near 6 out of 10, sitting indistinguishably among candidates who met everything. So the must-have check is shown as its own prominent fact next to the score, and the pipeline can be filtered by it.

It remains a **flag, never a rejection.** The admin sees "does not meet: Qualified CA" and decides. Testing made the case for this vividly: Tally is the one skill the JD calls mandatory, and the strongest overall candidate — a qualified CA from a Big Four affiliate — simply never mentions it on her CV. Any automatic filter would have discarded the best applicant in the pool over a CV omission.
- **An assessment summary** — the candidate's strengths, their gaps against this job description, and an overall read of fit.

Framing matters: gaps are stated as *distance from this JD*, never as judgements about the person. Same information, and it holds up if it is ever read aloud or exported.

**Declared experience versus evidenced experience.** The form asks the candidate how long they have worked; the CV shows what they have actually done. These will sometimes disagree. Screening should treat the CV as the evidence and surface a material mismatch to the admin rather than quietly picking one. A gap between what someone claims and what their CV supports is useful information for a hiring decision, not an inconsistency to be resolved away.

**When screening can't run** — an unreadable scan, a corrupt file, a CV that isn't a CV — the application is marked as needing manual review and stays in the pipeline. It is never dropped, never silently zero-scored. A candidate who broke our parser has not applied any less.

**Provenance.** Every score records which job description version and which AI provider produced it. Scores from different JD versions or different providers are not strictly comparable, and the dashboard should not pretend otherwise.

**Rescreening.** Editing an opening's job description offers to rescreen its applications. Never automatic, never silent.

### 5. AI provider choice

The admin can choose which AI provider performs screening and supply their own key — OpenAI, Google Gemini, or NVIDIA NIM. This is a product capability, not a configuration detail: it gives the customer control over cost and over where their candidate data is processed, which matters for a business handling other people's personal information.

**The list is deliberately short, and deliberately not the most capable models available.** Screening is high-volume and low-complexity — extraction plus a bounded judgement, run once per application. The cheap, fast tier is the right tool; frontier reasoning models would multiply cost and latency without scoring candidates any better. One model per provider, shown by its official name.

Switching providers does not rescreen anything already scored.

### 6. The pipeline

One view per opening, listing every application with its score, components, stage, and key form fields. Stages:

**New → Screened → Shortlisted → On Hold → Rejected**

Moved manually by the admin, **individually or several at a time**. Batch shortlisting and rejecting is in scope: it is what makes working through a pile in one sitting possible, and ProductContext's Journey 6 depends on it.

Screening informs the decision; it never makes it. No score, however low, moves a candidate anywhere on its own — this is a permanent guardrail from ProductContext, not a limitation of this build. That holds for batch actions too: selecting twenty candidates and rejecting them is a human decision, and it is recorded as one.

The admin can also reassign a candidate to a different opening, for the people who pick the wrong one from the dropdown.

**Reviewing the CV happens inside the dashboard.** The CV is readable next to the assessment without leaving the pipeline — bouncing out to Drive and back for every candidate is exactly the friction this build exists to remove. A link to open the original file is available as an escape hatch.

**The response sheet owns submission data; Ziphyre owns pipeline state.** Ziphyre never writes back to the sheet. If a row is edited by hand, the updated answers are reflected. If a row is deleted, the application stays in Ziphyre, flagged as no longer present at source — a candidate does not stop existing because a spreadsheet row was removed.

Repeat submissions from the same verified email to the same opening are flagged as possible duplicates, with the newer CV treated as an update. The admin decides; Ziphyre never merges silently.

Scores cannot be edited. An admin who disagrees records a different decision and their reason. Editable scores stop being comparable and destroy the ranking's value.

### 7. Filtering

Across form fields (experience, location, notice period, CTC) and Ziphyre's own data (overall score range, component scores, stage, screening status, **and whether the candidate meets all must-haves**). Filters combine. Saved filter views are out of scope.

The must-have filter is the one that earns its place first: on the CA role it separates two qualified applicants from five who are not, in a single action.

### 8. Export

For sharing internally — with a director, a department head, or a colleague reviewing a shortlist. Because the audience is internal, exports carry the scores and assessment summaries.

- **Spreadsheet formats (CSV and Excel)** — the full picture: form answers, component ratings, overall score, stage. For sorting, analysis, and anyone who wants to work the data themselves.
- **A document format (PDF)** — a readable shortlist: each candidate with their scores and assessment summary, in an order the admin chose. For sending to a director who wants to read, not filter.
- **Optionally, the CV files alongside** — because "send me the shortlist" usually means the CVs too.

The admin chooses whether to export everything in the current view or only selected candidates; filters applied on screen carry into the export.

Every export is marked internal and carries personal data out of our control the moment it is downloaded. Treat that as a real consequence in the spec, not a footnote.

---

## Explicitly out of scope

- Candidate-facing status — Priya sees nothing but Google's form receipt
- Outreach, acknowledgements, rejection messages
- Interview scheduling
- Roles and permissions beyond a single admin
- Custom form fields per posting
- Custom scoring weights per opening (defaults only)
- Saved filter views
- Ziphyre generating the Google Form automatically — expected next, not now

---

## Decisions already taken

| Question | Decision |
|---|---|
| Form granularity | One form per posting; openings selected by dropdown |
| Google's one-response limit | Off — Ziphyre enforces once per opening on verified email |
| Google sign-in | Required, accepted as the cost of file upload |
| Form creation | Admin copies a Ziphyre template; auto-generation comes later |
| Form fields | Fixed generic set; customisation later |
| Work experience | Two numeric boxes — years, and months 0–11 — not free text |
| Score components | JD Fit, Experience, Skills, Qualification, Location — five, fixed |
| Component weighting | Equal across all five components this build; custom weights later |
| Must-haves | Admin marks requirements as must-have or preferred when creating an opening |
| Must-have failure | Shown as its own flag beside the score, filterable, never a rejection |
| Location | A scored component, deliberately not a gate |
| Batch actions | In scope — shortlist, hold, reject several at once |
| CV review | Read inside the dashboard, with a link to the original |
| Sheet edits | Sheet owns submission data, Ziphyre owns pipeline state, no write-back |
| Export formats | CSV and Excel (full data), PDF (readable shortlist), CV files optional |
| Screening trigger | Automatic on arrival |
| Score shape | Components out of 10, weighted roll-up to an overall out of 10 |
| Weights | Per opening, visible, defaults this build |
| Score editing | Not permitted |
| JD change | Offers rescreen, never automatic |
| Duplicates | Flagged for the admin, never silently merged |
| Stages | New, Screened, Shortlisted, On Hold, Rejected |
| Access | Single admin |
| Manual CV upload | Permanent capability |
| AI provider | Admin-selectable, bring your own key — OpenAI, Google Gemini, NVIDIA NIM |
| Multiple providers | Several configurable at once, in an explicit order, with automatic fallback |
| Fallback visibility | Never silent — when a fallback produced a result, the interface says so |
| Model tier | Cheap/fast tier only, one model per provider, official names shown |
| CV input to the model | Text extracted first, then sent as text — one pipeline for all three providers |

---

## How we'll know it worked

**The real test is whether the ranking is trustworthy.** The independent human ranking of the seven CA applicants is already written and dated, in `Testing/baseline-ranking-CA-role.md`. It was produced before any screening existed, precisely so it cannot be adjusted to match whatever the product turns out to produce.

Measured against it:

- Does screening separate the two qualified CAs from the five who are not?
- Does it place the strongest candidate first — and where it disagrees with the baseline, does the assessment explain the disagreement persuasively? Disagreement is not automatic failure. Unexplainable disagreement is.
- Does it surface the candidate whose CV claims 4.3 years while its own dates evidence 6.2, without being told to look?
- Do the seven scores spread across a usable range, or cluster between 6 and 8?
- Does the assessment give a reason a hiring manager would accept, or does it restate the CV?

All seven CVs parse cleanly as text, so this set does **not** exercise the manual-review path. A deliberately awkward file — a photographed or scanned CV — is needed to test that.

**Secondary:** a posting can be created and receiving applications within a few minutes. A new submission reaches the dashboard, screened, without anyone touching it. Nothing in the pipeline is ever invisible or unaccounted for.

---

## Open questions for the Functional Spec

All six questions from the first draft are answered and folded into the decisions table above. Reading the real JD and the seven real CVs closed one of the two remaining questions and opened two new ones.

**Closed.** *Does equal weighting separate the candidates?* Partly — but the real problem turned out to be different from the one anticipated. Equal weighting doesn't compress the range so much as it **launders a disqualifying miss into a middling score**. That is now handled by keeping the must-have check separate from the roll-up, rather than by changing the weights.

**Still open:**

1. **Willingness to relocate is not captured.** The form asks where a candidate lives, so location can be scored — but a Chennai applicant who would happily move to Hyderabad scores exactly the same as one who would not. On this role that affects three of seven applicants. Adding a question to the form is the obvious fix, but it means touching the fixed template, so it is a decision rather than an oversight.

2. **Is a 0–11 month box worth the precision?** It gives clean filtering, but if candidates round to whole years anyway it is friction for nothing. Worth watching once real submissions arrive.

**Not a question:** any form links appearing in existing job descriptions are examples only. The admin creates a form per posting from the Ziphyre template; nothing about an existing form constrains what we build.

**One flagged change outside this note:** ProductContext's glossary names *Role* as the single organising object, and this note introduces *Posting* above it. That is a change to product truth and belongs in ProductContext, not here.
