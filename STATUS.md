# Ziphyre — Current State

**Updated:** 27 August 2026
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
| `docs/functional-specs/admin-dashboard-intake-screening.md` | What it does — FR-1 to FR-105 (Draft 8; FR-1–4, 19–29, 36, 62–65 retired) |
| `docs/tech-specs/admin-dashboard-intake-screening.md` | How it's built — schema, jobs, routes, milestones (Draft 7) |
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
- **Reassignment** (FR-60). Moved a CA-qualified candidate from the CA opening to a
  new Accounts Executive opening with a rescreen. **The rescreen used the
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
  apply page — the demo's one form application is named "Sai Phani" and
  attached `another candidate's CV file`, which is the case
  the column exists to make visible.
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

**Next: M5 — export (FR-71 – FR-75) and retention (§11).** With M4 done, a
role can now be worked end to end inside Ziphyre; what it cannot yet do is
leave. Export is the smaller job. **Retention is the one that matters**:
Ziphyre now holds the only copy of every CV it has received, and tech spec
§11 says the purge job must be tested before it ever runs in production.
Nothing else in the build deletes real people's data.

---

## M2 test result — is the ranking trustworthy?

Screened the seven real CA CVs against the CA JD with **Chartered
Accountant qualification** and **Tally** marked must-have (matching the
baseline's "treat CA as a hard gate" scenario). Compared to
`Testing/baseline-ranking-CA-role.md`:

- **Good:** ranks the top-ranked candidate first, and correctly separates her
  and the second qualified CA (the two qualified CAs) from the other five — the two
  questions the baseline document itself says matter most.
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

**Supabase** (`tkfxxhmserqkeoghyjmx`, "Ziphyre AI"): 14 tables, RLS on all,
13 migrations applied.
`organization`, `app_user`, `membership`, `posting`, `opening`, `jd_version`,
`requirement`, `provider_settings`, `candidate`, `application`, `screening`,
`stage_event`, `job`, `apply_attempt` — plus a private `cvs` Storage bucket.
`google_connection` and `unmatched_submission` were dropped by M3.5.

**Local data** (the demo org): 1 open posting "Finance hiring, August,
Demo", now with **two** openings. Chartered Accountant / Hyderabad — 29
requirements, 2 must-have (CA qualification, Tally) — holds 7
applications: 1 Shortlisted, 4 Screened, 2 Rejected. **Accounts Executive
/ Hyderabad was created 27 Aug purely to test FR-60** and holds the single
application reassigned into it. Delete it if the demo should go back to
one opening; nothing depends on it.

Of the 8 applications, seven are the real CA CVs by manual upload; one
("Sai Phani") came through the retired Google path and keeps
`source = 'form'` for provenance.

**Providers configured**, in fallback order. *Re-entered 27 Aug 2026 after
the key rotation, in a different order from before — NVIDIA is now the
primary, not OpenAI. Worth knowing before reading any provenance line.*

| # | Provider | Model | Key ends |
|---|---|---|---|
| 0 | NVIDIA NIM | openai/gpt-oss-20b | j2WZ |
| 1 | OpenAI | gpt-4o-mini | RnsA |
| 2 | Google Gemini | gemini-3.5-flash-lite | preg |

---

## Outstanding

Split so a fresh session can see at a glance what still needs a human.

### Needs a decision or action

**1. A screening's "used a fallback" note is computed against today's
provider order, so it lies after a reorder.** `getApplicationsForOpening`
in `src/lib/applications.ts` derives `usedFallback` by comparing the stored
provider against the *current* chain. The 27 Aug reorder therefore made
every 22 Aug screening — run by gpt-4o-mini, the primary at the time —
render as "Screened by GPT-4o mini after your primary provider failed".
That is false, and FR-86's whole point is that the admin is told honestly
which model judged a candidate. **Fix by recording the fact at write time**
(a `was_fallback` column set by the screening job, which already knows)
rather than deriving it at read time. Found 27 Aug while verifying M4.

**2. The rest of FR-66, and FR-68.** Filters over *form answers* — location,
notice period, CTC, relocation, declared experience. These need the answers
plumbed into `getApplicationsForOpening`, and they carry FR-68's obligation
to count and reveal candidates excluded for having "Not provided" in a
filtered field. The score/date/status filters that exist do not touch this.

**3. `middleware.ts` → `proxy.ts`.** This Next version deprecates the
middleware convention and warns on every boot:
`npx @next/codemod@canary middleware-to-proxy .` **The migration must carry
the public-path list forward** — `/apply`, `/api/apply` and `/api/cron`. Drop
them and intake and cron both break in production while looking fine locally.

**4. Twenty-nine requirements may be too many to mark by hand.** The CA JD
genuinely contains all of them, and some are boilerplate nobody would gate on
("Communication skills"). Deliberately *not* filtered — that would mean the
model deciding what matters, which the design refuses. If marking them proves
tedious the fix is UI (group or bulk-dismiss soft skills), never a cleverer
prompt.

**5. Tally hallucination — accepted, not fixed.** Screening credits Manu
the top-ranked candidate with Tally experience her CV never mentions, surviving two
prompt revisions. Decided 22 Aug 2026: accept as a known model limitation;
revisit only if the pattern repeats. See `TechDecisions.md` §7.

**6. A scanned-PDF fixture still does not exist.** FR-47 is proven via the
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

**Running it:** `npm run dev` from `ziphyre/`. The apply page lives at
`/apply/<posting.apply_token>` — get the link from the posting page, or
`select apply_token from posting`.
