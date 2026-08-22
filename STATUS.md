# Ziphyre — Current State

**Updated:** 22 August 2026
**Purpose:** Session handoff. Where the build actually is, what's next, and
what's outstanding. Everything durable lives in the documents below — this
file is deliberately just the moving parts.

---

## Read these first

| Document | What it is |
|---|---|
| `ProductContext.md` | Product truth — personas, pillars, principles, glossary |
| `TechDecisions.md` | Stack truth and the *why* behind it. Stands in for `CodeContext.md` until there's enough code to write that properly |
| `ProductNotes/PN-001-…md` | The feature ask |
| `docs/functional-specs/admin-dashboard-intake-screening.md` | What it does — FR-1 to FR-86 |
| `docs/tech-specs/admin-dashboard-intake-screening.md` | How it's built — schema, jobs, routes, milestones |
| `Testing/README.md` | Why the baseline file is gitignored, and what it's for |

**Read `ziphyre/AGENTS.md` before writing code.** This Next.js version has
breaking changes from training data; check `node_modules/next/dist/docs/`
rather than assuming. Two real bugs this session came from ignoring that.

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

**Next: M3 — Google.** Connection, form matching, the import job, the
unmatched-submission queue. First real submission reaching the pipeline
unaided.

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
  manual upload has no "declared experience" to diff against, so FR-46 as
  built only fires once form-submitted applications exist (M3).

---

## Verified state, 22 Aug 2026

**Git:** on `feature/m1-postings-openings`, tracking `origin/feature/m1-postings-openings`,
in sync as of the last commit. M2's changes (below) are uncommitted as of this
writing.

**Supabase** (`tkfxxhmserqkeoghyjmx`, "Ziphyre AI"): 13 tables, RLS on all.
`organization`, `app_user`, `membership`, `posting`, `opening`, `jd_version`,
`requirement`, `provider_settings`, `candidate`, `application`, `screening`,
`stage_event`, `job` — plus a private `cvs` Storage bucket.

**Providers configured**, in fallback order:

| # | Provider | Model | Key ends |
|---|---|---|---|
| 0 | OpenAI | gpt-4o-mini | ftEA |
| 1 | Google Gemini | gemini-3.5-flash-lite | FrXA |
| 2 | NVIDIA NIM | openai/gpt-oss-20b | kBBn |

---

## Outstanding

**1. Rotate three API keys — do this first.**
Before I disabled Server Function argument logging, Next.js wrote every
saved key to the dev terminal in plaintext: the OpenAI, NVIDIA and Google
keys, plus a second NVIDIA key pasted inside a full code snippet. The
logging is off now (`next.config.ts`), but those keys were exposed.

**2. ~~GPT-4o mini is not primary yet~~ — Done.**
Confirmed in Supabase 22 Aug 2026: `openai/gpt-4o-mini` is priority 0,
Gemini 3.5 Flash-Lite is priority 1. No further action.

**3. `middleware.ts` → `proxy.ts`.**
This Next version deprecates the middleware convention and logs a warning on
every boot. Codemod: `npx @next/codemod@canary middleware-to-proxy .`
Not urgent, doesn't block M2.

**4. Twenty-nine requirements may be too many to mark by hand.**
The CA JD genuinely contains all of them, and some are boilerplate nobody
would gate on ("Communication skills"). Deliberately *not* filtered —
that would mean the model deciding what matters, which the design refuses.
If marking them proves tedious, the fix is UI (group or bulk-dismiss soft
skills), never a cleverer prompt.

**5. ~~FR-47 has no test fixture~~ — Resolved in M2.**
A legacy `.doc` upload has no maintained pure-JS extractor, so it's routed
straight to Needs manual review with its own reason. Verified in the
browser with a synthetic `.doc` file. All seven real CA CVs are PDFs and
parse cleanly, so a scanned/photographed PDF still hasn't been tried — lower
priority now that the path itself is proven.

**6. ~~Branch not pushed~~ — was already pushed; this was stale.**
`git branch -vv` shows `origin/feature/m1-postings-openings` tracked and in
sync as of commit `8dfbe22`. M2's work (this session) is uncommitted — commit
and push it when ready.

**7. Tally-hallucination on the top-ranked candidate is still open.**
Screening (`gpt-4o-mini`) credits her with Tally experience her CV never
mentions, despite an explicit "quote or closely paraphrase the CV"
instruction surviving two prompt revisions. See "M2 test result" above and
`TechDecisions.md` §7. Not chased further this session — flagging for a
product decision: accept as a known model limitation an admin should
spot-check, or add a require-a-CV-quote structural fix later.

**8. `next.config.ts` needs `serverExternalPackages` for pdf-parse.**
Already fixed (`["pdf-parse", "pdfjs-dist"]`) — noted here because it's the
kind of line a config cleanup could plausibly delete without knowing why.
Removing it brings back "Setting up fake worker failed" on every PDF.

**9. Auth middleware now excludes `/api/cron`.**
Already fixed — noted because a future middleware→proxy.ts migration (see
#3 below) must carry this exclusion forward, or cron silently stops working
in production while looking fine locally.

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

- **`pdf-parse`/`pdfjs-dist` must stay in `serverExternalPackages`.**
  Removing it from `next.config.ts` breaks PDF text extraction silently at
  the bundler level, not the code level — see Outstanding #8.

- **`/api/cron` must stay out of the auth middleware's gate.** It has no
  user session to check; its own `CRON_SECRET` is the only guard. See
  Outstanding #9.

---

## Local setup notes

- Provider API keys are **not** environment variables. They're per
  organization, entered in Settings → Screening, encrypted into the
  database. `.env.local.example` says so in a box at the top.
- `SETTINGS_ENCRYPTION_KEY` is infrastructure, not a credential — the
  AES-256-GCM key that encrypts those provider keys. Losing it makes every
  stored key permanently unreadable.
- `GOOGLE_CLIENT_ID` is for sign-in and Forms/Sheets/Drive access. It is
  **not** the Gemini API key. Gemini keys start `AIza`, from
  aistudio.google.com.
- Gitignored and must stay so: `CA Role Sample Resumes/`, `JDs/`,
  `Testing/baseline-ranking-CA-role.md`, `.env.local`, `.mcp.json`.
  The first three contain real candidates' personal data or the employer's
  identity.
