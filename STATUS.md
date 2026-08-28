# Ziphyre — Current State

**Updated:** 28 August 2026
**Purpose:** Session handoff. Where the build actually is, what's next, and
what's outstanding. Everything durable lives in the documents below — this
file is deliberately just the moving parts.

---

## Read these first

| Document | What it is |
|---|---|
| `ProductContext.md` | Product truth — personas, pillars, principles, glossary |
| `TechDecisions.md` | Stack truth and the *why* behind it. Stands in for `CodeContext.md` until there's enough code to write that properly |
| `ProductNotes/PN-001-…md` | The original feature ask |
| `ProductNotes/PN-002-…md` | Why Google intake was replaced by a hosted apply page |
| `ProductNotes/PN-003-…md` | Why the screening prompt is visible but not editable |
| `ProductNotes/PN-004-…md` | Candidate communications — why SMTP not OAuth, and the status-page rules |
| `docs/functional-specs/admin-dashboard-intake-screening.md` | What it does — FR-1 to FR-105 (Draft 9; FR-1–4, 19–29, 36, 62–65 retired) |
| `docs/tech-specs/admin-dashboard-intake-screening.md` | How it's built — schema, jobs, routes, milestones (Draft 9) |
| `Testing/README.md` | Why the baseline file is gitignored, and what it's for |

**Read `ziphyre/AGENTS.md` before writing code.** This Next.js version has
breaking changes from training data; check `node_modules/next/dist/docs/`
rather than assuming. Several real bugs have come from ignoring it.

**Two lint rules this codebase will hold you to**, both of which caught real
bugs rather than style nits:
- `react-hooks/set-state-in-effect` — no `setState` synchronously in an
  effect. For browser-only values (localStorage, `window.location`) use
  `useSyncExternalStore` with an explicit **server snapshot**; that is also
  what keeps hydration honest. See `sidebar.tsx` and `apply-link.tsx`.
- Reading `typeof window` during render causes a hydration mismatch. It has
  happened once already and the fresh dev-server log is what surfaced it —
  **stale Turbopack console errors will mask it**, so trust `preview_logs`
  over the browser console after a restart.

---

## Where the build is

**Done: M0 (foundations), M1 (postings, openings, JD, requirements), M2
(screening).**

Working and verified in the browser, not just typechecked:

- Google sign-in, organization bootstrap via `SEED_ADMIN_EMAIL`, membership
- Organization settings (read + write, through RLS)
- Dark mode with a Light/Dark/System toggle in the account menu
- Postings and openings: create, edit, close, reopen, delete
- JD attachment with append-only versioning (editing creates v2, never
  overwrites v1)
- **Requirement extraction against the real CA job description** — 29
  discrete, individually markable requirements, compound bullets split
  correctly, nothing pre-marked must-have (CA qualification + Tally marked
  must-have by hand for the M2 test)
- BYOK provider settings with multi-provider fallback
- **Manual CV upload, the real background job queue, and the screening
  pipeline.** `candidate`/`application`/`screening`/`stage_event`/`job`
  tables, a private `cvs` Storage bucket, atomic job claiming with backoff
  retries, `/api/cron/jobs` guarded by `CRON_SECRET`, and a candidates list
  UI with a full-assessment dialog per application.
- **The seven real CA CVs, screened and compared against
  `Testing/baseline-ranking-CA-role.md`.** Correctly separates the two
  qualified CAs from the five who are not, and ranks the strongest candidate
  first — the milestone's actual exit bar. See "M2 test result" below for
  what it got wrong.
- FR-47 (unreadable CV) verified with a real case: a legacy `.doc` upload
  lands at Needs manual review with its own specific reason, never a score.

**M3 (Google) — shipped, then deliberately replaced by M3.5.** Connection, form matching, the
`import_submissions` job, and the unmatched queue are built and verified
live: a real Google Form submission (Sai Phani, 23 Aug 2026) reached the
pipeline unaided — imported, CV pulled from Drive, screened (6.2/10) —
with zero manual action beyond submitting the form. That proved intake
worked end to end — and then PN-002 removed the whole path, because the
setup ritual needed a 144-line manual and the sensitive OAuth scopes it
required sat behind a Google review that blocked every real customer.

**M3.5 (native intake) — done, exit bar met.** The Google path is gone
entirely, replaced by a Ziphyre-hosted application page (PN-002,
functional spec Draft 6, tech spec Draft 5). Verified live 26 Aug 2026: a
candidate applied through `/apply/[token]` with **no Google account on
either side**, saw confirmation immediately, and was screened 8.8/10
automatically.

**M4 — done, exit bar met.** The shell shipped in the morning of 27 Aug
2026; the stage transitions that make it move shipped the same day.

The shell:

- **Home dashboard** (FR-101 – FR-105): active postings and openings, total
  applications, the five-stage funnel that sums exactly to that total, and a
  separate needs-review callout. Scoped to active postings.
