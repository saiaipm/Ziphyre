# Ziphyre — Tech Decisions

**Status:** Draft 1 · 16 August 2026
**Occupies the slot** that `CodeContext.md` will take once code exists. Same job in the document pipeline, opposite direction: this records what we are going to build on and why; CodeContext will record what exists and where.

**Reads with:** `ProductContext.md` (product truth) · `docs/functional-specs/admin-dashboard-intake-screening.md` (the feature this stack must deliver)

**Grounding note.** There is no codebase yet, so nothing here cites a file. Every decision is instead grounded in a numbered requirement from the functional spec, written as **FR-n**. When the first implementation lands, this document is rewritten as `CodeContext.md` with real file paths.

---

## 1. What we are optimising for

The build context is one person with AI coding assistance and no infrastructure constraints. That produces four ranked priorities, and every decision below resolves in this order:

| Priority | Consequence |
|---|---|
| **1. Conventional over clever** | AI coding tools are far more reliable on mainstream, heavily-documented choices. A stack with a large training footprint is worth more here than a technically superior obscure one |
| **2. Managed over self-run** | Nothing in this build should require operational knowledge. No servers, no container orchestration, no database administration |
| **3. One language everywhere** | Context-switching costs a solo builder more than it costs a team. TypeScript from browser to background job |
| **4. Boring failure modes** | When something breaks at 11pm, it should break in a way that is obvious and searchable |

**Explicitly not optimising for:** scale beyond a few hundred applications per opening (Assumption 7 in the functional spec), sub-second latency, or multi-region anything.

---

## 2. Stack decisions

| Layer | Decision | Why |
|---|---|---|
| **Language** | TypeScript, strict mode | One language across UI, server work and jobs |
| **Framework** | Next.js, App Router | Server and client in one project. The single largest training footprint of any web framework, which matters directly for AI-assisted building |
| **Hosting** | Vercel | Zero-ops for Next.js, generous free tier, preview deploys per branch, built-in cron |
| **Database** | Supabase (Postgres) | Managed Postgres with row-level security, auth and file storage in one service. Postgres is the most conventional possible choice; RLS gives multi-tenancy without hand-rolling it |
| **Auth** | Supabase Auth, Google sign-in | The admin signs in with Google anyway — the same account we need for Forms and Drive access |
| **File storage** | Supabase Storage | Working copy of every CV, whichever way it arrived (**FR-31**, **FR-32**). Form uploads also remain in the admin's Drive — two copies, different owners |
| **Client data** | TanStack Query | Standard for server-state in React. Handles the refresh behaviour **FR-30** needs |
| **UI** | Tailwind CSS + shadcn/ui | shadcn components are copied into the repo rather than imported, so AI tools can read and modify them directly |
| **Validation** | Zod | One schema definition reused for form validation, structured AI output, and export shaping |
| **AI access** | Vercel AI SDK | Provider-agnostic interface covering Claude, Gemini and OpenAI — exactly the three **FR-81** requires — with structured-output support |
| **Spreadsheet export** | SheetJS | CSV and Excel from one library (**FR-71**) |
| **Document export** | React-PDF | PDF generated from React components, so the export layout is written the same way as the UI (**FR-72**) |

**Version policy.** Pin exact versions at install; do not float. Do not assume the versions in any AI-generated code sample are current — check at install time and pin what you actually get.

---

## 3. Data model

Ten tables. This is the part worth getting right before any code is written; everything else can be refactored cheaply.

### Core entities

```
organization                   (the business — profile, timezone, currency)
  └── membership               (user ↔ organization, carries role)
  └── google_connection        (one per organization)
  └── posting                  (many)
        └── opening            (many per posting)
              └── requirement  (many per opening)
              └── application  (many per opening)
                    └── screening        (append-only, many per application)
                    └── stage_event      (append-only, many per application)
  └── candidate                (many, deduplicated by verified email)
```

