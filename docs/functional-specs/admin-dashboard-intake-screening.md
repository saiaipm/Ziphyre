# Functional Spec — Screening Desk

**Source:** `ProductNotes/PN-001-admin-dashboard-and-screening.md`
**Product truth:** `ProductContext.md` v1.1
**Baseline for validation:** `Testing/baseline-ranking-CA-role.md`
**Status:** Draft 1 · 15 August 2026

---

## 1. Feature name & one-liner

**Screening Desk** — the admin's single workspace where applications arriving through a Google Form are screened automatically against the job description, scored on five named components, and worked through a pipeline that can be filtered and exported.

---

## 2. Goal & success metric

**Goal.** Turn the CV pile from a week of reading into a morning of deciding, without ever removing the decision from a person.

This is Ziphyre's first working slice. ProductContext identifies CV screening as "the single biggest time sink, and the least intellectually rewarding part of the job" for Meera. Everything else in the product — scheduling, outreach, candidate transparency — depends on the hiring team trusting what comes out of here.

### Primary measure: is the ranking trustworthy?

Validated against the seven real Chartered Accountant applicants and the human ranking recorded in `Testing/baseline-ranking-CA-role.md`, which was written before this feature existed.

| Measure | Passing looks like |
|---|---|
| Must-have separation | The two qualified CAs are distinguishable from the five who are not, in one action |
| Ordering agreement | Broad agreement with the baseline tiers. Disagreement is acceptable **only** where the assessment explains it persuasively |
| Score spread | Seven candidates spread across a usable range, not clustered between 6 and 8 |
| Discrepancy detection | The candidate whose CV claims 4.3 years while its own dates evidence 6.2 is surfaced without being sought |
| Assessment quality | A reason a hiring manager would accept, not a restatement of the CV |

### Secondary measures

- A posting can be created and receiving applications within minutes
- A new submission reaches the pipeline, screened, with nobody touching anything
- No application is ever invisible: not while screening runs, not when screening fails, not when its source row is deleted

---

## 3. Personas served

| Persona | Role here | What they get |
|---|---|---|
| **Meera** (HR Generalist) | Primary. Admin. | Lives in the pipeline daily. Every design trade-off resolves in her favour. |
| **Rahul** (Founder) | Secondary. Admin. | The home overview — "is hiring moving?" answered in one glance, on a phone, without generating work for Meera. |

**Not served in this build.** **Priya** (Candidate) receives Google's own form receipt and nothing more — candidate-facing status is a later build. **Arjun** (Hiring Manager) and **Sana** (External Recruiter) have no access; they receive exported files from Meera.

---

## 4. Scope

### In scope (v1)

- Connecting a Google account, once
- Creating postings and the openings inside them
- Attaching a job description per opening, and marking its requirements must-have or preferred
- The Ziphyre form template, and connecting a copied form to a posting
- Automatic screening on arrival: five components, overall score, must-have check, assessment summary
- Manual CV upload, single and bulk
- Pipeline per opening: five stages, individual and batch movement, optional disposition
- CV reading inside the dashboard
- Filtering and sorting
- Export: spreadsheet, document, optional CV bundle
- Home overview across postings and openings
- AI provider selection with the customer's own key

### Out of scope (v1)

- Anything candidate-facing beyond Google's form receipt
- Outreach, acknowledgements, rejection messages
- Interview scheduling
- Any access level other than a single Admin
- Custom form fields per posting
- Custom scoring weights per opening
- Saved filter views
- Ziphyre creating the Google Form itself
- Charts, time-to-hire, funnel analytics
- **Analytics, event tracking, or usage instrumentation of any kind** — nothing observes how the product is used

### Later versions

| Theme | What |
|---|---|
| Next | Ziphyre generates the form directly, removing template-copying and dropdown sync entirely |
| Next | Custom weights per opening, and custom form fields |
| Later | Hiring Team Member and External Recruiter access (ProductContext §7) |
| Later | Candidate status transparency (Pillar 6) |
| Later | Usage analytics and hiring-outcome measurement — Roadmap Theme C, once there is enough history to mean anything |

---

## 5. User stories

### Meera — HR Generalist (Admin)

- As Meera, I want Ziphyre to read the job description and propose the requirements, so that I don't retype what I already wrote.
- As Meera, I want to mark which requirements are non-negotiable, so that the ranking reflects what I actually care about instead of what the prose happened to emphasise.
- As Meera, I want applications to arrive and be screened without me doing anything, so that opening Ziphyre in the morning shows me work already done.
- As Meera, I want to see why a candidate scored what they scored, so that I can disagree with confidence rather than guess.
- As Meera, I want candidates who miss a must-have flagged rather than buried in an average, so that a disqualifying gap doesn't hide behind four good numbers.
- As Meera, I want to read the CV without leaving the pipeline, so that reviewing twenty candidates doesn't mean forty context switches.
- As Meera, I want to shortlist or reject several people at once, so that clearing a pile is one sitting rather than one afternoon.
- As Meera, I want to upload CVs that arrived by email or WhatsApp, so that the pipeline is the whole picture and not just the tidy part of it.
- As Meera, I want to filter to candidates meeting every must-have, so that I can see the real shortlist in one action.
- As Meera, I want to export what's on screen, so that I can send a director something readable without rebuilding it by hand.

### Rahul — Founder (Admin)

- As Rahul, I want one screen showing every opening and where it stands, so that I know whether hiring is moving without asking Meera.
- As Rahul, I want that screen to work on my phone, so that checking in doesn't require sitting down at a laptop.
- As Rahul, I want to choose which AI provider screens our candidates and use our own key, so that I control what we spend and where our applicants' data goes.

---

## 6. Functional requirements

