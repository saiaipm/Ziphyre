# Ziphyre — Product Context

**Status:** Living document. Version 1.3, covering the initial product scope.
**Last updated:** 29 August 2026 — Caught up with what PN-002 and PN-004 settled: intake is a Ziphyre-hosted application page, not a third-party form; no message sends itself except the acknowledgement; candidates are told how long their data is kept. Pillar 3 no longer claims calendar-reading it does not do, and Pillar 4 no longer claims automatic sending the product deliberately refuses. Previously (1.2, 16 August): Workspace renamed Organization and given a profile; before that, the posting/opening distinction and must-have requirements, following PN-001.

---

## How to use this document

This is the durable product truth for Ziphyre: what we are building, who it is for, and why. It does not describe features in detail and it never describes how anything is built.

The intended workflow is:

1. A PM writes a short **Product Note** — a one-page feature ask.
2. That Product Note is combined with **this document** to produce a **Functional Spec**.
3. The Functional Spec is later combined with code context to produce a **Tech Spec**.

So when you read a sentence here and think "that's a design decision, not a fact about the product" — it probably belongs in a Functional Spec instead, and should be removed from here. Conversely, if you find yourself explaining who a persona is or what the business goal is *inside* a Product Note, that context belongs here.

### Decisions taken as given

These were not explicitly specified at kickoff. They are recorded here as product decisions so specs can proceed without re-litigating them. Any of them can be overturned — but overturn them *here*, not inside a single feature spec.

- **Candidates do not create accounts.** A candidate reaches their application status through a private link sent to them. Requiring a password to check "am I rejected yet?" is friction that would kill adoption in our market.
- **Screening scores are triage, never verdicts.** A score orders a queue for a human. It never rejects, never advances, and is never shown to the candidate.
- **A job opening is the organising object.** Applications, screening, scheduling, and the dashboard all hang off a specific opening being hired for. Openings are grouped into postings — a posting is what gets advertised and shared; an opening is what a candidate applies to and what screening measures against.
- **Primary market is Indian MSMEs.** This shapes assumptions about hiring volume, team size, budget sensitivity, mobile-first candidates, and communication habits (email plus phone/messaging, not email alone).
- **Candidates apply on a page Ziphyre hosts, reached by one unguessable link per posting.** Intake is ours, not a third-party form the customer has to assemble. Neither side needs an account of any kind. The corollary is a boundary, not an omission: there is no public index of roles and no browsable careers page, because that is the line between a hosted application page and the job board Non-Goal 3 refuses. *(PN-002)*
- **No message sends itself, with exactly one exception.** Every message to a candidate is offered to a person, who chooses to send it. The exception is the acknowledgement that their application arrived — the one message nobody should have to remember. This is stronger than "a human decides outcomes": a human also decides every time a candidate is told anything. *(PN-004)*
- **Candidates are told how long their data is kept, and it is then deleted.** The retention window is a promise made on the application page, in plain language, before anyone submits — which makes it a product commitment rather than a data-handling detail. *(Principle 9)*

---

## 1. Product Vision

Ziphyre exists to make hiring feel manageable for small and mid-sized businesses that hire regularly but have no recruiting team to do it. In these companies, hiring is a side-of-desk job for a founder, an office manager, or a single HR generalist — squeezed between everything else they own. The work that consumes them is not judgement; it is coordination: reading a hundred near-identical CVs to find the ten worth a call, chasing candidates for availability, rescheduling interviews over phone and email, retyping the same message for the fiftieth time, and keeping track of who is where in a spreadsheet that goes stale by Wednesday. Ziphyre absorbs that coordination work and hands back a clear, ordered, always-current picture of the hiring pipeline — so a small team can run a professional hiring process without hiring someone to run it. The change we create: hiring stops being the thing that quietly eats a week, and the candidate on the other side stops being left in silence.

---

## 2. Target Users (Personas)

Five personas. Future specs should reference them by name — "this is a Meera use-case", "this is an Arjun screen".

### Priya — The Candidate

**Who they are.** Someone applying for a job. In our market, often applying from a phone, often to many companies at once, often early in their career or making a lateral move. May or may not check email frequently. Has no relationship with the company and no obligation to us.