### Table notes

| Table | Key fields | Rules |
|---|---|---|
| `organization` | display name, legal name, website, industry, size band, primary location, timezone, currency, logo | The business itself. Every other table carries `organization_id`. No exceptions. Timezone and currency are load-bearing: CTC fields and every displayed date read from them |
| `membership` | organization_id, user_id, role, status, invited_by | Users belong to organizations here, not through a column on the user. `role` is constrained to `admin` in this build and widens when the permission layer lands — no table changes needed then |
| `google_connection` | account email, granted scopes, token material | One per organization (**FR-1**). Token material encrypted, never returned to the browser |
| `posting` | name, status (open/closed), connected form reference | Closing sets status only; nothing is deleted (**FR-10**, **FR-11**) |
| `opening` | title, work location, current JD version | Belongs to exactly one posting |
| `jd_version` | opening_id, content, version number, created_at | **Append-only.** Editing a JD creates a new version; old versions are never modified, because scores reference them (**FR-49**) |
| `requirement` | opening_id, text, kind (`must_have` / `preferred`), sort order | Defaults to `preferred` (**FR-15**) |
| `candidate` | verified email, name | Unique on (organization_id, email). One person, many applications (**FR-37**) |
| `application` | candidate_id, opening_id, source (`form` / `manual`), form answers, CV reference, stage, screening_status | **Unique on (candidate_id, opening_id)** — this constraint is what enforces once-per-opening (**FR-36**) |
| `screening` | application_id, jd_version_id, provider, model, five component ratings, overall score, must-have result, summary, created_at | **Append-only.** Rescreening inserts a new row; the newest is shown, the history is kept. This is how **FR-50** (scores immutable) is enforced structurally rather than by discipline |
| `stage_event` | application_id, from_stage, to_stage, actor, disposition, note, created_at | **Append-only.** The pipeline's current stage is derived from the latest event. Satisfies **FR-59** |
| `job` | kind, payload, status, attempts, last_error, run_after | The work queue. See §6 |

### Modelling rules

**Rules — never break**

1. Every table carries `organization_id`. Every query filters on it. Every RLS policy checks it.
2. `screening`, `stage_event` and `jd_version` are append-only. No updates, no deletes. Immutability is a schema property, not a code convention — this is what makes **FR-50** true rather than aspirational.
3. Applications are never deleted (functional spec §11). Rejection is a stage, not a removal.
4. Form answers are stored as they arrived, unmodified. Admin corrections to Not-provided fields (**FR-34**) are stored separately from the original submission so the two are always distinguishable.

**Conventions — deviate with reason**

- `snake_case` for all database identifiers; `camelCase` in TypeScript; map at the boundary.
- Timestamps are `timestamptz`, always UTC.
- Every table gets `created_at`; mutable tables also get `updated_at`.
- Money fields (CTC) store an integer amount plus a currency code. Never a float.

### The "Not provided" distinction

**FR-33** requires that a manually added candidate's missing fields read *Not provided*, visually distinct from empty. This must be modelled, not styled: a field the candidate left blank and a field that was never asked are different facts. Store form answers as a structured record where absence of a key means "never asked" and an explicit null means "asked, not answered". **FR-68** depends on telling these apart.

---

## 4. Multi-tenancy and access control

**Decision: row-level security in the database, not permission checks in application code.**

| Aspect | Approach |
|---|---|
| Isolation | Every policy checks `organization_id` against the organizations the signed-in user has an active membership in |
| Roles in v1 | One: Admin, held through `membership`. Both Meera and Rahul hold it (functional spec §10) |
| Organization creation | Only through the seed-admin email on first sign-in. A signed-in user with no membership sees a no-access screen — signing in never creates an organization for an arbitrary person |
| Invites | Modelled, not built. `membership` carries `role`, `status`, `invited_by`, `invited_at` so the permission layer adds a flow rather than a migration |
| Candidate access | None. There is no candidate-facing surface in this build, so no policy grants any anonymous read |
| Service access | Background jobs run with elevated access and must filter by `organization_id` explicitly — RLS does not protect them |