### Connecting Google

**FR-1** Meera can connect one Google account to the workspace.
**FR-2** The connected account is displayed, and can be replaced or disconnected.
**FR-3** Until an account is connected, creating a posting is unavailable, with an on-screen explanation of why.
**FR-4** If the connection stops working, every affected posting shows a reconnection prompt, and existing applications remain fully readable and workable.

### Postings and openings

**FR-5** Meera can create a posting with a name and at least one opening.
**FR-6** Each opening records a title and a work location.
**FR-7** Each opening carries exactly one job description, uploaded as a document or pasted as text.
**FR-8** An opening cannot start receiving applications until it has a job description.
**FR-9** A posting may hold multiple openings; each is screened independently against its own job description.
**FR-10** Meera can close a posting. Closing stops new applications being accepted; every existing application stays fully workable.
**FR-11** A closed posting can be reopened.
**FR-12** Meera can edit an opening's title, location and job description at any time.
**FR-84** Meera can permanently delete a posting. Deletion requires an explicit confirmation naming the posting and the number of candidates whose data would be removed. An opening cannot be deleted on its own — only closed with its posting (functional spec §11).

### Requirements and must-haves

**FR-13** On attaching a job description, Ziphyre proposes a list of discrete requirements drawn from it.
**FR-14** Meera can edit the wording of any proposed requirement, delete any of them, and add her own.
**FR-15** Each requirement is marked **Must-have** or **Preferred**. New and added requirements default to Preferred.
**FR-16** An opening can be activated with zero must-haves; the must-have check then reports that none were set.
**FR-17** The requirement list is viewable and editable after applications have arrived.
**FR-18** Editing the requirement list or the job description offers a rescreen of that opening's applications. It is never performed automatically.

### The form template

**FR-19** Ziphyre provides a form template containing exactly the fixed field set, ready to copy.
**FR-20** The template requires Google sign-in and does not restrict respondents to one response.
**FR-21** The template contains: full name, email, current location, willingness to relocate, work experience (years and months), notice period, current CTC, expected CTC, CV upload, and the opening applied for.
**FR-22** Work experience is captured as two numbers: years (0 or more) and months (0 to 11). Values outside these ranges are rejected at submission with a message.
**FR-23** Willingness to relocate offers exactly three answers: Yes, No, Open to discussing.
**FR-24** CV upload accepts PDF, DOC and DOCX.
**FR-25** Meera can view the list of openings she configured for a posting, in a form suitable for copying into the form's dropdown.

### Connecting a form to a posting

**FR-26** Meera selects the form for a posting from a list of forms on the connected Google account. No link is typed or pasted.
**FR-27** Ziphyre compares the form's opening options against the openings configured for the posting and reports any that do not match.
**FR-28** A submission naming an opening Ziphyre does not recognise is retained and shown as **Unmatched**, never discarded.
**FR-29** Meera can assign an unmatched application to any opening in the posting; assigning it triggers screening.

### Intake

**FR-30** New form submissions appear in the pipeline without Meera refreshing, importing, or taking any action.
**FR-31** Meera can add a candidate manually by uploading a CV into a specific opening.
**FR-32** Meera can upload multiple CVs at once into a single opening.
**FR-33** For a manually added candidate, every form field displays as **Not provided**, visually distinct from an empty value.
**FR-34** Meera can fill in any Not provided field by hand, and edit it afterwards.
**FR-35** Manually added candidates are screened by exactly the same process as form submissions.
**FR-36** A repeat submission from the same verified email to the same opening updates the existing application rather than creating a second one. The application is flagged as updated, the previous CV is retained and viewable, and a rescreen is offered.
**FR-37** The same verified email appearing against different openings is recognised as one Candidate with multiple applications.

### Screening

**FR-38** Screening begins automatically when an application arrives. There is no button to start it.
**FR-39** While screening runs, the application is visible in the pipeline in a clearly unfinished state.
**FR-40** A completed screening produces a rating from 0 to 10 for each of five components:

| Component | What it measures |
|---|---|
| **JD Fit** | How much of the day-to-day work described in the job description this person has actually done |
| **Experience** | Length and seniority of relevant experience against what the opening asks for |
| **Skills** | Tools and technical proficiencies named in the job description |
| **Qualification** | Credentials and education against what the opening asks for |
| **Location** | Current location against the opening's location, together with stated willingness to relocate |

**FR-41** The overall score is the equal-weighted average of the five components, expressed out of 10.
**FR-42** The weighting is stated wherever the overall score is shown.
**FR-43** A completed screening produces a must-have check: whether every must-have requirement is met, and which specific ones are not.
**FR-44** A completed screening produces an assessment summary containing strengths, gaps against this job description, and an overall read of fit.
**FR-45** Gaps are phrased as distance from the job description's requirements, never as characterisations of the person.
**FR-46** Where declared work experience and the experience evidenced by the CV differ materially, the difference is stated in the assessment.
**FR-47** Where screening cannot run, the application remains at stage **New**, is flagged **Needs manual review**, and displays the reason in plain language. It is never assigned a score of zero and never removed.
**FR-48** Meera can retry screening on an application flagged Needs manual review.
**FR-49** Every score records the job description version and the AI provider that produced it, and both are viewable.
**FR-50** Scores and component ratings cannot be edited by anyone.
**FR-51** Screening never moves an application to Shortlisted, On Hold or Rejected, and never removes an application, regardless of score or must-have result.

### Pipeline