- **Opening page split into Pipeline | Setup tabs.** Pipeline leads once
  anyone has applied — which is also what FR-78 requires of a link from
  Home; Setup leads only while the opening is empty.
- **CV readable beside its assessment** (FR-61), via a 5-minute signed URL
  fetched when the dialog opens.
- **Filters and sorting** (FR-66/67/69/70) over score, each component,
  must-have result, screening status and date, with clearable chips.
- **JD upload** (FR-7 — PDF/DOCX/MD/TXT) and JD export.
- Collapsible sidebar; page content centred; a way out of a half-filled
  create form.

**The stage transitions (FR-56 – FR-60)** — migration
`20260827120000_m4_stage_transitions.sql`, applied. Verified live against
the real CA pipeline, not just typechecked:

- **Single and batch moves** (FR-56). Shortlisted the top-ranked CA, then
  rejected the two lowest scorers in one action. **Two `stage_event` rows,
  one per candidate** — no batch shortcut, per FR-59.
- **Disposition and note** (FR-57/58), both optional, both skippable, with
  an explicit Skip button. Recorded against each candidate in a batch.
- **Stage history** (FR-59) on the application, showing August's system
  event as "automatically, when screening finished" and today's move
  attributed by name and time.
- **Moving back works and the history keeps the reversal.** Un-rejected a
  candidate; the score stayed 3.8, and the rejection with its disposition
  and note is still on record.
- **Reassignment** (FR-60). Moved one CA-qualified candidate from the CA
  opening to a new Accounts Executive opening with a rescreen. **The rescreen used the
  new opening's JD** — verified through `jd_version_id`, not assumed — and
  scored 9.4 against 6.8 for the CA role, which is the right direction for
  a CA-qualified candidate applying where CA isn't required.
- **The guards fire.** A non-member actor, an unknown stage, a move to the
  same opening and a cross-posting move are all refused by the database,
  tested directly.
- **The Home funnel moves.** 0 New · 5 Screened · 1 Shortlisted · 0 On hold
  · 2 Rejected — summing to 8, so FR-102's arithmetic still reconciles.

**Also added:** the FR-66 stage filter, plus a "Still in play" option that
hides Rejected and On hold in one choice. It was pointless before — every
application read `Screened`, so it was a control with one setting.

**Pipeline presentation, 27 Aug (second pass).** The candidate list is a
real table with a header row instead of a list that repeated "JD / Exp /
Skills" on every row, and it carries two more things:

- **A CV file column beside the candidate's name.** These read as
  duplicates for manual uploads, because manual upload seeds the candidate
  name from the filename. They diverge for anyone who applied through the
  apply page — the demo's one form application is named "Sai Phani" but
  attached a CV file saved under a different candidate's name entirely,
  which is the case the column exists to make visible.
- **Date received filter with exact dates** (FR-66), over
  `application.submitted_at` rather than `created_at`. **No backfill was
  needed** — `submitted_at` was already populated on every application,
  manual uploads included, so nothing had to be given a fictional date.
  Sorting by date moved onto the same field, so "Newest first" and "Last
  7 days" cannot disagree about what newest means.

**Summaries at all three levels — organisation, posting, opening.** Same
tiles, same five-stage funnel, rendered through **one shared component**
(`components/pipeline/stage-funnel.tsx`) rather than three copies, because
FR-102's promise is that these numbers reconcile and three hand-maintained
versions is how "0 On hold" comes to mean different things on different
screens. The posting page also lists applications and shortlisted counts
per opening, so the posting total is traceable to where the candidates
actually are (7 + 1 = 8 on the demo).

The opening summary is **computed from the same array the table renders**,
not fetched separately — so it updates the instant a stage changes, with
no refetch. FR-102 and FR-103 hold at every level: the five stages sum to
the total, and Needs review sits outside them.

**M5 (filters & export) — built, on `m5-filters-export`.**

*Filters.* FR-66's form-answer half: location, notice period, CTC (all
text search), willingness to relocate, and a real numeric minimum on
experience. **FR-68** reports how many candidates were dropped purely for
never having answered a filtered field, names the field, and offers to
show them — the count stays visible while they are shown. FR-70 gains
sorting by any component rating.

The rules live in `lib/pipeline-filtering.ts` — pure, no React. **21
checks over the demo's real shape pass**, including the component sorts,
which the Radix listbox would not let me drive from a browser.

*Export (FR-71 – FR-75).* All three formats through
`POST /api/openings/[openingId]/export`:

- **CSV** — UTF-8 with BOM so Excel on Windows renders "₹" correctly.
- **Excel** — a real workbook via `exceljs`: numbers as numbers, frozen
  header, autofilter.
- **PDF** — `@react-pdf/renderer`, each candidate with scores, must-haves
  and the assessment summary, **in the order shown on screen** (FR-72),
  with the marker fixed on every page.