**Rule.** The elevated-access client is used only in background jobs and never in anything that renders a page. A single leak of that client into request-handling code removes tenant isolation product-wide.

**Why RLS rather than application checks:** a solo builder with AI assistance will write hundreds of queries. Any one of them can forget a `WHERE organization_id = ...`. The database forgetting is much less likely than the code forgetting.

---

## 5. Google integration

Three separate concerns, often conflated.

### 5.1 Connecting the account (FR-1, FR-2, FR-26)

Google sign-in through Supabase Auth, requesting read access to Forms, Sheets and Drive at connection time.

- **Read-only scopes only.** **FR-63** says Ziphyre never writes to the response sheet — the cleanest way to guarantee that is to never hold write permission. If the scope isn't granted, the failure mode is impossible rather than merely avoided.
- Refresh token stored encrypted, never sent to the browser.
- **FR-4** (lost access) is detected on token refresh failure and surfaces as the banner specified in functional spec §8.

### 5.2 Detecting new submissions (FR-30)

**Decision: poll the response sheet on a schedule.**

**FR-30** requires submissions to appear "within a couple of minutes" without manual action, and non-functional expectations set the same bar. Polling every 60–120 seconds meets that comfortably.

| Alternative | Why rejected |
|---|---|
| Apps Script trigger posting to a webhook | Requires the admin to install a script in their own account. Fragile, hard to support, and a setup step in a flow already carrying template-copying |
| Forms API watches with Pub/Sub | Genuinely event-driven, but adds a messaging service and a subscription lifecycle to maintain. Real-time is not a requirement |

**Poll design.** Track the last-seen row per posting. Read only rows after it. A row that fails to import is recorded as failed and skipped rather than blocking the ones behind it. Because **FR-64** requires edits at source to be reflected, a periodic full re-read is also needed — a slower sweep, not every cycle.

### 5.3 Reading CV files (FR-61, FR-62)

**Every CV exists in two places, by design.**

| Copy | Owner | Purpose | Lifespan |
|---|---|---|---|
| **Drive** | The admin | Google Forms puts it there on upload — their record, in their account | Until they delete it. Our scope is read-only, so we cannot remove it |
| **Supabase Storage** | Ziphyre | The working copy: what screening reads and what the CV pane displays | Deleted on the retention schedule in §8 |

We copy the file in at intake and read from our own copy thereafter, keeping the Drive reference for the "open the original" link **FR-62** requires.

**Why keep our own copy rather than reference Drive:**

| Reason | Detail |
|---|---|
| Durability | A referenced CV becomes unreadable if the admin deletes it, moves it, revokes access, or leaves the company — leaving a candidate in the pipeline whose CV cannot be opened |
| One path, not two | Manual uploads (**FR-31**) have no Drive file. Referencing would mean two storage models and two failure modes for the same thing |
| Degradation | With our own copy, a Drive outage degrades nothing. Functional spec §9 only requires the assessment to survive; this is better |
| Screening reliability | Job retries must not fail for a reason we cannot fix |
| Provenance | Our copy is a point-in-time snapshot of what was actually screened, even if the admin later replaces the Drive file |

**Asymmetry to know:** manual uploads exist only in Supabase. We hold read-only Drive scope deliberately — write access would weaken the **FR-63** guarantee — so we cannot place a copy in the admin's Drive.

**The cost:** we are custodians of candidates' CVs, not borrowers. That is why the retention rule in §8 is not optional.

---

## 6. Background work

Screening cannot run inside a web request. It takes tens of seconds, it must retry, and **FR-38** says it starts on its own.

**Decision: a `job` table polled by a scheduled function.**