**What they're trying to achieve.** Get the job — and short of that, get a clear answer quickly so they can move on. Know whether they are still in the running. Get an interview slot that fits around a current job or classes, without a five-message back-and-forth.

**What frustrates them today.** Silence. Applying into a void with no acknowledgement and no outcome, sometimes for months. Being asked "when are you free?" and then hearing nothing for two weeks, by which time the answer has changed. Finding out they were rejected only by inference. Being told to attend an interview at a time that was never negotiated.

### Meera — The HR Generalist

**Who they are.** The one-person people function at a 40–300 employee company. Owns recruitment, onboarding, payroll coordination, compliance, and the office birthday calendar. Not a specialist recruiter. Highly competent, permanently over-committed. **Ziphyre's primary user — if Meera does not adopt it, nothing else matters.**

**What they're trying to achieve.** Close open roles fast enough to keep department heads off their back, without letting quality slide. Get through the CV pile in a morning rather than a week. Never be the reason an interview was missed. Be able to answer "where are we on the sales role?" instantly, without opening three files.

**What frustrates them today.** The CV pile — the single biggest time sink, and the least intellectually rewarding part of the job. Scheduling ping-pong across email, phone, and messaging apps. A tracking spreadsheet that is only accurate on the day it was updated. Retyping the same interview invite and the same regret note over and over. Being blamed for a slow process whose slowness is mostly other people not responding.

### Rahul — The Founder / Business Owner

**Who they are.** Runs the business. Hiring is one of a dozen things they own, but for key roles they are personally involved and often make the final call. In the smallest companies, Rahul *is* the hiring team — there is no Meera.

**What they're trying to achieve.** Confidence that roles are moving, without having to run the process. Fast visibility: how many applied, how many are worth meeting, what is stuck. Personal involvement only at the moments that matter — the final few candidates.

**What frustrates them today.** Having to ask for status instead of seeing it. Discovering a role has been open for two months with no clear reason why. Interview time wasted on candidates who should have been filtered out earlier. Paying recruitment agency fees for roles the team could have filled themselves with better organisation.

### Arjun — The Department Hiring Manager

**Who they are.** Runs a team — sales, operations, engineering, accounts — and needs a headcount filled. Not an HR person and has no interest in becoming one. Interviews candidates; does not want to administer a process.

**What they're trying to achieve.** See a short, high-quality shortlist rather than the whole pile. Get interviews on the calendar without being the one to arrange them. Give a verdict quickly and have the process move on.

**What frustrates them today.** Being forwarded fifty CVs with "have a look when you can". Interviews appearing on the calendar with no CV attached and no context. Giving feedback into a chat thread where it disappears. Roles stalling because nobody told them a decision was waiting on them.

### Sana — The External Recruiter or Consultant

**Who they are.** A part-time recruitment consultant or agency contact helping fill specific roles. Works with several clients. Needs to participate in the process without seeing the whole business.

**What they're trying to achieve.** Submit candidates into the client's process and see what happened to them. Prove value with visible progress.

**What frustrates them today.** Sending CVs by email into silence. No way to know whether a submitted candidate was even opened. Duplicate submissions causing awkward conversations.

> Sana is a secondary persona. Support for scoped external collaborators is a real requirement, but Sana's needs should never drive a decision that complicates Meera's daily work.

---

## 3. The Problem Space

The pains below are the ones Ziphyre is built to remove. Each is framed as it exists today, and as it should exist with Ziphyre.

### Applications arrive as an unstructured mess

**Before Ziphyre.** CVs land in a shared inbox, a personal inbox, a messaging app, and a folder on someone's desktop. Different formats, different levels of detail, no consistent way to compare two candidates side by side. Some applications are simply never seen. Nobody is confident the pile is complete.

**With Ziphyre.** Every application for a role lands in one place, attached to that role, in a consistent shape. Nothing gets lost, and "have we looked at everyone?" has a real answer.

### Initial screening is slow, manual, and inconsistent

**Before Ziphyre.** Someone reads every CV top to bottom, or — more honestly — skims the first twenty properly and the rest in a hurry. What counts as "qualified" drifts over the course of an afternoon and differs between two people doing the same task. The best candidate might be number seventy-three.

**With Ziphyre.** Every CV is read against the role's stated requirements and given a relevance score with the reasoning behind it. The pile arrives pre-ordered, with the strongest matches first and the reasons visible. A human still decides — but they start from an ordered queue instead of a heap, and they apply the same yardstick to the first CV and the last.