**FR-52** Each opening has its own pipeline listing every application for it.
**FR-53** The pipeline shows, per application: candidate name, overall score, the five component ratings, must-have result, stage, screening status, date received, and the key form fields.
**FR-54** Stages are **New**, **Screened**, **Shortlisted**, **On Hold**, **Rejected**.
**FR-55** New advances to Screened automatically when screening completes. Every other stage change is made by Meera.
**FR-56** Meera can change the stage of one application, or of several selected applications in a single action.
**FR-57** On moving an application to On Hold or Rejected, Meera may optionally record a disposition from a quick-pick list, and may add a free-text note. Both are skippable, individually and in batch.
**FR-58** Disposition quick-pick options are: Doesn't meet must-haves · Experience mismatch · Location · CTC expectation · Better candidates available · Other.
**FR-59** Every stage change records who made it and when, and is viewable on the application.
**FR-60** Meera can reassign an application to a different opening within the same posting; reassignment offers a rescreen against the new opening's job description.
**FR-61** The CV is readable inside the dashboard alongside the assessment, without navigating away.
**FR-62** A link to open the original CV file in Google Drive is available.
**FR-63** Ziphyre never writes to the response sheet.
**FR-64** Where a response row is edited at source, the updated answers are reflected in the application.
**FR-65** Where a response row is deleted at source, the application is retained and flagged as no longer present at source.

### Filtering and sorting

**FR-66** The pipeline can be filtered by: overall score range, any component rating range, must-have result, stage, screening status, work experience, current location, willingness to relocate, notice period, current CTC, expected CTC, and date received.
**FR-67** Filters combine; applying several narrows the result.
**FR-68** Applications with a **Not provided** value for a filtered field are excluded from the filtered result, and the count of those excluded is displayed with a way to view them.
**FR-69** Active filters are visible at all times and can be cleared in one action, individually or all at once.
**FR-70** The pipeline can be sorted by overall score, any component rating, date received, or candidate name.

### Export

**FR-71** Meera can export as a spreadsheet (CSV or Excel) containing all form answers, all five component ratings, the overall score, must-have result, stage, disposition and date received.
**FR-72** Meera can export as a document (PDF) presenting each candidate with their scores, must-have result and assessment summary, in the order currently shown on screen.
**FR-73** Meera can optionally include the CV files with any export.
**FR-74** Meera can export everything matching the current filters, or only the applications she has selected.
**FR-75** Every export carries a visible marker identifying it as internal and containing personal data.

### Home overview

**FR-76** The home screen lists every posting, and the openings within each.
**FR-77** For each opening it shows: applications received, screened, shortlisted, still at New, and needing manual review.
**FR-78** Selecting an opening opens its pipeline.
**FR-79** The home screen is readable and usable on a phone.
**FR-80** Closed postings are visually distinct from open ones and can be hidden.

### Settings

**FR-81** Meera can choose the AI provider used for screening from a short curated list — OpenAI, Google Gemini and NVIDIA NIM — and supply the customer's own key. Each provider offers one model, chosen for low cost and low latency rather than maximum capability: screening is a high-volume, low-complexity task and frontier reasoning models would cost more without scoring better. Models are shown by their official names, never raw API identifiers.
**FR-82** Adding, removing or reordering providers does not rescreen anything already screened.
**FR-85** Meera can configure more than one provider at once and set the order they are tried in. Screening uses the first that succeeds; if it fails, the next is tried automatically. Removing a provider and reordering the chain are both available without re-entering keys.
**FR-86** Where a fallback provider produced a result, that is stated plainly at the point of use — never silent. The admin asked for one model and got another, and must be able to see that. Every score continues to record the model that actually produced it (**FR-49**), which matters more under fallback, not less: with automatic failover the model behind any given score is no longer predictable in advance.
**FR-83** Where no valid key is present, screening cannot run; new applications are flagged Needs manual review with that reason stated, and the settings screen says so plainly.

---

## 7. User flows

### Flow A — First run

1. Meera signs in to an empty workspace.
2. She is asked to connect a Google account. → *Branch: she skips.* Posting creation stays unavailable with an explanation, and everything else is browsable but empty.
3. She connects the account.
4. Home shows the empty state and a single call to action: create the first posting.

### Flow B — Create a posting and start receiving applications

1. Meera creates a posting and names it.
2. She adds an opening: title and work location.
3. She attaches the job description — document upload or pasted text.
4. Ziphyre proposes a requirement list. → *Branch: the JD is too thin to draw requirements from.* Ziphyre says so and offers an empty list to fill in by hand.
5. She reviews the list: edits wording, deletes what doesn't matter, adds anything missed.
6. She marks each requirement Must-have or Preferred.
7. She repeats steps 2–6 for any further openings.
8. She copies the Ziphyre form template into her own Google account and adds the openings to its dropdown, using the list Ziphyre gives her.
9. She returns and selects that form from the list of her forms.
10. Ziphyre compares the form's opening options against her configured openings. → *Branch: mismatch.* The specific differences are named, and she can fix the form and re-check, or continue and handle unmatched applications later.
11. She shares the form link wherever she advertises.

### Flow C — An application arrives

1. A candidate submits the form.
2. The application appears in the pipeline at stage New, screening in progress.
3. Screening completes → stage becomes Screened, with five components, overall score, must-have result and assessment summary.
   - *Branch: screening cannot run.* Stays at New, flagged Needs manual review with the reason. Meera can retry or work it by hand.
   - *Branch: unrecognised opening.* Held as Unmatched until Meera assigns it, which then triggers screening.
   - *Branch: repeat submission.* The existing application is updated and flagged; the previous CV is kept; a rescreen is offered.

### Flow D — Working the pile