```
job kinds:
  import_submissions   — poll one posting's sheet
  screen_application   — run screening for one application
  rescreen_opening     — fan out to one screen_application per application
  build_export         — generate a large export with CV files
```

| Property | Approach |
|---|---|
| Scheduling | Vercel Cron triggers a runner every minute |
| Claiming | A job is claimed atomically so two runs can't process it twice |
| Retries | Exponential backoff, capped attempts. On final failure the application is flagged Needs manual review (**FR-47**) with the reason recorded |
| Visibility | `last_error` is stored in plain language, because it becomes the text the admin reads |

| Alternative | Why rejected |
|---|---|
| Inngest or Trigger.dev | Better ergonomics and observability, but another service, another account, another failure surface for a solo builder |
| Fire-and-forget from the request | No retries, no visibility, lost work on deploy. Fails **FR-47** outright |

**Gotcha to design around now:** serverless functions have execution time limits. One job must be one application, never a whole opening. `rescreen_opening` fans out rather than looping — otherwise rescreening forty candidates times out halfway and leaves the pipeline in an unknown state.

---

## 7. The screening pipeline

The heart of the product. Five stages per application.

```
1. Fetch the CV          Drive or Storage
2. Extract content       PDF/DOCX → text, or pass the document to the model directly
3. Assemble the prompt   JD version + requirement list + form answers + CV
4. Call the provider     structured output, schema-validated
5. Persist               one new screening row, never an update
```

### Content extraction

**Decision: pass the document to the model directly where the provider supports it; fall back to text extraction.**

Claude and Gemini both accept PDFs natively and read layout — which matters, because CVs are layout-heavy documents and text extraction flattens two-column resumes into nonsense. Fall back to text extraction for DOC/DOCX and for providers without document support.

**Detecting an unscreenable CV (FR-47).** A PDF that yields almost no extractable text is a scanned image. This check must run *before* the provider call, so the failure is cheap and its reason is specific — "we couldn't read this file, it may be a scanned image" rather than a generic model error. All seven current test CVs parse cleanly, so this path needs the deliberately awkward file the functional spec's rollout plan calls for.

### Structured output

**Rule.** The provider is asked for structured output matching a Zod schema, and the result is validated before it is stored. A screening that fails validation is a job failure and retries; it is never partially saved.

The schema covers: five component ratings (0–10), a per-must-have verdict with the requirement it refers to, strengths, gaps, an overall read, and any declared-versus-evidenced experience discrepancy (**FR-46**).

**The overall score is computed in our code, not asked of the model.** **FR-41** defines it as the equal-weighted average of five components. Arithmetic belongs in code — asking a model to average five numbers introduces error for no benefit, and it makes **FR-42** (weighting always stated) verifiable rather than trusted.

### Provider abstraction

BYOK across Claude, Gemini and OpenAI (**FR-81**). The AI SDK covers all three behind one interface.

- **Default: Claude Sonnet 5** (`claude-sonnet-5`) — the quality/cost balance suits per-application screening. `claude-opus-5` is the option where judgement quality matters more than cost.
- Provider and model are recorded on every screening row (**FR-49**), because scores from different models are not comparable and the product must not pretend otherwise.
- **FR-82**: switching provider never triggers a rescreen.

### Prompt versioning

Not in the functional spec, but necessary: the prompt is as much an input to a score as the JD is. Record a prompt version alongside provider and model. Without it, improving the prompt silently makes old and new scores incomparable — the exact problem **FR-49** exists to prevent, arriving through a door nobody watched.

---

## 8. Secrets and sensitive data

Two categories, different handling.

### Customer API keys (FR-81)

| Rule | Detail |
|---|---|
| Encrypted at rest | Never stored in plain text |
| Never returned to the browser | The settings screen shows a masked hint only, never the key |
| Never logged | Not in errors, not in job payloads, not in traces |
| Validated on save | A key that doesn't work should fail at settings time, not silently at 2am when an application arrives |

### Candidate personal data