- **CV bundle** (FR-73) — a zip of the report plus each CV named after
  the candidate rather than its storage uuid.

**The client sends ids and an order, never rows.** Everything is re-read
server-side through the user's own client, so RLS decides what is
exportable and a tampered request cannot widen the scope.

Verified live: all three formats return real files with correct
content-types, the FR-75 marker carries the exporter's name and
timestamp, and the zip contained the report, a marker text file and both
CVs.

**M6 (retention) — built and tested, on `m6-overview-retention`.**

The apply page promises every candidate their details are kept six months
after the role closes and are then deleted. `lib/retention/purge.ts` keeps
that promise, on a daily cron at 03:00.

**Dry run unless told otherwise.** `/api/cron/purge` reports what *would*
go; only `?commit=1` deletes. That asymmetry is deliberate for the one
operation here that cannot be undone — a copied URL or a misfired poke
costs a JSON report rather than every CV Ziphyre holds. The cron entry
carries the flag; nothing else does.

**Tested against a real fixture before it could ever run for real**, which
is what §11 demands. An expired posting with two applications, a real
object in Storage, and a candidate deliberately holding a *live*
application on another posting:

- Dry run reported 2 applications / 2 CVs / 1 anonymised / 1 kept and
  changed nothing — verified by re-reading every field.
- Commit deleted the Storage object, nulled the CV paths, emptied
  `form_answers`, blanked `strengths`/`gaps`/`overall_read`, and set
  `purged_at`. **Scores, stage and dates survived** — §11's retained set,
  confirmed field by field (overall 7.0, JD 8, Skills 6 still present).
- **The candidate with a live application elsewhere was not anonymised.**
  That guard is the whole reason the job reads across postings before
  touching a candidate; without it, purging one posting would corrupt a
  live one.
- A second run reported zero — idempotent, so a retry after a partial
  failure resumes rather than re-deleting.
- The 30-day warning warns without purging and sets `purge_warned_at`
  once.

**Two real bugs the test caught**, neither visible to typecheck or lint:
the purge selected `previous_cv_storage_path`, a column M3.5 dropped —
and it discarded the resulting error, so it silently reported *0
applications to purge* on a posting with two. A purge that quietly does
nothing is the worst possible failure here, because it looks exactly like
success. Both the column and the swallowed error are fixed, and every
query in the job now surfaces its error.

The posting page carries the promise too: a calm note beyond 30 days, an
amber deadline inside it, naming what goes and what stays.

**M6 (overview) — done.** FR-77's per-opening counts now come from real
data: applications received, screened, shortlisted, still at New, and
needing manual review, on every opening on home. They existed only for
the sample-data preview before this; real openings showed *requirement*
totals, which say what was set up rather than what has happened since. An
opening with nobody in it still falls back to setup state, because "0
applied" on a role with no job description answers the wrong question.

FR-79 verified at 375px: home has no horizontal overflow, tiles stack
2-up and the counts wrap. **One real bug found and fixed** — the posting
page's opening rows were `shrink-0`, so on a phone the whole page scrolled
sideways by 16px. They wrap now. The pipeline table is deliberately left
scrolling inside its own container: the spec's stance is desktop for
working surfaces, phone for the overview, and a twelve-column table is
not a phone screen.


**M7 (candidate communications) — complete and merged to `main`, 28 Aug
2026.** PN-004, functional spec Draft 9 (FR-106 – FR-135), tech spec
Draft 9 §10A. Migrations `20260828090000_m7_communications.sql`,
`20260828160000_m7_purge_status_token.sql` and
`20260828170000_m7_outcome_reversed_kind.sql`, all applied.

**Also deployed to `ziphyre.vercel.app`** from `main`, root directory
`ziphyre`. Every commit auto-deploys.

*Built and verified:*

- **SMTP transport** behind one `send()` interface (`lib/mail/transport.ts`).
  **Not OAuth, deliberately** — `gmail.send` is a restricted scope and
  PN-002 established that one sensitive scope re-gates the whole consent
  screen, admin sign-in included.
- **Sender settings** at Settings → Communications. Credentials are proven
  against Gmail *before* saving (FR-114) — verified with deliberately wrong
  ones: real connection, Gmail 535, actionable error, nothing written.
- **The status page** `/status/[token]` — public, no login. Verified in all
  four states. **The one that matters: a candidate who is internally
  Rejected but has not been told sees "Received"** (FR-123, gated on
  `application.outcome_sent_at`). Its query fetches no score column at all,
  so Non-Goal 9 is structural rather than remembered.
- **`/status` is in the middleware public-path list.** Confirmed with no
  cookies: status page 200s for an anonymous candidate, `/postings` still
  redirects to sign-in.
- **Confirmation email queued on apply** (FR-117), carrying the status
  link, wrapped so a mail failure cannot cost a candidate their submission.