### Scheduling burns hours and loses candidates

**Before Ziphyre.** "When are you free?" "Tuesday or Wednesday." "Tuesday 3pm?" "Sorry, can we do 4?" — multiplied across eight candidates and three interviewers, over email, phone, and messages. Interviewer calendars are checked manually, or not at all. Double-bookings happen. Candidates go cold waiting.

**With Ziphyre.** The candidate is offered real slots that already work for the interviewer, picks one, and it is confirmed on both sides. Rescheduling is self-service and does not require a human to broker it. The coordination cost of an interview drops close to zero.

### The same messages are written again and again

**Before Ziphyre.** Every invite, reminder, and regret note is retyped or copy-pasted from an old email, with the last candidate's name occasionally left in. Tone and professionalism vary with how tired the sender is. Bad communication in a tight labour market costs real candidates.

**With Ziphyre.** Messages for each moment in the process are written once, reused, and personalised automatically. Every candidate gets the same professional treatment regardless of who is sending or how busy the day is.

### Nobody has a current picture of the pipeline

**Before Ziphyre.** Status lives in a spreadsheet, an inbox, and someone's memory. Answering "where are we on this role?" requires reconstruction. Candidates fall through cracks between stages. Owners ask for updates; updates take an hour to produce and are out of date on arrival.

**With Ziphyre.** One live view per role shows every candidate, their stage, and what they are waiting on. Status is a byproduct of doing the work, not a separate reporting chore.

### Candidates are left in the dark

**Before Ziphyre.** Candidates hear nothing for weeks. Rejections are often never sent at all, because sending them is unpaid emotional labour nobody has time for. The company's reputation quietly erodes, and candidates who might have been right for a future role are lost.

**With Ziphyre.** Every candidate can see where they stand at any time, and outcomes are communicated by default rather than by exception. Being told "no" promptly and respectfully is a better experience than being ghosted, and it costs the hiring team nothing.

---

## 4. Value Proposition

**The promise: Ziphyre gives a small business the hiring process of a large one, without the recruiting team, the enterprise price tag, or the three-week setup.**

Four reasons someone chooses us:

**1. It solves the actual bottleneck.** Most HR software helps you *store* candidates. It gives you a place to put the pile — and leaves you to read, chase, and coordinate it yourself. Ziphyre does the reading, chasing, and coordinating. We are judged on hours removed from Meera's week, not on records stored.

**2. It is built for how MSMEs actually hire.** Not a scaled-down enterprise product. No approval hierarchies, no requisition workflows, no implementation consultant, no six-week rollout. A role can be opened and receiving applications the same day it is created. If a feature requires training to use, it is wrong for this market.

**3. Hiring only — done properly.** We are not a suite. We do not ask you to migrate payroll, attendance, and performance reviews to get one working hiring pipeline. Buy Ziphyre for hiring; keep whatever else already works.

**4. The candidate experience is part of the product, not an afterthought.** Status transparency and prompt outcomes are built in and on by default. For a small company competing for talent against bigger names, looking organised and treating people decently is a genuine advantage — and Ziphyre delivers it without anyone remembering to.

**What we are *not* promising:** that a machine decides who to hire. Ziphyre orders and accelerates the work leading up to human judgement. It does not replace human judgement, and we should never sell it as though it does.

---

## 5. Product Pillars

Six capability areas. Every feature should be traceable to one of them; a Product Note that fits none of them is either out of scope or a signal that this document needs updating.

### Pillar 1 — Roles & Application Intake

**What it does.** Lets a hiring team open a posting, define the openings inside it — including what a good candidate looks like for each, and which requirements are non-negotiable — and collect applications against them in one consistent place, however candidates arrive.

**Who it's for.** Meera and Rahul set roles up. Priya interacts with the application step. Sana submits into it.

**How it connects.** This is the foundation. The requirements captured here are the yardstick Screening measures against, the context Scheduling and Communication personalise from, and the container the Dashboard organises by. Weak role definition degrades every downstream pillar.

**Two ways in, deliberately.** Candidates apply themselves through the hosted page, and the team can put CVs in directly — because real hiring in this market arrives by WhatsApp and forwarded email as often as through a form, and a product that only accepts one of those routes gets a spreadsheet built alongside it. Both routes produce the same application, screened the same way. Where a candidate came from is recorded, never a difference in how they are treated.