CVs, salary expectations, contact details, and assessments of people who never became customers.

| Concern | Decision |
|---|---|
| Storage | A working copy of every CV in Storage, organization-scoped. Form uploads also remain in the admin's own Drive (§5.3) |
| Access | RLS-scoped to the organization. No cross-organization read is possible |
| Sent to the provider | CV content and form answers, under the customer's own key. This is exactly why **FR-81** offers provider choice — the customer decides who processes their applicants' data |
| Exports | Leave our control on download (**FR-75**). The marker is the only control available and must be present |
| Retention | **Six months after the posting closes**, Ziphyre permanently deletes the CV and the candidate's personal data. See below |

---

### Retention rule

| Aspect | Decision |
|---|---|
| **Period** | Six months |
| **Clock starts** | When the posting closes. An open posting retains indefinitely — the role is still live |
| **What is deleted** | The CV file in Storage, and the candidate's personal data: name, email, phone, location, CTC figures, and the assessment text |
| **What survives** | The application row with its scores, stage and disposition, stripped of identity. The customer keeps a record that a role received forty applicants and how they scored, without holding forty people's personal data |
| **Warning** | The admin is notified 30 days before a posting's data expires, with the option to export first |
| **Scope of the promise** | Governs Ziphyre's copy only. The admin's Drive copies remain in their own Google account. Any candidate-facing wording must say "deleted from Ziphyre", never "deleted everywhere" |

**Two consequences worth naming.**

The talent-pool capability in ProductContext Roadmap Theme B — re-engaging good candidates from previous roles — cannot reach anyone whose posting closed more than six months ago. That is a real product cost of the promise, and the right trade, but it should be a known one rather than a surprise discovered later.

There is no candidate-initiated deletion route, because no candidate-facing surface exists in this build. When Pillar 6 arrives, this rule needs revisiting.

---

## 9. Rendering and data fetching

| Surface | Rendering | Why |
|---|---|---|
| Marketing / signed-out | Static | No personalisation |
| Home overview | Server-rendered per request | Counts must be current (**FR-77**); caching them makes Rahul's glance untrustworthy |
| Pipeline | Server-rendered shell, client-side data | Filtering and sorting (**FR-66**–**FR-70**) are interactive; the data is organization-private so nothing is cached at the edge |
| Candidate review | Client, within the pipeline | **FR-61** requires no navigation away |
| Settings | Server-rendered | Rarely visited, never cached |

**Conventions**

- Server components by default. `'use client'` only where interactivity genuinely requires it — filters, selection, stage actions, the CV pane.
- TanStack Query owns all client-side server-state. No manual fetch-and-store-in-state.
- **Rule:** a server-prefetched query key and its client hook key must be identical, or the client refetches immediately and the prefetch is wasted. Define keys in one shared place so the two cannot drift.
- One hook per resource: `useApplications`, `useOpening`, `useRequirements`. Consistent shape.

**Nothing organization-scoped is cached at the CDN.** Candidate data is private, per-organization, and changes constantly. Caching it is the failure mode where one customer sees another's pipeline.

### Gotcha: this Next.js version cannot use next-themes (or similar script-injection libraries)

**Rule — do not reinstall `next-themes`, or reach for any library that prevents flash-of-wrong-content by rendering a `<script>` tag from a React component.**

This Next.js version's own shipped documentation (`node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md`) states plainly that scripts rendered by a React component do not execute on the client — the exact mechanism `next-themes`' `ThemeProvider` depends on to set the theme before first paint. Installing it produces no build error. It fails silently: a console warning, an intermittent-looking hydration issue, and — because of how React's Strict Mode dev remount clears attributes it doesn't manage from JSX — behavior that looks like a flaky UI bug rather than a fundamentally incompatible dependency. Diagnosing it cost real time; it should cost nothing for whoever hits this next.

