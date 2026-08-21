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

**Done: M0 (foundations) and M1 (postings, openings, JD, requirements).**

Working and verified in the browser, not just typechecked:

- Google sign-in, organization bootstrap via `SEED_ADMIN_EMAIL`, membership
- Organization settings (read + write, through RLS)
- Dark mode with a Light/Dark/System toggle in the account menu
- Postings and openings: create, edit, close, reopen, delete
- JD attachment with append-only versioning (editing creates v2, never
  overwrites v1)
- **Requirement extraction against the real CA job description** — produced
  30 discrete, individually markable requirements, compound bullets split
  correctly, nothing pre-marked must-have
- BYOK provider settings with multi-provider fallback

**Next: M2 — screening.** CV upload, text extraction, scoring the seven CA
candidates against `Testing/baseline-ranking-CA-role.md`. Per the tech spec
this needs no Google integration at all: manual upload exercises the whole
screening path, so the riskiest question in the product gets answered before
M3 is built.

---

## Verified state, 22 Aug 2026

**Git:** on `feature/m1-postings-openings`, working tree clean, 5 commits.
**Not yet pushed** — no upstream set on this branch.

**Supabase** (`tkfxxhmserqkeoghyjmx`, "Ziphyre AI"): 8 tables, RLS on all.
`organization`, `app_user`, `membership`, `posting`, `opening`, `jd_version`,
`requirement`, `provider_settings`.

**Providers configured**, in fallback order:

| # | Provider | Model | Key ends |
|---|---|---|---|
| 0 | Google Gemini | gemini-3.5-flash-lite | FrXA |
| 1 | OpenAI | gpt-4o-mini | ftEA |
| 2 | NVIDIA NIM | openai/gpt-oss-20b | kBBn |

---

## Outstanding

**1. Rotate three API keys — do this first.**
Before I disabled Server Function argument logging, Next.js wrote every
saved key to the dev terminal in plaintext: the OpenAI, NVIDIA and Google
keys, plus a second NVIDIA key pasted inside a full code snippet. The
logging is off now (`next.config.ts`), but those keys were exposed.

**2. GPT-4o mini is not primary yet.**
You asked for it as the default on cost. It's currently at position 1;
Gemini 3.5 Flash-Lite is at 0. Move it up in Settings → Screening. This is
data, not code — no change needed.

**3. `middleware.ts` → `proxy.ts`.**
This Next version deprecates the middleware convention and logs a warning on
every boot. Codemod: `npx @next/codemod@canary middleware-to-proxy .`
Not urgent, doesn't block M2.

**4. Thirty requirements may be too many to mark by hand.**
The CA JD genuinely contains all thirty, and some are boilerplate nobody
would gate on ("Communication skills"). Deliberately *not* filtered —
that would mean the model deciding what matters, which the design refuses.
If marking them proves tedious, the fix is UI (group or bulk-dismiss soft
skills), never a cleverer prompt.

**5. FR-47 has no test fixture.**
All seven CA CVs parse cleanly as text, so the "unscreenable CV" path can't
be exercised. Needs a deliberately awkward file — a photographed or scanned
CV — before that requirement can be verified.

**6. Branch not pushed.** `git push -u origin feature/m1-postings-openings`

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