- **Booking link**, org-wide in Settings and overridable per opening on the
  Setup tab (FR-130/131). Blank means inherited; the card names the link
  actually in effect, because inherited and empty look identical otherwise.

- **FR-110 — the outcome email, offered when rejecting. Built and proven
  end to end, 28 Aug 2026.** The reject dialog offers to tell the
  candidate, unticked by default, with the count of real people named on
  the confirm button and "this cannot be unsent" beside the box.
  Manual-upload candidates are named as unreachable and excluded;
  anyone already told is excluded and re-checked at queue time.
  Messages are queued only for applications that actually moved.

  **The first real email this product has ever sent** went at 15:03 UTC:
  queued to `sent` in 7 seconds, Gmail accepted it, and
  `outcome_sent_at` was set 0.3s later — so FR-123's gate armed only
  after delivery succeeded, and the status page flipped from "Received"
  to "Not moving forward" exactly when a person chose to tell them.

  **Two real bugs the test caught, neither visible to typecheck, lint or
  a production build.** The default `outcome_rejected` template carried
  **no `{{statusLink}}`**, breaking FR-124 outright — the candidate would
  have been left holding a link that goes on saying "under review". Found
  by reading the send preview, which is what that preview exists for. And
  a failed send-check left the offer spinning "Checking who can be
  emailed…" forever, which reads as the *rejection* being stuck when only
  the offer had failed; failures now render with their reason and say the
  rejection can still proceed.

*The rest of M7, all built and sent for real on 28 Aug:*

- **Sending from the pipeline (FR-106 – FR-112).** Three offers, each
  unticked by default, each naming on the confirm button how many real
  people get mail (FR-108): the outcome when rejecting (FR-110), the
  correction when un-rejecting, and the interview invite. **Nothing
  sends itself** (FR-109) — the apply confirmation remains the only
  message no person chose.
- **Interview invites (FR-107, FR-130 – FR-132)**, two ways in: offered
  when shortlisting, and standalone on any shortlisted row or selection,
  which changes no stage. Making the invite depend on a move would write
  a stage-history row for a move that never happened. FR-132 is enforced,
  not assumed: no booking link, no offer. FR-131's per-opening override
  resolves **per application, not per batch**.
- **Bulk works throughout** — reject, un-reject, shortlist-and-invite,
  and standalone invite. One `message` row and one job per recipient, so
  a failure is attributable to the candidate it was meant for. The bulk
  invite button shows only when the whole selection is already
  shortlisted.
- **The Communications outbox (FR-133) at `/communications`**, in the
  primary nav — an outbox is something you check, not configure. Every
  message with candidate, role, kind, status, when, and who sent it; a
  failure carries its reason and a Retry (FR-111). **"Sent", never
  "Delivered"** (FR-112). Purged rows read "Details deleted" and cannot
  be retried. The sending identity moved here too (FR-134);
  `/settings/communications` redirects.
- **Template editing (FR-126 – FR-129)**, tested by the user: all five
  kinds editable, previewed with a real candidate's values through the
  **same `render()` the send path uses**. Unknown variables block the
  save — `render()` leaves a typo as literal text so it fails visibly,
  but without the check "visibly" means visible to the candidate.
  Restore-to-default inserts the default as a new version rather than
  deleting, because `message.template_id` references these rows.

**Four bugs the real sends caught, none visible to typecheck, lint or a
production build.** Worth recording because they are the argument for
sending to a real inbox rather than trusting a green build:

1. The `outcome_rejected` template carried **no `{{statusLink}}`**,
   breaking FR-124 outright — the candidate would have kept a link that
   goes on saying "under review". Caught by reading the send preview.
2. A failed send-check left the offer **spinning forever**, which reads
   as the rejection being stuck when only the offer had failed.
3. The reversal borrowed `general_update`, whose default body is a
   placeholder — **"[Write your update here.]" was sendable** to a real
   person. It has its own `outcome_reversed` kind now.
4. The send checkbox was **invisible** against a flat panel — a 16px box
   with a 1px border, on the one control that mails a stranger.

**Start the next session here.** M7 is done. Two things worth doing
before anything new:

1. **The apply confirmation (FR-117) has still never fired for real.**
   The path is complete and pumps its own job, but the only form
   application predates the mail setup, so no `application_received` has
   ever been sent. It is the first message every real candidate gets.
   Test by applying with a `+tag` alias on a personal address.
2. **Production's send-check spins where local works**, which points at
   `SUPABASE_SERVICE_ROLE_KEY` on Vercel — the offer calls
   `getMailSettings` through the admin client. Unverified, and it would
   break every send offer in production.

Then: M8, or the Outstanding items below — item 4 (the fallback note
lying after a provider reorder) and item 6 (CV bundles built in-request)
are the two most likely to embarrass a demo.

---

## M2 test result — is the ranking trustworthy?