**The requirements step is where a human is deliberately kept in the loop.** Requirements are read out of the job description, but nothing is marked non-negotiable without a person saying so. Real job descriptions are ambiguous about what is truly mandatory, and resolving that ambiguity by inference would silently reorder every shortlist that follows. *(PN-001)*

### Pillar 2 — Screening & Scoring

**What it does.** Evaluates each submitted CV against the role's requirements at the initial-screening stage, produces a relevance score, and shows the reasoning behind it — so the hiring team starts from an ordered queue with the strongest matches surfaced first.

**Who it's for.** Meera primarily. Rahul and Arjun consume the output as a shortlist.

**How it connects.** Consumes role requirements from Pillar 1. Feeds the ordering and shortlisting in Pillar 5. Its output is what makes Pillar 3 worth doing — you only schedule interviews with people worth interviewing.

**Guardrail.** Screening is *advisory triage for the initial stage only*. It never rejects a candidate, never advances one, and its scores are never shown to candidates. See Principles.

### Pillar 3 — Interview Scheduling & Coordination

**What it does.** Turns "let's talk to this person" into a booked meeting without anyone brokering it over email. The team makes their availability reachable, the candidate picks a time themselves, and the back-and-forth that normally costs a week does not happen.

**Who it's for.** Meera (removes the chasing), Priya (removes the back-and-forth), Arjun (interviews arrive on the calendar with context attached).

**How it connects.** Triggered by shortlisting decisions from Pillar 5. Uses message templates from Pillar 4 to invite. Scheduling outcomes belong in the candidate's stage in Pillar 5 and their visible status in Pillar 6.

**Scope note.** This pillar is deliberately stated as intent, not mechanism. Owning availability — reading interviewers' calendars, brokering slots, handling reschedules and cancellations natively — is a real and much larger product than carrying the customer's own booking link, and the two should not be confused when planning. Which of them exists today belongs in the build status, not here. What is durable is the outcome: the candidate books, nobody chases.

### Pillar 4 — Communication & Outreach Templates

**What it does.** Lets the team compose reusable messages for each moment in the hiring process — acknowledgement, invitation, regret, correction — personalised per candidate, and **offered at the moment the decision is made** so that sending is one deliberate click rather than a task to remember later.

**Who it's for.** Meera and Rahul author and configure. Priya receives.

**How it connects.** The delivery mechanism for the whole product. Shortlisting offers the invitation, rejecting offers the regret, reversing a rejection offers the correction. Consistent tone here *is* the candidate experience.

**Guardrail.** Nothing sends itself except the acknowledgement (see Decisions taken as given). Every other message is offered unticked, names how many real people will receive it, and goes only when someone chooses. This is what keeps Principle 4 — "silence is a bug" — from quietly becoming "the product mails candidates on its own": the product's job is to make the message impossible to forget, not to send it unasked. The two failures are not symmetrical. Forgetting to tell a candidate is repairable; telling them the wrong thing automatically is not.

### Pillar 5 — Pipeline Tracking & Shortlisting

**What it does.** One live view of every candidate for a role and what stage they are at, with the ability to move, shortlist, reject, filter, and act on candidates individually or in batches. The hiring team's daily workspace.

**Who it's for.** Meera lives here. Rahul checks in here. Arjun visits here for a shortlist.

**How it connects.** The hub. Shows Pillar 2's scores, triggers Pillar 3's scheduling and Pillar 4's messages, and is the source of the status Pillar 6 shows candidates. Updating the pipeline should be a side effect of doing the work, never a separate chore.

**It also has to leave the product.** A shortlist is frequently discussed with someone who will never log in — a founder, a client, a panel member. Getting candidates out of Ziphyre in a form that can be mailed or printed, carrying the same order and the same reasoning shown on screen, is part of this pillar rather than an afterthought to it. A pipeline nobody can share is a pipeline that gets retyped into a spreadsheet.

### Pillar 6 — Candidate Transparency

**What it does.** Gives every candidate a way to see where their application stands — under evaluation, approved to move forward, or not proceeding — plus what happens next and when, without needing to chase anyone or create an account.