**The correct pattern for this Next version**, used for dark mode (`src/lib/theme-script.ts`, `src/app/layout.tsx`, `src/components/shell/theme-toggle.tsx`):

1. A real inline `<script>` element, written directly in the root layout's `<head>` via `dangerouslySetInnerHTML` — not rendered as a side effect of a component mounting. It runs synchronously during HTML parsing, before React is involved at all.
2. State is read from `localStorage` with a lazy `useState` initializer, so React's first render already agrees with what the script painted.
3. Anything that must survive a dev-mode Strict Mode remount is re-applied in a `useLayoutEffect`, per the same guide's "Re-applying attributes in development" section.

**How to apply this rule to other flash-of-wrong-content problems** (locale formatting, persisted UI state, anything reading `localStorage` before paint): follow the same three-step pattern rather than reaching for a convenience library that predates this Next.js version's behavior. Check `node_modules/next/dist/docs/` for the relevant guide before writing the code — this is exactly what `ziphyre/AGENTS.md` already instructs, and this gotcha is the reason that instruction is there.

---

## 10. Exports

**Decision: generate on demand; stream where possible.**

| Format | Approach |
|---|---|
| CSV / Excel | Generated in-request. Fast enough at a few hundred rows |
| PDF | Generated in-request from React components, in the order shown on screen (**FR-72**) |
| With CV files | Queued as a `build_export` job — bundling files is too slow for a request, and the size is unpredictable |

Every export carries the internal-use marker (**FR-75**) — a header row in spreadsheets, a footer on every PDF page.

---

## 11. Environments and deploy

| Environment | Purpose |
|---|---|
| Local | Supabase local stack; a separate Google project so test connections never touch a real account |
| Preview | Automatic per branch on Vercel, pointed at a staging Supabase project. **Never at production data** — this is real candidates' personal information |
| Production | Main branch |

**Migrations.** Supabase migrations, timestamp-prefixed, applied in order.

**Rule — never modify a migration that has been applied anywhere.** Roll forward with a new one. A modified migration produces environments that disagree about the schema and cannot be reconciled.

**On push:** type check, lint, build. All must pass before deploy.

**Environment variables** are set per environment in Vercel. Nothing secret is ever prefixed for browser exposure — that prefix makes a value public, and it is the most common way an AI-assisted build leaks a key.

---

## 12. Testing and observability

### Testing

Proportionate to a solo build. Test what is expensive to get wrong:

| Tested | Why |
|---|---|
| Score computation | **FR-41** is arithmetic with a correctness answer |
| Must-have evaluation | **FR-43** determines what Meera sees first |
| Deduplication | **FR-36** — the constraint that stops duplicate candidates |
| Unscreenable detection | **FR-47** — the path most likely to be silently wrong |
| Filter behaviour with Not-provided values | **FR-68** — where candidates disappear silently |
| Export contents | **FR-71**–**FR-73** — what leaves the building |

**Deliberately not tested:** component rendering, provider responses (mocked at the boundary), and anything requiring live Google services.

**The real test of screening quality is not a unit test.** It is the seven CA CVs run against `Testing/baseline-ranking-CA-role.md`. Keep that as a repeatable exercise, not a one-off.

### Observability — a flagged decision

You've ruled out analytics for v1, and the functional spec now says so. **Error monitoring is a different thing**, and worth deciding separately.

| Category | Status |
|---|---|
| Product analytics — how the product is used | **Excluded.** Your decision, recorded in functional spec §12 |
| Error monitoring — when it breaks and why | **Recommended.** Without it, a failing screening job is invisible until someone notices a candidate stuck at New |

The recommendation is minimal: uncaught errors and job failures only, no user behaviour, no session recording. If you'd rather have nothing at all, `job.last_error` and Vercel's logs are the fallback — thinner, but workable at this scale. **Your call.**

---

## 13. Decisions deferred

Not needed for this build; listed so they aren't re-litigated as though they were forgotten.

