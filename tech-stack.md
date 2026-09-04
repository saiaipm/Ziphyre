# Ziphyre — Tech Stack

**For rehearsal.** Scannable answers to "what's it built on?" and the
follow-ups. The *why* behind each choice lives in `TechDecisions.md`;
this is the one-page version.

**One line:** A Next.js app on Vercel, with Supabase (Postgres) for
data, auth and file storage, a Postgres-backed job queue for screening,
and a swappable set of LLM providers the customer supplies keys for.

---

## Framework & runtime

- **Next.js 16.3.1** (App Router, Server Components, Server Actions)
- **React 19.2.8**, **TypeScript 5**
- **Turbopack** for dev and build
- Rendering is **fully dynamic** — every route is server-rendered per
  request, because everything is scoped to the signed-in organization

## Frontend

- **Tailwind CSS 4** + **shadcn/ui** on **Radix UI** primitives
- **lucide-react** icons, **Sonner** for toasts
- **Dark mode is hand-rolled**, not `next-themes` — this Next version
  doesn't execute React-rendered `<script>` tags, which is the exact
  mechanism that library depends on. (`next-themes` is still installed
  because shadcn's Sonner wrapper imports its `useTheme`.)

## Data, auth & storage — Supabase

- **Postgres**, 17 tables, **Row Level Security on every one**
- **Supabase Auth** with **Google sign-in** — admins only. Basic
  identity scopes, no Drive/Sheets/Calendar
- **Candidates never authenticate.** No account, no password, no OTP
- **Private `cvs` storage bucket**; CVs are served through short-lived
  signed URLs (5 minutes), never public links
- Multi-tenancy is enforced in the database, not the application layer

## AI / screening

- **Vercel AI SDK** (`ai` v7) as the single interface to every model
- **Three providers, in a fallback chain** — OpenAI (`gpt-4o-mini`),
  Google Gemini (`gemini-3.5-flash-lite`), NVIDIA NIM
  (`openai/gpt-oss-20b`, via an OpenAI-compatible endpoint)
- **BYOK** — the customer enters their own API keys in Settings. Keys
  are **AES-256-GCM encrypted** into the database, never environment
  variables
- **Model versions are pinned, never `-latest`** — an alias silently
  swapping the model would break the promise that two scores are
  comparable
- **Text-in only.** CVs are parsed to text before the model sees them,
  so the open-weight fallback can still screen when it is needed
- Calls **time out at 25s and fail over** to the next provider

## Background jobs

- **Custom queue in Postgres** — no Redis, no external broker
- Atomic claiming via a `FOR UPDATE SKIP LOCKED` function, so two
  workers can never take the same job
- Retries with backoff; a stuck job is reclaimed after 10 minutes
- Triggered two ways: eagerly after a request via Next's `after()`,
  and by **Vercel Cron** as the backstop

## Documents

- **CV parsing** — `pdf-parse`/`pdfjs-dist` for PDF, `mammoth` for
  DOCX. Unreadable files go to "needs manual review", never a score
- **Exports** — `exceljs` (real workbooks, numbers as numbers),
  `@react-pdf/renderer` (PDF), `jszip` (CV bundles), CSV with a UTF-8
  BOM so Excel on Windows renders "₹" correctly

## Email

- **SMTP via nodemailer** — deliberately *not* OAuth. `gmail.send` is a
  restricted Google scope, and one sensitive scope re-gates the whole
  consent screen including admin sign-in
- Credentials are **proven against the mail server before being saved**
- Templates are stored per organization and rendered by the same code
  the preview uses

## Hosting & ops

- **Vercel** (Hobby plan), region **bom1** (Mumbai), auto-deploys from
  `main`
- **`maxDuration = 60s`** on the three routes that run jobs
- **Cron runs daily** — Hobby caps cron at once per day
- Validation with **Zod** on every untrusted input

---

## The constraint worth knowing before someone asks

**Screening runs inside a web request, with a daily cron as the only
backstop.** On the Hobby plan Vercel won't run cron more often than
once a day, so anything queued with nobody using the app could wait up
to 24 hours. In practice the after-request pump handles it in seconds.

The fix is a paid plan plus moving screening to a queue that outlives
the request — a known, costed next step, not an unknown.

## Deliberate choices, with the one-line why

| Choice | Why |
|---|---|
| Postgres job queue, not Redis/SQS | One dependency instead of two; the volume doesn't justify a broker |
| BYOK, encrypted per organization | The customer owns their AI spend and their data relationship |
| Pinned model versions | A silently swapped model makes two scores incomparable |
| SMTP, not Gmail OAuth | Avoids a restricted scope that would gate admin sign-in too |
| RLS in the database | A tenant boundary the application layer cannot accidentally bypass |
| No candidate accounts | A password to check "am I rejected yet?" kills adoption |
| Text extraction before the model | Keeps the open-weight fallback usable; it has no vision |
| Hand-rolled dark mode | The standard library fails silently on this Next version |

---

**Deeper reading:** `TechDecisions.md` (the reasoning and the
alternatives rejected), `docs/tech-specs/` (schema, jobs, routes).