Screened the seven real CA CVs against the CA JD with **Chartered
Accountant qualification** and **Tally** marked must-have (matching the
baseline's "treat CA as a hard gate" scenario). Compared to
`Testing/baseline-ranking-CA-role.md`:

- **Good:** ranks the strongest candidate first, and correctly separates
  the two qualified CAs from the other five — the two questions the
  baseline document itself says matter most.
- **Real problem found, partly fixed:** the must-have verdicts hallucinated
  twice on the first pass — one candidate with no CA credential was marked
  as meeting it, and a different candidate was credited with Tally
  experience her CV never mentions. Both confirmed against the actual
  extracted CV text. Tightening the prompt (`screen-v2`, `screen-v3`) fixed
  the CA-qualification case; the Tally hallucination for that one candidate
  persisted through both revisions. Recorded in `TechDecisions.md` §7 rather
  than chased further — this is exactly the kind of finding M2 exists to
  surface, and it's a real, open limitation, not a bug in the plumbing.
- **Not exercised in this pass:** the CV-internal experience-discrepancy
  check the baseline flags for one candidate (claimed vs. listed dates) —
  manual upload has no "declared experience" to diff against. Applications
  through the apply page do carry it, so FR-46 can now be exercised
  properly — worth doing during M4.

---

## Verified state, 27 Aug 2026

**Git:** on `main`, in sync with `origin/main` at `bd190aa`. Everything
described above is merged. No unmerged branches carry live work.

**Supabase** (`tkfxxhmserqkeoghyjmx`, "Ziphyre AI"): **17 tables**, RLS on
all. The M2/M4 set plus M7's `mail_settings`, `message_template` and
`message`. `application` gained `status_token` (unique, one per
application) and `outcome_sent_at`; `opening` gained `booking_url`.

**Local data** (the demo org): 1 open posting "Finance hiring, August,
Demo" with two openings — Chartered Accountant (7 applications: 2
Shortlisted, 4 Screened, 1 Rejected) and Accounts Executive (1). All 8
carry a `status_token`, so every one has a working status page.
`message` and `message_template` are empty, which is correct: no mail has
been sent, and template defaults live in code until a customer edits one.

**Two admins**, both active in the same organisation:
`saiphanimba09@gmail.com` (original) and **`ziphyre.ai@gmail.com` (the
primary from 28 Aug)**. `SEED_ADMIN_EMAIL` now accepts a comma-separated
list, and both are in `.env.local`. **Vercel needs the same value** or
only the original address will work in production.

**Mail sender configured and verified:** `ziphyre.ai@gmail.com`, Gmail
SMTP app password, `verified_at` set — Gmail accepted it on a real
connection. No booking link set yet.

**Providers configured**, in fallback order. **Reordered 28 Aug after
NVIDIA was found not to respond at all from Vercel** — it burned the
full 25s timeout on every screening before failing over. OpenAI is
primary again and answers in ~6s.

| # | Provider | Model |
|---|---|---|
| 0 | OpenAI | gpt-4o-mini |
| 1 | Google Gemini | gemini-3.5-flash-lite |
| 2 | NVIDIA NIM | openai/gpt-oss-20b |

---|---|---|---|
| 0 | NVIDIA NIM | openai/gpt-oss-20b | j2WZ |
| 1 | OpenAI | gpt-4o-mini | RnsA |
| 2 | Google Gemini | gemini-3.5-flash-lite | preg |

---

## Production is a different machine — 28 Aug

Deployed to **`ziphyre.vercel.app`** (Hobby, region bom1), root
directory `ziphyre`, auto-deploying from `main`. Everything below was
found *only* in production, after a green typecheck, lint and build.
**Read this before assuming local behaviour transfers.**

**Four failures stacked behind one symptom.** A PDF upload that read
"screening broke" was, in order: pdfjs touching `DOMMatrix` (a browser
API no Node has) at import time; the pdfjs **worker file not being
deployed** because it is loaded by a runtime path string that static
tracing cannot see; the **10-second function limit**; and finally the
real cause — **a provider that never answered**. Each was invisible
until the one before it was fixed.

- **`outputFileTracingIncludes`** now ships `pdf.worker.mjs`.
  `serverExternalPackages` keeps pdfjs unbundled so the worker stays
  beside its parent, which only helps if the worker is deployed at all.
- **`maxDuration = 60`** on the three routes that run jobs: the opening
  page (its Server Actions pump the queue via `after()`), the cron
  runner, and the public apply route. **A timeout is not an error and
  logs nothing**, so before this the only symptom was a job that never
  finished.
- **`lib/cv/dom-matrix-polyfill.ts`** — a real affine 2D matrix, not a
  stub, installed before the dynamic `pdf-parse` import.