| Deferred | Revisit when |
|---|---|
| Candidate-facing surfaces | Pillar 6 is built |
| Email sending | Outreach enters scope |
| Multiple roles and permissions | ProductContext §7 roles are built |
| Ziphyre creating the Google Form itself | Next build — it removes the template-copy and dropdown-sync steps entirely |
| Full-text search across candidates | Filtering covers current needs |
| Rate limiting | No public surface exists to abuse |

---

## 14. Assumptions to confirm

1. **Supabase over the Google-native equivalent.** Firebase and Cloud SQL would keep everything in one vendor, but Postgres with RLS is more conventional, more portable, and better represented in AI training data. Chosen on merit; flag if vendor consolidation matters to you.
2. **Polling rather than event-driven submission detection.** Correct for a two-minute freshness bar. Wrong if you later want near-instant.
3. **We keep our own copy of every CV** rather than referencing Drive, so nothing breaks when a file moves or access is revoked. The trade is custodial responsibility, answered by the six-month retention rule in §8.
4. **A few hundred applications per opening** is the design ceiling (functional spec Assumption 7). Thousands would change the pipeline and export decisions.
5. **Prompt versioning** is my addition, not in the functional spec. It closes a real comparability hole, but it's a decision you should see rather than inherit.
6. **Error monitoring** — flagged in §12, needs your answer.

---

## 15. Open questions

1. **Google account changes hands.** If Meera leaves and Rahul reconnects with his own account, do the existing postings still reach their forms?

---

## 16. What becomes CodeContext.md

Once the first implementation exists, this document is rewritten as `CodeContext.md`, grounded in real files. The sections that carry over, and what changes:

| This document | Becomes |
|---|---|
| §2 Stack decisions | Tech Stack Detail — with installed versions and config file paths |
| §3 Data model | Data Layer — with migration filenames and RLS policy examples |
| §4 Multi-tenancy | Auth & Permissions — with the actual client rules |
| §6–7 Jobs and screening | Extension points, with canonical files to copy from |
| §9 Rendering | Routing & Rendering, with per-route decisions |
| §9 next-themes gotcha | First entry in the Non-Obvious Gotchas list |
| Everything | A Canonical File Index and the rest of the Non-Obvious Gotchas list — neither can be written before the gotchas have been hit |

---

## 17. Change log

| Version | Date | Change |
|---|---|---|
| Draft 4 | 21 Aug 2026 | Recorded a real framework gotcha, discovered building the M0 dark-mode toggle: this Next.js version cannot run `next-themes` (or any script-injection-based flash-prevention library) because its own docs say React-rendered `<script>` tags don't execute on the client. Added to §9 with the correct pattern — a real inline script in the root layout's `<head>`, per the framework's own guide — and flagged in §16 as the first entry the eventual Non-Obvious Gotchas list inherits |
| Draft 3 | 16 Aug 2026 | Workspace renamed Organization and given a profile — legal name, website, industry, size, location, timezone, currency, logo. Timezone and currency flagged as load-bearing for CTC and dates. Membership introduced so users belong to organizations through a join carrying role and invite state; role constrained to `admin` until the permission layer lands. Organization creation restricted to a seed-admin email; no membership means no access. Closes the organization-creation open question |
| Draft 2 | 16 Aug 2026 | CV storage revised: Ziphyre keeps a working copy of every CV in Storage while form uploads also remain in the admin's Drive — two copies, different owners, different lifespans. Retention set at six months from posting close, deleting the CV and personal data while retaining anonymised scores, with a 30-day warning. Closes the retention open question |
| Draft 1 | 16 Aug 2026 | First tech decisions document. Written in place of `CodeContext.md`, which cannot exist before code does. Stack chosen for a solo builder using AI coding tools, with no infrastructure constraints. Two additions beyond the functional spec, both flagged: prompt versioning for score comparability, and a recommendation on error monitoring as distinct from the excluded product analytics |
