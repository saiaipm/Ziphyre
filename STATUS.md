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
| `docs/functional-specs/admin-dashboard-intake-screening.md` | What it does — FR-1 to FR-105 (Draft 7; FR-1–4, 19–29, 36, 62–65 retired) |
| `docs/tech-specs/admin-dashboard-intake-screening.md` | How it's built — schema, jobs, routes, milestones (Draft 5) |
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

**M4 — UI shell done, the actions themselves are not.** Shipped 27 Aug 2026:

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

**Next: M4 proper — the stage transitions.** Moving a candidate to
Shortlisted, On hold or Rejected; batch actions (FR-56); disposition
(FR-57/58); stage history (FR-59); reassignment between openings (FR-60).

**Why this matters more than it sounds:** nothing can currently change an
application's stage except screening's own `new → screened`. So the Home
funnel will read all-Screened forever, and the Shortlisted tile will sit at
zero, until these land. The dashboard is built; the actions that move it are
not.

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

**Supabase** (`tkfxxhmserqkeoghyjmx`, "Ziphyre AI"): 14 tables, RLS on all.
`organization`, `app_user`, `membership`, `posting`, `opening`, `jd_version`,
`requirement`, `provider_settings`, `candidate`, `application`, `screening`,
`stage_event`, `job`, `apply_attempt` — plus a private `cvs` Storage bucket.
`google_connection` and `unmatched_submission` were dropped by M3.5.

**Local data** (the demo org): 1 open posting "Finance hiring, August,
Demo" with one opening, Chartered Accountant / Hyderabad — 29 requirements,
2 marked must-have (CA qualification, Tally), 8 applications all at stage
`screened`. Seven are the real CA CVs by manual upload; one ("Sai Phani")
came through the retired Google path and keeps `source = 'form'` for
provenance.

**Providers configured**, in fallback order:

| # | Provider | Model | Key ends |
|---|---|---|---|
| 0 | OpenAI | gpt-4o-mini | ftEA |
| 1 | Google Gemini | gemini-3.5-flash-lite | FrXA |
| 2 | NVIDIA NIM | openai/gpt-oss-20b | kBBn |

---

## Outstanding

Split so a fresh session can see at a glance what still needs a human.

### Needs a decision or action

**1. Rotate three API keys.** Before Server Function argument logging was
disabled, Next.js wrote every saved key to the dev terminal in plaintext —
the OpenAI, NVIDIA and Google keys, plus a second NVIDIA key pasted inside a
code snippet. Logging is off now (`next.config.ts`), but those keys were
exposed. *The user said 27 Aug 2026 they would do this; confirm before
assuming it is done.*

**2. M4 proper — stage transitions.** The largest functional gap. Nothing can
move an application off `screened`, so the Home funnel and the Shortlisted
tile cannot change. Covers FR-56 (batch), FR-57/58 (disposition), FR-59
(history), FR-60 (reassignment).

**3. The rest of FR-66, and FR-68.** Filters over *form answers* — location,
notice period, CTC, relocation, declared experience. These need the answers
plumbed into `getApplicationsForOpening`, and they carry FR-68's obligation
to count and reveal candidates excluded for having "Not provided" in a
filtered field. The score/date/status filters that exist do not touch this.

**4. `middleware.ts` → `proxy.ts`.** This Next version deprecates the
middleware convention and warns on every boot:
`npx @next/codemod@canary middleware-to-proxy .` **The migration must carry
the public-path list forward** — `/apply`, `/api/apply` and `/api/cron`. Drop
them and intake and cron both break in production while looking fine locally.

**5. Twenty-nine requirements may be too many to mark by hand.** The CA JD
genuinely contains all of them, and some are boilerplate nobody would gate on
("Communication skills"). Deliberately *not* filtered — that would mean the
model deciding what matters, which the design refuses. If marking them proves
tedious the fix is UI (group or bulk-dismiss soft skills), never a cleverer
prompt.

**6. Tally hallucination — accepted, not fixed.** Screening credits Manu
the top-ranked candidate with Tally experience her CV never mentions, surviving two
prompt revisions. Decided 22 Aug 2026: accept as a known model limitation;
revisit only if the pattern repeats. See `TechDecisions.md` §7.

**7. A scanned-PDF fixture still does not exist.** FR-47 is proven via the
`.doc` path, but no image-only PDF has been tried. Low priority now the path
itself works.

### Deliberate deviations, recorded so they are not mistaken for oversights

**Filtering runs client-side, not in the query.** Tech spec §9 specifies
server-side. The whole list is already loaded and §15 puts the ceiling at
"several hundred applications per opening", so an array filter is instant
where a round trip per dropdown change would not be. Reasoning is in
`pipeline-filters.tsx`. Revisit if that ceiling assumption stops holding.

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