- **`pdf-parse` is imported lazily.** As a top-level import it was
  evaluated whenever `postings/actions.ts` loaded, so a PDF-only
  dependency broke *every server action in that file* on a route that
  never opens a PDF. That is what "couldn't check who can be emailed"
  was.
- **Model calls now time out at 25s and fail over**; there was no
  timeout anywhere in that path before.
- **The job runner stops claiming after 45s** rather than after a fixed
  count, so it never starts work it cannot finish. Two screenings
  sharing one invocation is how an application ended up `in_progress`
  with a score already written.

**PDF parsing on Vercel now takes ~220ms.** The `@napi-rs/canvas`
warnings in the logs are noise; text extraction does not need it.

**Vercel Hobby caps cron at once per day**, and rejects the whole
`vercel.json` rather than downgrading an invalid schedule — which is why
the first deployment never appeared. `/api/cron/jobs` therefore runs
daily instead of every minute. The `after()` pump covers interactive
work; **anything queued with nobody around waits up to 24 hours**, and
`reclaimStuckJobs`' 10-minute rule effectively becomes 24 hours too.
This is the strongest single argument for a paid plan.

**How to debug production from here.** The Vercel MCP is connected with
project scope. `get_runtime_errors` gives grouped clusters and is the
right first call; `get_runtime_logs` with a `deploymentId` for detail.
Timing lines are in place: `[pdf] import Xms, parse Yms`, `[ai]
provider ok in Xms`. **Reading those logs answered in one run what an
hour of inference did not.**

---

## Outstanding

Split so a fresh session can see at a glance what still needs a human.

### Needs a decision or action

**1. Resolved 28 Aug — the purge keeps its M7 promises.** It now clears
`message.to_email`, `subject` and `body` (keeping `kind`, `status`,
`sent_at`) and nulls `application.status_token`. Re-tested against a
fixture per §11: dry run changed nothing, commit cleared every field,
the candidate with a live application elsewhere survived, and a second
run reported zero.

**2. Resolved 28 Aug — the un-reject contradiction.** Moving off Rejected
now offers to send the correction, and clears `outcome_sent_at` whether
or not you send it, so FR-123's gate re-arms and a later rejection needs
a fresh deliberate send. Verified end to end with a real email.

**3. Resolved 28 Aug — the transport is proven.** Three real emails sent
end to end: a rejection, a reversal, and an interview invite whose
booking link the user followed through to a real slot. See M7 above.

**3a. The apply confirmation (FR-117) has still never fired.** The only
form application predates the mail setup. It is the first message every
real candidate receives and the one remaining unproven path.

**3b. Production's send-check spins where local works.** Points at
`SUPABASE_SERVICE_ROLE_KEY` on Vercel — the offer reads mail settings
through the admin client. It would break every send offer in production.

**4. A screening's "used a fallback" note is computed against today's
provider order, so it lies after a reorder.** `getApplicationsForOpening`
in `src/lib/applications.ts` derives `usedFallback` by comparing the
stored provider against the *current* chain. **This got worse on 28 Aug**:
the chain was reordered twice in two days, so the note is now wrong for
most historical screenings in both directions. Worse, NVIDIA sat as
primary from 27 Aug while not responding at all — so screenings that
say "primary" were in fact fallbacks, and the one thing FR-86 exists to
tell the admin honestly has been inverted. **Fix by recording the fact
at write time** (a `was_fallback` column set by the screening job, which
already knows) rather than deriving it at read time.

**5. CTC and notice period are free text, so they can only be searched,
not ranged.** The apply form takes them as strings — "8 LPA",
"₹12,00,000", "2 months", "Immediate" — so the filter matches text. What
a recruiter actually wants is "expected CTC under 12 LPA", and that needs
those fields to become structured numbers **on the apply form**. Parsing
the existing strings instead would mean guessing at a dozen notations, and
a wrong guess silently drops a candidate — the exact failure FR-68 exists
to prevent. This is a form change, not a filter change.

**6. CV bundles are capped at 40 and built in-request.** Tech spec §10
puts them behind a `build_export` job because their size is
unpredictable; that job does not exist. Beyond 40 the export is refused
with an explanation. **This is the item most likely to bite in
production** — a serverless response has a size ceiling a local dev
server does not, so a bundle that works here can fail deployed. Build the
job before promising CV bundles to a customer.

**7. `exceljs` carries a moderate advisory through `uuid`.**
GHSA-w5hq-g745-h8pq — a missing buffer bounds check in uuid v3/v5/v6,
reachable only when a `buf` argument is passed, which exceljs does not
do. There is no semver-compatible fix; `npm audit fix --force` would
change exceljs itself. Left as-is deliberately rather than forcing a
breaking downgrade over an advisory our usage cannot reach. Recheck when
exceljs bumps its uuid.

**8. Export PDFs are Latin-1 only.** No font is registered, so
@react-pdf's built-in Helvetica is used — a font fetch failing inside a
request would turn an export into a 500. The cost is that a candidate
whose name needs Devanagari or Tamil will not render in the PDF. Worth
fixing with a bundled font file the first time it matters, which for an
Indian market may be soon.