1. Meera opens the pipeline for an opening.
2. She filters to candidates meeting every must-have. The count of excluded and Not provided candidates stays visible.
3. She sorts by overall score.
4. She opens the top candidate: CV on one side, assessment and components on the other.
5. She moves them to Shortlisted. → *Branch: she disagrees with the score.* She moves them anyway; the score is unchanged and unchangeable, and her decision is recorded against her name.
6. She selects the clearly unsuitable candidates and rejects them in one action.
7. She optionally picks a disposition for the batch. → *Branch: she skips it.* The rejection completes with no reason recorded.

### Flow E — Adding CVs that arrived elsewhere

1. Meera chooses to add candidates to an opening manually.
2. She uploads one or several CVs.
3. Each becomes an application at New with every form field showing Not provided.
4. Screening runs as normal.
5. She optionally fills in experience, location, notice period and CTC by hand so the candidate appears in filters.

### Flow F — Sharing a shortlist

1. Meera filters and sorts the pipeline to the shortlist she wants.
2. She chooses to export, and picks a format.
3. She chooses everything in view, or only her selected candidates.
4. She optionally includes the CV files.
5. The file downloads, carrying its internal-use marker.

---

## 8. UI content & copy

### Global

| Element | Copy |
|---|---|
| Product area name | Screening Desk |
| Primary nav | Home · Postings · Settings |

### Connecting Google

| Element | Copy |
|---|---|
| Prompt heading | Connect your Google account |
| Body | Ziphyre reads applications from your Google Forms and opens the CVs candidates upload. It never edits your form or your responses. |
| Button | Connect Google account |
| Connected state | Connected as {email} |
| Secondary action | Use a different account |
| Blocked posting creation | Connect a Google account to create your first posting. |
| Connection broken | Ziphyre has lost access to your Google account. New applications aren't coming through. Existing candidates are unaffected. |
| Reconnect button | Reconnect |

### Posting and opening setup

| Element | Copy |
|---|---|
| Create button | New posting |
| Posting name label | What are you calling this hiring drive? |
| Posting name help | Something you'll recognise later — "Finance hiring, August" works fine. |
| Add opening button | Add an opening |
| Opening title label | Role title |
| Opening location label | Work location |
| JD upload label | Job description |
| JD upload help | Upload a document or paste the text. Screening measures every candidate against this. |
| JD missing warning | This opening can't receive applications until it has a job description. |
| Close posting button | Close posting |
| Close confirmation | Close this posting? New applications will stop arriving. Everyone already in the pipeline stays exactly as they are. |
| Closed badge | Closed |
| Reopen button | Reopen posting |
| Delete posting button | Delete posting |
| Delete confirmation | Delete "{posting name}" permanently? This removes {n} candidates' applications, CVs and scores. This cannot be undone. |
| Delete confirmation (no applications) | Delete "{posting name}"? No one has applied yet — nothing else is affected. |
| Delete confirm button | Delete permanently |

### Requirements

| Element | Copy |
|---|---|
| Heading | What matters for this role? |
| Intro | We've pulled these from your job description. Edit anything that's wrong, delete what doesn't matter, and mark what's non-negotiable. |
| Why it matters (tooltip) | Job descriptions don't always say which requirements are firm. Marking them means the ranking reflects what you actually need. |
| Toggle labels | Must-have · Preferred |
| Add row | Add a requirement |
| Empty proposal state | We couldn't pull clear requirements from this job description. Add them yourself below — a few lines is enough. |
| No must-haves set | No must-haves set. Every candidate will pass the must-have check. |
| Save button | Save requirements |
| Edit-after-applications prompt | You've changed what this role requires. Rescreen the {n} applications already in? |
| Rescreen buttons | Rescreen now · Leave them as they are |

### Form setup

| Element | Copy |
|---|---|
| Heading | Connect your application form |
| Step 1 | Copy our template into your Google account. |
| Template button | Open the Ziphyre template |
| Step 2 | Add your openings to the form's "Role applied for" dropdown. |
| Openings list label | Copy these, exactly as written |
| Step 3 | Come back and pick your form below. |
| Form picker label | Choose your form |
| Match confirmed | Your form's openings match this posting. |
| Mismatch warning | These openings are in your form but not in this posting: {list}. Applications naming them will need assigning by hand. |
| Mismatch secondary | These openings are in this posting but not in your form: {list}. Nobody can apply to them yet. |
| Continue anyway | Continue anyway |

### Pipeline

| Element | Copy |
|---|---|
| Column headings | Candidate · Score · JD Fit · Experience · Skills · Qualification · Location · Must-haves · Stage · Received |
| Score tooltip | Equal average of the five component ratings. Screening ranks candidates; it never decides. |
| Must-have pass | Meets all must-haves |
| Must-have fail | Missing: {list} |
| No must-haves set | No must-haves set |
| Screening in progress | Screening… |
| Needs manual review | Needs manual review |
| Review reason examples | We couldn't read this file — it may be a scanned image. · This file doesn't appear to be a CV. · This file is damaged or empty. |
| Retry button | Try screening again |
| Not provided | Not provided |
| Updated application | Updated {date} — candidate resubmitted |
| Previous CV link | View previous CV |
| Source row deleted | This response was deleted from your sheet. The candidate stays here. |
| Unmatched banner | {n} applications named a role that isn't in this posting. Assign them to continue. |
| Assign button | Assign to an opening |
| Provenance tooltip | Screened {date} against job description version {n}, using {provider}. |

### Stages and actions

| Element | Copy |
|---|---|
| Stage names | New · Screened · Shortlisted · On Hold · Rejected |
| Batch bar | {n} selected |
| Batch actions | Shortlist · Put on hold · Reject · Clear selection |
| Disposition heading | Why? (optional) |
| Disposition options | Doesn't meet must-haves · Experience mismatch · Location · CTC expectation · Better candidates available · Other |
| Disposition note | Add a note (optional) |
| Skip | Skip |
| Confirm reject (batch) | Reject {n} candidates? You can move them back later. |
| Score disagreement note | Your decision is recorded. Scores never change. |
| Reassign action | Move to another opening |
| Reassign confirm | Move {name} to {opening}? They'll be rescreened against that role's job description. |