**Who it's for.** Priya. Indirectly serves Meera by removing "any update?" follow-ups.

**How it connects.** A read-only reflection of Pillar 5, deliberately simplified. Internal stages are detailed; what the candidate sees is a plain-English summary. The rules for translating one into the other are a product decision, not a display detail.

**The translation is not a formatting choice — it is the pillar.** Two rules carry most of the weight. A candidate is never shown an outcome a person has not chosen to send them: an internal decision that has not been communicated must read as still in progress, or the page becomes a way of finding out you were rejected from a message nobody sent. And the page carries the retention promise, so a link that has outlived the data explains that plainly instead of failing. Getting this wrong does not look like a bug to the candidate — it looks like the company treating them carelessly.

---

## 6. Core User Journeys

Eight journeys. Each is intent and outcome — no screens, no layouts.

### Journey 1 — Open a role and start collecting applications

**Persona:** Meera (or Rahul in a smaller company)
**Goal.** Get a new opening live and receiving applications today.
**Steps.** Creates the role with title, basic details, and — critically — what a good candidate looks like: must-have skills, experience range, qualifications, any deal-breakers. Names who is on the hiring team and who will interview. Chooses how candidates apply. Shares the opening wherever they normally advertise.
**Success.** The role is live within minutes, applications arrive into one organised place, and the requirements captured are specific enough for screening to be genuinely useful.

### Journey 2 — Get through the CV pile

**Persona:** Meera
**Goal.** Turn a hundred applications into a shortlist of ten, in one sitting rather than one week.
**Steps.** Opens the role and sees applications already ordered by how well they match the requirements, with the reasoning shown for each. Works down from the top, reading the reasoning and the CV. Marks candidates to shortlist or reject as they go. Spot-checks lower-scored candidates to sanity-check the ordering. Overrides the ordering freely — a low score is never a barrier.
**Success.** The pile is fully processed in a fraction of the previous time, every application has been given a fair look, the shortlist is defensible, and Meera trusts the ordering enough to use it again next time.

### Journey 3 — Get interviews on the calendar

**Persona:** Meera, involving Arjun and Priya
**Goal.** Move eight shortlisted candidates into confirmed interviews without a scheduling marathon.
**Steps.** Selects the shortlisted candidates and starts an interview round, choosing who interviews, how long, and the window of days. Candidates are invited with real available slots. Each candidate picks the slot that suits them. Confirmations reach everyone, with the CV and context attached for the interviewer. Reminders go out ahead of time.
**Success.** Interviews are confirmed with near-zero human coordination, nothing double-books, the interviewer arrives prepared, and no candidate goes cold waiting for a time.

### Journey 4 — Handle a change of plan

**Persona:** Priya, or Arjun
**Goal.** Move or cancel a scheduled interview without derailing the process.
**Steps.** The candidate can't make the slot, or the interviewer gets pulled into something. Either side triggers a change from their side. Fresh options are offered, a new time is picked, and everyone's confirmation updates. The change is visible to the hiring team without anyone reporting it.
**Success.** The reschedule takes seconds and involves no phone calls. The candidate isn't penalised for a legitimate conflict, and the change is on the record.

### Journey 5 — Check where I stand

**Persona:** Priya
**Goal.** Find out whether this application is still alive.
**Steps.** Opens the private link from the acknowledgement message — on a phone, without a password. Sees the current state of the application in plain language, what happens next, and roughly when. Returns whenever they want.
**Success.** Priya gets an honest answer in under ten seconds without emailing anyone. Meera receives no "any update?" message. If the answer is no, it is clear, and Priya can move on.

### Journey 6 — Close out the candidates who aren't moving forward

**Persona:** Meera
**Goal.** Tell everyone who didn't make it, promptly and respectfully, without spending an afternoon on it.
**Steps.** Selects the candidates being declined at this stage. Chooses the appropriate message template. Reviews and sends. Their visible status updates.
**Success.** Nobody is ghosted. The whole close-out takes minutes. The tone is consistent and human. Declined candidates remain findable for future roles rather than disappearing.

### Journey 7 — Review the shortlist and give a verdict