**9. `middleware.ts` → `proxy.ts`.** This Next version deprecates the
middleware convention and warns on every boot:
`npx @next/codemod@canary middleware-to-proxy .` **The migration must carry
the public-path list forward** — `/apply`, `/api/apply` and `/api/cron`. Drop
them and intake and cron both break in production while looking fine locally.

**10. Twenty-nine requirements may be too many to mark by hand.** The CA JD
genuinely contains all of them, and some are boilerplate nobody would gate on
("Communication skills"). Deliberately *not* filtered — that would mean the
model deciding what matters, which the design refuses. If marking them proves
tedious the fix is UI (group or bulk-dismiss soft skills), never a cleverer
prompt.

**11. Tally hallucination — accepted, not fixed.** Screening credits the
top-ranked candidate with Tally experience their CV never mentions,
surviving two prompt revisions. Decided 22 Aug 2026: accept as a known model limitation;
revisit only if the pattern repeats. See `TechDecisions.md` §7.

**12. A scanned-PDF fixture still does not exist.** FR-47 is proven via the
`.doc` path, but no image-only PDF has been tried. Low priority now the path
itself works.

### Deliberate deviations, recorded so they are not mistaken for oversights

**Filtering runs client-side, not in the query.** Tech spec §9 specifies
server-side. The whole list is already loaded and §15 puts the ceiling at
"several hundred applications per opening", so an array filter is instant
where a round trip per dropdown change would not be. Reasoning is in
`pipeline-filters.tsx`. Revisit if that ceiling assumption stops holding.

**Score colours are a traffic light, red included — and that reverses an
earlier call.** Bands are red at or below 6, amber above 6 to 7, green
above 7; Rejected is red, Screened blue. The first cut deliberately used
*no* red, reasoning that red reads as a verdict and ProductContext
Principle 1 says screening ranks but never decides. The user was told that
and chose the traffic light anyway on 27 Aug 2026, which is their call to
make. **Don't quietly revert it to the no-red palette on principle** — the
principle is still honoured where it counts: the number is always beside
the colour, and no automatic behaviour anywhere keys off the band. A red
score still moves nobody; only an admin does.

The five stages run along that same scale: grey New, blue Screened,
**green Shortlisted**, amber On hold, red Rejected. Shortlisted shares
green with a strong score on purpose — they say the same thing about a
candidate, one as the model's reading and one as Meera's decision. It was
indigo until 27 Aug, which sat too close to Screened's blue to tell apart
down a column.

The tokens are `--fit-weak` (red) and `--fit-screened` (blue), added
rather than repointed. `--fit-rejected` stays slate because it means a
*closed posting* elsewhere — an administrative state, not a judgement
about a person. `--fit-shortlisted` was **renamed `--fit-accent`** when
Shortlisted went green: it is now purely a UI accent (the Primary-provider
badge, the Must-have marker chip) and says nothing about a candidate. The
rename was the point — a token named after a stage it no longer colours is
how the next person reintroduces indigo by accident.

**Colour now has exactly two sources**, after a first pass left four
places disagreeing: `lib/fit-tone.ts` owns score bands and the pass/fail
pair, `lib/stages.ts` owns stage colour as `STAGE_TEXT` / `STAGE_BADGE`.
Anything that colours a score or a stage reads from those. Add a new
coloured element by importing, never by writing a class name — that is
what let a must-have failure render amber in the table, indigo in the
dialog, and red nowhere.

**Must-have results are pass/fail, never amber.** A missed must-have is
the requirement the admin marked non-negotiable going unmet. Amber
understates it, and amber sitting next to a red score reads as the
*better* of the two, which inverts the meaning.

**JD upload stores text, not the file.** Everything downstream — extraction,
screening, versioning — works on text, and a stored binary would be a second
thing to read, retain and purge. Export therefore returns the text screening
ran against, not the original upload.

### Load-bearing lines a cleanup would plausibly delete

- **`serverExternalPackages: ["pdf-parse", "pdfjs-dist"]`** in
  `next.config.ts`. Removing it brings back "Setting up fake worker failed"
  on every PDF — a bundler failure that looks like a parsing bug.
- **`/apply`, `/api/apply`, `/api/cron` in the middleware public-path list.**
  Candidates have no session and cron carries no cookie; gating either makes
  applying impossible and stops the job runner dead.
- **`bodySizeLimit: "20mb"`** for Server Actions — bulk CV upload by the
  admin exceeds the 1 MB default. (The public apply page does not rely on
  this: it uploads direct to Storage.)

<details><summary>Resolved — kept for the record</summary>