### Filters and empty states

| Element | Copy |
|---|---|
| Filter button | Filter |
| Must-have filter | Meets all must-haves |
| Clear all | Clear filters |
| Excluded notice | {n} candidates hidden because they have no {field} recorded. |
| Show them | Show them anyway |
| No applications yet | Nothing here yet. Once you share your form link, applications will appear on their own. |
| No results after filter | No candidates match these filters. |
| No results action | Clear filters |
| Empty postings | No postings yet. Create one to start receiving applications. |
| All screened | Everyone's been screened. Nothing waiting on you. |

### Export

| Element | Copy |
|---|---|
| Button | Export |
| Scope options | Everything in this view ({n}) · Only selected ({n}) |
| Format options | Spreadsheet (CSV) · Spreadsheet (Excel) · Document (PDF) |
| CV option | Include CV files |
| Privacy line | This file contains candidates' personal information. It's for internal use — once downloaded, it's outside Ziphyre. |
| Export marker (in file) | Ziphyre — internal use only. Contains personal data. Exported {date} by {name}. |
| Button | Download |

### Home overview

| Element | Copy |
|---|---|
| Heading | Hiring at a glance |
| Per-opening counts | {n} applied · {n} screened · {n} shortlisted · {n} new · {n} need review |
| Needs review emphasis | {n} need review |
| Empty | Nothing being hired for right now. |

### Settings