**Persona:** Arjun
**Goal.** Assess the candidates worth his time and hand back a decision.
**Steps.** Receives a short, ordered shortlist rather than the raw pile. Reviews each candidate with their CV and screening reasoning to hand. Attends the interviews already on his calendar. Records his verdict against each candidate where the hiring team can see it.
**Success.** Arjun spends his time on interviews rather than administration, and his decision moves the process forward immediately without Meera chasing him for it.

### Journey 8 — See whether hiring is on track

**Persona:** Rahul
**Goal.** Understand the state of hiring across the business in two minutes, without asking anyone.
**Steps.** Opens Ziphyre. Sees each open role, how many applied, how many are shortlisted, how many are at interview, and where things are stuck or waiting on someone. Drills into a role that looks stalled.
**Success.** Rahul gets a truthful current picture without generating work for Meera, and can intervene on the specific thing that is blocked rather than asking for a general update.

---

## 7. Roles & Permissions (Conceptual)

Three levels of access. Described in terms of what each can see and do — never how this is enforced.

### Candidate (Priya)

Not a member of the hiring team and has no account. Access is limited to their own application, reached through a private link sent to them.

- **Can see:** their own application, its current status in plain language, what happens next, their scheduled interview details, and messages sent to them.
- **Can do:** submit an application, pick or change an interview slot from the options offered, withdraw their application.
- **Can never see:** their screening score or its reasoning, internal notes or interviewer feedback, other candidates, anything about the company's process beyond their own application, or any other role's pipeline.

### Hiring Team Member (Arjun, Sana)

A signed-in user invited into an organization and given access to specific roles. Participates in hiring but does not administer it.

- **Can see:** candidates and applications for the roles they are on, screening scores and reasoning, their own interview schedule, and shared feedback for their roles.
- **Can do:** review candidates, record shortlist and reject recommendations, record interview feedback, manage their own availability and their own interviews, send messages using existing templates.
- **Cannot do:** create or close roles, change what a role is screening for, author or edit templates, invite or remove people, see roles they are not assigned to, or change organization-wide settings.

> Sana — an external collaborator — is this role with tighter scoping: typically access to their own submitted candidates on named roles only. Where a spec needs a distinction between internal and external members, it should say so explicitly rather than assuming one.

### Admin (Meera, Rahul)

Owns the hiring process for the business. The default role for the person who sets Ziphyre up.

- **Can see:** everything in the organization — all roles, all candidates, all scores and reasoning, all feedback, all messages sent, and overall hiring progress.
- **Can do:** everything a Hiring Team Member can, plus create, edit, close, and reopen roles; define and change what a role screens for; author, edit, and configure outreach templates and when they send; invite, assign, and remove team members and set their access; make final shortlist and rejection decisions; act on candidates in batches; configure the organization's profile and settings.
- **Only an Admin can:** permanently delete a role or a candidate record, change another person's access, or alter organization-wide settings.

**Cross-cutting rules that apply at every level:**

- Access is scoped to a single organization. Nobody sees another business's roles or candidates.
- Consequential actions — sending messages, changing a candidate's outcome, deleting records — are attributable to the person who took them.
- Candidates always have the right to see their own status and to withdraw.

---

## 8. Principles & Non-Goals

### Principles — we always do this

1. **A human decides; the product prepares.** Ziphyre orders, drafts, schedules, and surfaces. Rejecting and advancing a candidate is a person's action, always. No candidate is ever eliminated by the system alone.
2. **Every automated judgement shows its reasoning.** A score without a "because" is unusable and untrustworthy. If we cannot explain it in plain language to Meera, we do not show it.
3. **Judgements are always overridable, and overriding is easy.** The ordering is a suggestion. Acting against it must never feel like fighting the product.
4. **Silence is a bug.** Every candidate can always find out where they stand. Every state change reaches the people it affects. Not sending an outcome is a defect, not a default.
5. **Optimise for the busiest person in the room.** Meera does this between other jobs. Fewer steps beats more options. If a common task takes more than a couple of actions, that is a problem worth a spec.
6. **Usable on day one, without training.** No implementation projects, no configuration marathons, no manuals. A new customer should get value in their first session.
7. **Status is a byproduct of work, never a separate chore.** Nobody should have to update a tracker. Doing the work updates the picture.
8. **The same yardstick for every candidate.** Consistent criteria, consistently applied, whether it is the first CV or the hundredth.
9. **Candidate data is held in trust.** People hand us sensitive personal information to get a job, not to be marketed to or traded. Minimum collection, clear purpose, honest retention.
10. **Say the honest thing.** Both to candidates about outcomes, and to customers about what the product does and does not decide.