- **GPT-4o mini not primary** — done 22 Aug; it is priority 0.
- **FR-47 has no test fixture** — resolved in M2 via the legacy `.doc` path.
- **Branch not pushed** — was stale; everything is on `main`.
- **Google OAuth stuck in Testing mode** — no longer applies. M3.5 removed
  every sensitive scope, so there is no verification review and no 7-day
  refresh-token expiry. This had been the single largest go-to-market
  blocker.
- **Opening page mixed setup with the candidate list** — split into
  Pipeline | Setup tabs, 27 Aug.
- **Rotate three API keys** — done 27 Aug 2026, confirmed by the user and
  visible in the database: all three key hints changed and all three
  `validated_at` timestamps are from that morning.
- **M4 proper — stage transitions** — shipped and verified 27 Aug. The Home
  funnel is no longer stuck at all-Screened.

</details>

---

## Decisions that will look wrong without their reason

Recorded properly in `TechDecisions.md`; flagged here because each is
something a fresh session would plausibly "fix" and thereby break.

- **Do not reinstall `next-themes`.** This Next version doesn't execute
  React-rendered `<script>` tags — the exact mechanism it relies on. It
  fails silently, not loudly. Theme handling is hand-rolled per the
  framework's own guide. *(TechDecisions §9)*

- **Do not send PDFs natively to the model.** Always extract text first.
  GPT-OSS-20B has no vision, so a multimodal path would leave the
  open-weight fallback unable to screen anything — a failure that only
  appears when the fallback is actually needed. *(TechDecisions §7)*

- **Extraction never marks anything must-have.** Everything arrives
  "Preferred" and the admin decides. The real CA JD calls Tally
  "mandatory" but never uses that word for the CA qualification — reading
  it either way reorders the shortlist entirely. That ambiguity is the
  whole reason the step exists. *(FR-15, PN-001 §1)*

- **Pinned model versions, not `-latest` aliases.** Aliases silently swap
  the model underneath, which breaks FR-49: every score records the model
  that produced it so two scores can be compared honestly.

- **Scores are immutable, history is append-only.** `screening`,
  `stage_event` and `jd_version` have no update or delete policy. The
  absence of the policy *is* the enforcement.

- **Fallback is never silent** (FR-86). An admin who chose one model and
  quietly got another has been misled about how candidates were judged.

- **Manual-upload candidates get a hidden placeholder email, never a real
  one.** `candidate.email` is `not null unique` per organization, but
  manual upload has no Google-verified address to put there. Identity is
  name-only by deliberate decision — don't "fix" this by prompting for a
  real email at upload time without revisiting FR-37 dedup, which assumes
  email is always real.

- **The apply page is the only public surface, and it must stay that way.**
  One posting, one unguessable link. No public index of postings, no
  browsable careers page, no candidate accounts — that line is what keeps
  the hosted form from becoming the job board Non-Goal 3 refuses.
  *(PN-002)*

- **Candidate email is not verified, and that was a decision.** Refusing a
  duplicate application (FR-95) handles the honest mistakes. Someone could
  still apply under another person's address and block them; it fails
  loudly, and OTP is the fix if it ever happens. Don't add a verification
  step without reading PN-002 Decision 3 first. *(See also the
  build-your-own-OTP analysis there: Supabase's built-in flow would mint an
  `app_user` for every candidate.)*

(The `serverExternalPackages` and middleware public-path notes moved up to
Outstanding → "Load-bearing lines a cleanup would plausibly delete".)

---

## Local setup notes

- Provider API keys are **not** environment variables. They're per
  organization, entered in Settings → Screening, encrypted into the
  database. `.env.local.example` says so in a box at the top.
- `SETTINGS_ENCRYPTION_KEY` is infrastructure, not a credential — the
  AES-256-GCM key that encrypts those provider keys. Losing it makes every
  stored key permanently unreadable.
- `GOOGLE_CLIENT_ID` is for **admin sign-in only** now — basic identity
  scopes, no Drive/Sheets/Forms. It is **not** the Gemini API key; Gemini
  keys start `AIza`, from aistudio.google.com.
- Candidates need no Google account and no account of any kind. The apply
  page takes no sign-in.
- Gitignored and must stay so: `CA Role Sample Resumes/`, `JDs/`,
  `Testing/baseline-ranking-CA-role.md`, `.env.local`, `.mcp.json`.
  The first three contain real candidates' personal data or the employer's
  identity. Verified 23 Aug 2026 that no CV has ever been committed, in any
  commit — re-check with
  `git log --all --diff-filter=A --name-only | grep -i resume` before
  publishing anything.

**Port 3000 is shared.** When the assistant verifies anything in the
browser it starts a dev server on 3000, and your own `npm run dev` then
fails with a port conflict. If it won't start and nothing looks broken,
that is why — ask for the port back.

**Running it:** `npm run dev` from `ziphyre/`. The apply page lives at
`/apply/<posting.apply_token>` — get the link from the posting page, or
`select apply_token from posting`.