| Element | Copy |
|---|---|
| Heading | Screening provider |
| Body | Choose who screens your candidates and use your own key. This controls what screening costs you and where your applicants' information is processed. |
| Provider options | OpenAI · Google Gemini · NVIDIA NIM |
| Model options | GPT-4o mini · Gemini 2.5 Flash-Lite · GPT-OSS-20B |
| Model notes | Fast and inexpensive. Reliable structured output. / Lowest latency and cost of the three. / Open-weight fallback. Text only — no document vision. |
| Key label | Your API key |
| Key hint | Get one from {provider key location}. Stored encrypted and verified on save — never shown again afterwards, only the last four characters. |
| No key warning | Screening is paused. Without a key, new applications arrive unscreened and marked for manual review. |
| Active state | Screening active — {n} providers configured. If the first fails, the next is tried automatically. |
| Single-provider nudge | Screening active — 1 provider configured. Add a second provider for automatic fallback. |
| Fallback order heading | Fallback order — tried top to bottom until one succeeds. Every score records which model actually produced it. |
| Provider row | {model name} · {provider} · key ending {last four} |
| Primary badge | Primary |
| Fallback used notice | Used a fallback provider — your primary provider failed, so {model name} produced these suggestions instead. |
| Provenance line | Suggested by {model name}. |
| All providers failed | {first provider's error} (all {n} configured providers failed) |
| Switch notice | Changing provider won't rescreen anyone already screened. Scores from different providers aren't directly comparable, so each score records which provider produced it. |

---

## 9. States & edge cases

| Situation | Behaviour |
|---|---|
| **Empty — no postings** | Home shows the empty state and one action: create a posting |
| **Empty — posting with no applications** | Pipeline explains that applications appear on their own once the link is shared |
| **Loading — screening in progress** | Application visible at New, marked Screening…, all other columns blank rather than zero |
| **Loading — bulk upload** | Each CV appears as it is added; progress is visible; a failure on one does not stop the rest |
| **Error — screening cannot run** | Stays at New, flagged Needs manual review, plain-language reason, retry available |
| **Error — no AI key** | Same as above with the reason stated as a settings problem, plus a persistent settings warning |
| **Error — Google access lost** | Banner on affected postings; new applications stop; existing candidates and CVs remain readable |
| **Error — CV file won't open** | The assessment still displays; the CV pane explains it can't be shown and offers the Drive link |
| **Single vs many** | Every stage action, disposition and export behaves identically for one candidate and for fifty |
| **Very large pipeline** | Filtering and sorting remain usable at several hundred applications per opening |
| **Unmatched application** | Held visibly at the top of the posting, never inside an opening's pipeline, never discarded |
| **Duplicate submission** | Existing application updated and flagged; previous CV retained; rescreen offered; no second row |
| **Manually added candidate** | All form fields read Not provided; excluded from field filters with the exclusion counted and viewable |
| **Source row deleted** | Application retained and flagged; still fully workable |
| **Source row edited** | Updated answers reflected; screening is not re-run automatically |
| **Opening with no must-haves** | Must-have check reports that none were set; no candidate is flagged |
| **Closed posting** | Marked closed; no new applications; pipeline fully workable |
| **Desktop** | Full experience: pipeline, screening review, filters, export |
| **Phone** | Home overview readable and usable. Pipeline and review are not designed for phone in this build and say so rather than degrading silently |
| **Signed out** | Nothing is accessible; no candidate data is reachable without signing in |
| **Public** | No part of this feature is publicly reachable. Candidates interact only with Google Forms |

---

## 10. Business rules

### Identity and uniqueness

- A **Candidate** is identified by verified email address.
- One application per candidate per opening. A repeat submission updates the existing application; it never creates a second.
- The same candidate may hold applications against several openings, in the same posting or different ones, and is recognised as one person.
- An opening belongs to exactly one posting. A posting has exactly one form.

### Validation

| Field | Rule |
|---|---|
| Work experience — years | Whole number, 0 or greater |
| Work experience — months | Whole number, 0 to 11 |
| Willingness to relocate | Exactly one of Yes, No, Open to discussing |
| CV upload | PDF, DOC or DOCX |
| Email | Verified through Google sign-in; unverified submissions are not possible |
| Job description | Required before an opening can receive applications |
| Posting name, opening title, opening location | Required, non-empty |

### Scoring

- Component ratings and the overall score run 0 to 10.
- The overall score is the equal-weighted average of all five components.
- Scores are immutable. No admin, at any time, can edit one.
- A must-have failure is never folded into the score; it is reported separately.
- Scores are only comparable within the same opening, the same job description version and the same provider. Provenance is recorded on every score.

### Permissions

- One access level exists: **Admin**. Meera and Rahul both hold it.
- All Admin capabilities are identical; there is no distinction between them in this build.
- No candidate-facing surface exists. Priya cannot reach anything in Ziphyre.
- Access is scoped to one workspace.

### Ordering and defaults

- Pipeline defaults to sorting by overall score, highest first, with unscreened applications above scored ones so nothing is buried.
- Requirements default to **Preferred**.
- Disposition defaults to none.
- Export defaults to everything in the current view.
- Home lists open postings first, closed ones after.

### Limits and boundaries

- Screening never changes a stage other than New → Screened.
- Screening never removes, hides or rejects an application.
- Ziphyre never writes to the response sheet.
- Rescreening is always offered, never automatic.
- Exports always carry the internal-use marker.

---

## 11. Admin experience, end to end

### Setting up

| Step | What Meera does |
|---|---|
| 1 | Connects a Google account, once for the workspace |
| 2 | Creates a posting and names it |
| 3 | Adds each opening: title, work location, job description |
| 4 | Reviews the proposed requirements per opening — edits, deletes, adds |
| 5 | Marks each requirement Must-have or Preferred |
| 6 | Copies the Ziphyre form template into her Google account |
| 7 | Copies her openings into the form's dropdown |
| 8 | Picks that form in Ziphyre and resolves any mismatch |
| 9 | Shares the form link |

### Fields Meera controls

| Object | Fields |
|---|---|
| Posting | Name · openings · connected form · open/closed |
| Opening | Title · work location · job description · requirement list with must-have marks |
| Requirement | Wording · Must-have or Preferred |
| Application | Stage · disposition · note · any Not provided field she chooses to fill · which opening it belongs to |
| Settings | Google account · AI provider · key |

### Create, edit, delete

- **Postings** — create, rename, close, reopen, delete. Deleting a posting removes its applications and requires explicit confirmation naming how many candidates would be lost — **FR-84**.
- **Openings** — add to a posting, edit title, location and job description. An opening with applications cannot be deleted; it can only be closed with its posting.
- **Requirements** — add, edit, delete, reorder, re-mark, at any time. Changing them offers a rescreen.
- **Applications** — cannot be deleted. They can be rejected, held, or reassigned. This is deliberate: ProductContext treats losing a candidate as a defect.

### Preview and publish

- There is no publish step. An opening becomes live the moment it has a job description and its posting's form is connected and shared.
- Meera can preview exactly what screening will measure against — the job description and the requirement list with must-have marks — before sharing the link.

---

## 12. Analytics

**None. There is no analytics, event tracking, or usage instrumentation in v1.**

Nothing observes how Meera or Rahul use the product. No events are named, recorded, or sent anywhere.

**Why this is the right call for v1.** The two questions analytics would answer — does Meera trust the ranking, and where does the pile get stuck — are better answered by asking her at design-partner scale than by inferring from event data. Nine customers is a conversation, not a dataset. Instrumentation would add surface area to a build whose entire purpose is proving one thing: that the screening output is trustworthy.

It also sits well with ProductContext Principle 9 — candidate data is held in trust. A product handling other people's CVs and salary expectations ships cleaner with nothing watching.

### What this does *not* remove

Two things look like tracking and are not. Both are product functionality Meera can see and use, and both stay:

| Kept | Why it isn't analytics |
|---|---|
| **Stage change history** (FR-59) — who moved a candidate, and when | Meera's own audit trail, visible on the application. Rahul asking "why was this person dropped?" needs an answer |
| **Score provenance** (FR-49) — job description version and provider behind each score | Needed to know whether two scores are comparable. Shown to the admin, sent nowhere |

### How we'll know it worked, without analytics

Section 2's measures are all directly observable and need no instrumentation:

- The ranking comparison against `Testing/baseline-ranking-CA-role.md` is a manual read of seven candidates
- "A posting can be created and receiving applications within minutes" is watched, once, by whoever does it
- "Nothing in the pipeline is ever invisible" is inspected, not measured

Instrumentation belongs to Roadmap Theme C — learning from outcomes — once there is enough history for the numbers to mean anything.

---

## 13. Non-functional expectations

Stated as a person would experience them.

| Expectation | What good feels like |
|---|---|
| **New applications arriving** | Appear within a couple of minutes of being submitted, with nobody refreshing anything |
| **Screening turnaround** | A result within about a minute of arrival. Longer than that and the unfinished state must explain itself rather than just spin |
| **Opening a candidate** | CV and assessment together, fast enough that reviewing twenty in a row doesn't feel like waiting twenty times |
| **Filtering and sorting** | Immediate at a few hundred candidates. Slower than a second and Meera stops filtering |
| **Export** | Spreadsheet and document available quickly; a CV bundle may take longer and must show progress rather than appearing to hang |
| **Discoverability** | Meera reaches any opening's pipeline in one action from Home. The must-have filter is visible without opening a menu |
| **Accessibility** | Full keyboard operation of the pipeline including selection and stage changes. Score and must-have status never conveyed by colour alone — always a number or words |
| **Mobile** | Home overview genuinely readable one-handed on a phone. Pipeline and review say plainly they're built for a larger screen rather than degrading into something unusable |
| **Trust** | Every score shows its components and its provenance. Nothing about a candidate is asserted without a reason a person can read |

---

## 14. Dependencies & interactions

### ProductContext pillars

| Pillar | How this feature touches it |
|---|---|
| **Roles & Application Intake** | Fully realised here: postings, openings, job descriptions, requirements, form intake, manual upload |
| **Screening & Scoring** | Fully realised here: components, overall score, must-have check, assessment |
| **Pipeline Tracking & Shortlisting** | Fully realised here: stages, batch actions, filtering, export |
| **Communication & Outreach** | Not touched. Nothing is sent to any candidate |
| **Interview Scheduling** | Not touched |
| **Candidate Transparency** | Not touched. Priya sees only Google's form receipt |

### Concepts used

Posting · Opening · Application · Candidate · Stage · Screening score · Screening reasoning · Shortlist · Disposition · Batch action · Must-have · Role requirements — all as defined in ProductContext v1.1.

### New terms for the glossary

| Term | Meaning |
|---|---|
| **Screening status** | Whether screening has run on an application: in progress, complete, or needs manual review. Distinct from stage |
| **Needs manual review** | An application whose CV could not be screened. Stays at New, never scored, never dropped |
| **Unmatched application** | A submission naming an opening that doesn't exist in the posting. Held for assignment |
| **Component rating** | One of the five 0–10 ratings — JD Fit, Experience, Skills, Qualification, Location — that average to the overall score |
| **Provenance** | The job description version and AI provider that produced a given score |

### External services

| Service | Used for | If it fails |
|---|---|---|
| **Google Forms** | Candidates apply | No new applications arrive. Existing pipeline unaffected. Meera sees a banner naming the affected postings |
| **Google Sheets** | Where submissions land | Same as above. Ziphyre never writes here, so nothing is corrupted by an outage |
| **Google Drive** | Where uploaded CVs live | Assessments and scores stay readable; the CV pane explains it can't display the file and offers a direct link |
| **AI provider (OpenAI, Google Gemini or NVIDIA NIM)** | Screening | New applications arrive unscreened, flagged Needs manual review with the reason. Nothing is lost; Meera can retry once the provider is available. Existing scores are unaffected |

**A principle across all four:** an external failure may delay screening, never lose a candidate.

---

## 15. Assumptions

1. New submissions surfacing within a couple of minutes is fast enough; near-instant arrival is not required.
2. Editing the requirement list follows the same rule as editing the job description — a rescreen is offered, never automatic.
3. A repeat submission is more likely to be a corrected CV than a different person sharing an email, so updating in place with the earlier CV retained is the safer default.
4. Meera and Rahul share one identical Admin level; no capability needs withholding from either.
5. Openings within one posting are advertised together, so one shared form link is sufficient.
6. Candidates applying for MSME roles will tolerate Google sign-in. Manual upload covers those who won't.
7. Several hundred applications per opening is the realistic ceiling for this market; tens of thousands is not a case worth designing for now.
8. The customer supplying their own AI key is acceptable friction in exchange for cost and data control.
9. Equal component weighting is a starting point, not a settled answer. The CA test set will show whether it holds.

---

## 16. Open questions

1. **Is a 0–11 month box worth the precision?** Carried over from PN-001. If candidates round to whole years anyway, it's friction for nothing. Answerable once real submissions arrive, not before.
2. **What should happen to a candidate who applies to an opening that closes while they're in the pipeline?** They stay workable by every rule here — but nobody has decided whether Meera should be told the role they applied to no longer exists.
3. **Should the assessment summary have a length limit?** A summary that runs long stops being scannable, which defeats its purpose. Best judged against real output on the seven CA CVs.
4. **Does bulk manual upload need a size limit?** Unbounded upload is fine at seven CVs and probably not at seven hundred.

---

## 17. Acceptance criteria

### Setup

- [ ] A workspace with no Google account connected cannot create a posting, and says why — **FR-3**
- [ ] Losing Google access stops new applications but leaves existing candidates and CVs fully readable — **FR-4**
- [ ] An opening without a job description cannot receive applications — **FR-8**
- [ ] Attaching a job description produces a proposed requirement list that can be edited, deleted from and added to — **FR-13, FR-14**
- [ ] Requirements can be marked Must-have or Preferred, and default to Preferred — **FR-15**
- [ ] Selecting a form whose openings don't match the posting names the specific differences — **FR-27**
- [ ] Deleting a posting with applications requires confirmation naming the candidate count; deleting an empty one does not claim candidates are affected — **FR-84**

### Intake

- [ ] A form submission appears in the pipeline without any manual action — **FR-30**
- [ ] Several CVs can be uploaded at once, and one failure doesn't stop the others — **FR-32**
- [ ] A manually added candidate shows Not provided, visibly different from empty — **FR-33**
- [ ] A second submission from the same email to the same opening updates the existing application and retains the earlier CV — **FR-36**
- [ ] A submission naming an unknown opening is held as Unmatched, not discarded — **FR-28**

### Screening

- [ ] Screening starts with no button pressed — **FR-38**
- [ ] An application mid-screening is visible in the pipeline — **FR-39**
- [ ] A completed screening shows five component ratings, an overall score, a must-have result and an assessment summary — **FR-40, FR-41, FR-43, FR-44**
- [ ] The equal-weighting rule is stated wherever the overall score appears — **FR-42**
- [ ] A candidate missing a must-have is flagged with the specific requirement named, and is not moved or hidden — **FR-43, FR-51**
- [ ] An unreadable CV leaves the application at New, flagged Needs manual review with a plain-language reason, never scored zero — **FR-47**
- [ ] Score provenance — job description version and provider — is viewable on every scored application — **FR-49**
- [ ] No route exists, anywhere, to edit a score — **FR-50**
- [ ] Editing a job description or requirement list offers a rescreen and does not perform one automatically — **FR-18**

### Pipeline

- [ ] Only New → Screened happens without a person; every other stage change is made by Meera and recorded against her — **FR-55, FR-59**
- [ ] Twenty candidates can be rejected in one action, with disposition skippable — **FR-56, FR-57**
- [ ] A CV is readable beside its assessment without leaving the pipeline — **FR-61**
- [ ] Deleting a response row at source leaves the application present and flagged — **FR-65**
- [ ] Nothing Ziphyre does writes to the response sheet — **FR-63**

### Filtering and export

- [ ] Filtering to "meets all must-haves" on the CA test set returns the two qualified CAs — **FR-66**
- [ ] Candidates excluded from a filter for having no value are counted and can be shown — **FR-68**
- [ ] Spreadsheet export carries form answers, all components, overall score, must-have result, stage and disposition — **FR-71**
- [ ] Document export presents candidates in the order shown on screen — **FR-72**
- [ ] Every export carries the internal-use marker — **FR-75**

### Home and settings

- [ ] Home shows every opening with its counts, and reaches any pipeline in one action — **FR-76, FR-77, FR-78**
- [ ] Home is usable on a phone — **FR-79**
- [ ] With no valid key, new applications arrive flagged for manual review and settings says so — **FR-83**

### Validation against the baseline

- [ ] Screening the seven CA CVs separates the two qualified CAs from the five who are not
- [ ] The scores spread across a usable range rather than clustering between 6 and 8
- [ ] The candidate whose CV claims 4.3 years against 6.2 evidenced is flagged without being sought
- [ ] Every disagreement with `Testing/baseline-ranking-CA-role.md` is explained by its assessment

---

## 18. Rollout plan

### Sequence

| Stage | What | Exit condition |
|---|---|---|
| **1. Internal, seeded** | The seven CA CVs loaded by manual upload against the real pilot job description. No form connected, no live candidates | Screening output compared against `Testing/baseline-ranking-CA-role.md`. Ranking is trustworthy or the scoring model changes before anyone else sees it |
| **2. Internal, live form** | One real posting, real form, real applicants, used by Meera on an actual open role | A full role worked end to end: applications arrive, get screened, get shortlisted, get exported — without anyone touching a spreadsheet |
| **3. Design partners** | A small number of MSMEs with hands-on setup support | They complete setup without help, and come back to the pipeline unprompted |
| **4. General** | Open | — |

No dark launch and no admin-only preview: there is no existing product to hide this behind, and no candidate-facing surface to protect.

### Seed content needed

- The pilot Chartered Accountant job description — already in hand
- The seven CA applicant CVs — already in hand
- **A deliberately unreadable CV** — a photographed or scanned document. This does not yet exist, and without it FR-47 cannot be tested. All seven current CVs parse cleanly
- The Ziphyre form template, published and copyable
- Default disposition list as specified in FR-58

### Risks at rollout

| Risk | Handling |
|---|---|
| Screening ranking is not trustworthy | Stage 1 exists precisely to catch this before any customer sees it. Weighting and component definitions change before stage 2 |
| Setup is too fiddly — template copying, dropdown syncing | Watch stage 3 closely. This is the strongest argument for Ziphyre generating the form itself, already queued as the next build |
| Candidates drop off at Google sign-in | With no instrumentation, this surfaces by asking — admins hearing from candidates who couldn't apply, and applicant counts that look lower than the reach of the shared link. Manual upload is the mitigation already built |

---

## 19. Change log

| Version | Date | Change |
|---|---|---|
| Draft 5 | 22 Aug 2026 | **FR-85 and FR-86 added**: multiple providers configurable at once in an explicit fallback order, tried until one succeeds; a fallback is never silent. FR-82 widened to cover adding, removing and reordering. Settings copy extended for the fallback-order list, primary badge, fallback notice and provenance line. Gemini models updated to the current 3.5–3.7 line after Google retired 2.5 for generation |
| Draft 4 | 22 Aug 2026 | **FR-81 rewritten.** Provider list is now OpenAI, Google Gemini and NVIDIA NIM — Claude dropped, OpenRouter rejected on reliability. One model per provider, cheap/fast tier by deliberate choice, shown by official name rather than API slug. Settings copy updated with model notes, key hints and the connected state |
| Draft 3 | 21 Aug 2026 | **FR-84** added: Meera can permanently delete a posting, with a confirmation naming the candidate count affected. Confirms as a real product decision what was previously only a tech-spec assumption. Pause/lifecycle states beyond open, closed and deleted were considered and explicitly dropped — closing remains the only way to stop a posting short of deletion |
| Draft 2 | 16 Aug 2026 | Analytics removed entirely from v1. §12 now states no tracking or instrumentation of any kind, with stage-change history and score provenance explicitly retained as product functionality rather than telemetry. Added to out-of-scope; deferred to Roadmap Theme C. Success measures confirmed as directly observable, needing no instrumentation |
| Draft 1 | 15 Aug 2026 | First functional spec, from PN-001 and ProductContext v1.1. Nine decisions taken during clarification: requirements proposed from the JD and confirmed by the admin; JD Fit redefined as responsibilities match to remove double-counting; five stages retained with New → Screened as a processing transition; unscreenable CVs held at New with a manual-review flag; relocation question added to the form template and folded into the Location component; Google account connected once with form selection from a list; home overview added for Rahul; disposition optional from a quick-pick list; desktop for working surfaces with a phone-readable overview |