### Non-Goals — we deliberately don't do this

1. **Not an HRMS.** No payroll, attendance, leave, performance reviews, appraisals, or employee records. Hiring ends at the offer; what happens after is someone else's product.
2. **Not an automatic decision-maker.** We will not build auto-reject, auto-advance, or any flow where a candidate's outcome is determined without a person. This is a permanent guardrail, not a phase-one limitation.
3. **Not a job board.** We do not run a marketplace or own candidate supply. Businesses advertise where they already advertise.
4. **Not an assessment platform.** No skills tests, coding challenges, psychometrics, or proctoring.
5. **Not a video interviewing tool.** We schedule interviews and can carry a meeting link; we do not host the meeting.
6. **Not a sourcing or outbound recruiting tool — for now.** Our outreach is to people who applied to us. Cold-contacting passive candidates is out of initial scope.
7. **Not a background verification or reference-checking service.**
8. **Not an enterprise ATS.** No multi-level approval chains, requisition budgeting workflows, or heavy compliance reporting. Adding enterprise complexity would break the product for the market it is built for.
9. **We do not show candidates their scores or internal notes.** Not as an option, not as a setting.
10. **Not a general communication tool.** Messaging exists to move the hiring process forward. We are not building an inbox or a chat product.

---

## 9. Positioning & Alternatives

What Meera would use if Ziphyre did not exist, and why we win.

**Spreadsheets, email, and messaging apps — our real competitor.** Free, familiar, and already in use at most MSMEs. Loses on everything that is work: it stores information but does none of the reading, chasing, or coordinating, and it is stale the moment someone stops maintaining it. Our argument is not "our tool is better than your spreadsheet" — it is "the hours you spend maintaining that spreadsheet disappear."

**Keka, Zoho People, and similar Indian HR suites.** Broad HR platforms where hiring is one module among payroll, attendance, and performance. Strong if you want to run all of HR in one place. Their hiring module is typically a record-keeping system, not an automation engine — and buying the suite to fix hiring means migrating everything else. We are the focused alternative: one job, done deeply, no migration.

**BambooHR and comparable Western HR platforms.** Well-designed, employee-record-centric, priced and shaped for markets other than ours. Overweight and overpriced for a 60-person Indian manufacturer, with hiring again as a secondary concern. We are built for this market's price point, hiring volume, and communication habits.

**Recruitment consultants and agencies.** The default outsourcing answer for hard roles. Genuinely useful for senior or specialist hiring, and expensive per hire. They own the process, so the business loses visibility and builds no capability. We are the answer for the steady flow of routine roles a business should be able to fill itself — and we can coexist with an agency on the roles where one is genuinely needed.

**Dedicated recruiting tools aimed at larger teams.** Powerful, sophisticated, built for a recruiting function that has its own headcount and process. Assume a full-time owner and configuration effort that MSMEs do not have. We assume the opposite: nobody's full-time job is this.

**Our one-line position:** *the hiring tool for businesses too small to have a recruiter and too busy to hire like one.*

---

## 10. Roadmap Themes

Directions, not features. Order signals rough priority. Anything here is a candidate for future Product Notes; nothing here is committed.

### Theme A — Deeper evaluation beyond the CV

Screening today reads a CV. The natural extension is to make every stage after it as structured as the first: role-specific screening questions at application, consistent interview scorecards, feedback captured in a comparable form rather than as free text. The goal is that the *whole* evaluation is consistent and defensible, not just the opening filter — and that the hiring team can compare finalists on the same terms.

### Theme B — Filling the funnel

Today we process the candidates who arrive. Over time we should help businesses get better candidates in the first place: publishing roles to the places they already advertise without duplicate data entry, employee referrals, and — most valuable — re-engaging good candidates already in the system from previous roles. Every business we serve is quietly sitting on a talent pool it has no way to use.

### Theme C — Learning from outcomes

Once enough roles have run end to end, the product can tell the business things it cannot see itself: which stage loses the most candidates, how long roles actually take, where the process stalls, whether the screening ordering matched who eventually got hired. This is also how screening quality improves over time. Both a customer-value theme and a product-improvement theme.

### Theme D — From offer to first day

The obvious adjacent gap: offers, acceptance, and the handoff into onboarding — the moment where a hire currently falls out of Ziphyre and into someone's inbox again. Closing this completes the hiring story without turning us into an HRMS. Deliberately last: it is only worth building once the core loop is genuinely good.

---

## 11. Glossary

| Term | Meaning |
|---|---|
| **Organization** | One business's private space in Ziphyre — its postings, candidates, people and settings, plus its own profile: name, industry, location, timezone and currency. Timezone and currency are not decoration: salary figures and every displayed date read from them. Nothing is shared between organizations. |
| **Posting** | A hiring drive the business opens and shares — one advertisement, one application link. A posting groups one or more openings and has its own lifecycle: open, then closed. What the admin shares to a job board, a WhatsApp group, or their network. |
| **Opening** (also *role*, *job*) | A specific position being hired for — Chartered Accountant, Designer, Social Media Manager. Lives inside a posting; candidates choose one when they apply. **The organising object**: applications, screening, interviews, and tracking all belong to an opening, and each opening carries its own job description and scoring setup. A posting with three openings evaluates its applicants three different ways. |
| **Role requirements** | The plain-language definition of a good candidate for an opening: skills, experience range, qualifications, deal-breakers. The yardstick screening measures against. Each requirement is marked by the admin as either a must-have or a preference — job descriptions do not reliably signal their own priorities, and the distinction materially changes how candidates rank. |
| **Must-have** | A requirement the admin has marked as mandatory. Missing one is shown plainly next to a candidate's score rather than being absorbed into it — and is never, on its own, a rejection. |
| **Candidate** | A person who has applied. Also the persona name Priya. |
| **Application** | One candidate's submission for one role. The same person applying to two roles has two applications. |
| **Hiring team** | The people in an organization working on a given role — admins, interviewers, and any external collaborators. |
| **Stage** | Where an application sits in the internal process — for example applied, screened, shortlisted, interviewing, decided. Visible to the hiring team, not to the candidate. |
| **Status** | The plain-language summary of a stage shown to the candidate: under evaluation, approved to move forward, or not proceeding. A simplification of stage, not the same thing. |
| **Screening** | The initial evaluation of a submitted CV against role requirements. Initial filtering only — not a full assessment. |
| **Screening score** (also *lead score*) | The relevance rating produced by screening, used to order the queue. Internal only; advisory only; never shown to candidates; never auto-rejects. |
| **Screening reasoning** | The plain-language explanation of why a candidate scored as they did. Always shown alongside the score. |
| **Shortlist** | The set of candidates a human has selected to move forward to interview. A human decision, informed by screening — never produced automatically. |
| **Outreach template** | A reusable message for a specific moment in the process (acknowledgement, invitation, reminder, regret, offer), personalised per candidate when sent. |
| **Interview round** | A batch of interviews of the same type for the same role — for example "first-round calls for the sales role". |
| **Availability** | When an interviewer can take interviews. Terms in this row and the two below it belong to the fuller scheduling capability described in Pillar 3's scope note — they name concepts the product reasons about, not a claim about what exists today. |
| **Slot** | A specific offerable interview time. Candidates choose from slots rather than negotiating times. |
| **Reschedule** | Moving a confirmed interview to a new time. Can be initiated by either the candidate or the hiring team, without a human broker. |
| **Status link** | The private link that lets a candidate view their own application status without an account or password. |
| **Disposition** | The recorded reason a candidate did not proceed. Internal; used for the team's own understanding, never shown to the candidate. |
| **Talent pool** | Past candidates who did not get one role but may suit a future one. Currently a byproduct; a deliberate capability under Roadmap Theme B. |
| **Batch action** | Acting on several candidates at once — shortlisting, declining, or inviting a group in one step. |
| **Withdraw** | A candidate removing themselves from consideration. Always available to them. |
| **Admin / Hiring Team Member / Candidate** | The three access levels. See Section 7. |
| **Product Note** | A short feature ask written by a PM, combined with this document to produce a Functional Spec. |
| **Functional Spec** | The document describing what a feature does and how a user experiences it, produced from a Product Note plus this document. |
| **MSME** | Micro, Small and Medium Enterprise. Our market: businesses that hire regularly but have no dedicated recruiting function. |
