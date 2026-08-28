# Tech Spec — Screening Desk

**Implements:** `docs/functional-specs/admin-dashboard-intake-screening.md` (Draft 6)
**Built on:** `TechDecisions.md` (Draft 7), `ProductNotes/PN-002-native-application-form.md`
**Status:** Draft 6 · 27 August 2026

Requirement references are **FR-n** from the functional spec. Where this document decides something the functional spec left open, it is marked **[new decision]**.

---

## 1. Shape of the system

Three moving parts. Everything else is UI over them.

```
apply page (public) ──┐
                      ├──► application row ──► screening job ──► screening row
manual upload ────────┘                                               │
                                                                      ▼
                                                          pipeline UI ──► exports
```

| Part | Runs where | Trigger |
|---|---|---|
| **Intake** | In-request | A candidate submits, or the admin uploads |
| **Screening** | Background job | Queued the moment an application row exists |
| **Pipeline** | Server-rendered shell, client-side data | User |
| **Retention** | Background job | Cron, daily |

**Nothing long-running happens inside a web request.** Screening takes tens of seconds and must retry, so it stays a job. Intake is now in-request precisely because it is cheap: validate, insert, enqueue, return. **The CV file never passes through the application server** — the browser uploads it straight to Storage against a signed URL (§5.2), so the expensive part of a submission is not ours to carry.

*Draft 5 removed a fourth part.* Intake used to be a cron-driven import job polling a Google Sheet. There is no third party in the path any more.

---

## 2. Data model

### 2.1 Tables

```sql
organization
  id                uuid pk
  name              text not null           -- display name
  legal_name        text
  website           text
  industry          text
  size_band         text                    -- '1-10','11-50','51-200','201-500','500+'
  primary_location  text
  timezone          text not null default 'Asia/Kolkata'
  currency          text not null default 'INR'
  logo_path         text
  created_at, updated_at   timestamptz

app_user
  id            uuid pk references auth.users(id)
  email         text not null
  display_name  text
  created_at    timestamptz not null default now()
  -- no organization_id: membership carries it

membership
  id               uuid pk
  organization_id  uuid not null references organization(id)
  user_id          uuid not null references app_user(id)
  role             text not null default 'admin'
                     check (role in ('admin'))   -- widens when the permission layer lands
  status           text not null default 'active'
                     check (status in ('active','invited','revoked'))
  invited_by       uuid references app_user(id)
  invited_at       timestamptz
  accepted_at      timestamptz
  created_at, updated_at
  unique (organization_id, user_id)

posting
  id                 uuid pk
  organization_id       uuid not null references organization(id)
  name               text not null
  status             text not null default 'open'
                       check (status in ('open','closed'))
  apply_token        text not null unique  -- unguessable; the public apply link
  closed_at          timestamptz
  purge_after        timestamptz          -- closed_at + 6 months
  purge_warned_at    timestamptz
  created_at, updated_at

opening
  id                     uuid pk
  organization_id           uuid not null
  posting_id             uuid not null references posting(id) on delete cascade
  title                  text not null
  work_location          text not null
  current_jd_version_id  uuid
  created_at, updated_at

jd_version                              -- APPEND ONLY
  id            uuid pk
  organization_id  uuid not null
  opening_id    uuid not null references opening(id) on delete cascade
  version       int not null
  content       text not null
  source        text check (source in ('upload','paste'))
  created_at    timestamptz not null default now()
  unique (opening_id, version)

requirement
  id            uuid pk
  organization_id  uuid not null
  opening_id    uuid not null references opening(id) on delete cascade
  text          text not null
  kind          text not null default 'preferred'
                  check (kind in ('must_have','preferred'))
  sort_order    int not null
  created_at, updated_at

candidate
  id              uuid pk
  organization_id uuid not null
  email           citext not null
  email_verified  boolean not null default false  -- always false in v1; see PN-002 §3
  full_name       text
  created_at, updated_at
  unique (organization_id, email)          -- FR-37

application
  id                        uuid pk
  organization_id              uuid not null
  opening_id                uuid not null references opening(id) on delete cascade  -- FR-84
  candidate_id              uuid not null references candidate(id)
  source                    text not null check (source in ('apply','manual','form'))
                              -- 'form' is legacy: rows imported by the retired
                              -- Google Sheet path. Kept so provenance stays honest
  form_answers              jsonb                    -- absent key = never asked
  admin_overrides           jsonb not null default '{}'   -- FR-34, kept separate
  cv_storage_path           text
  cv_mime                   text
  cv_original_filename      text
  submitted_at              timestamptz
  current_stage             text not null default 'new'
                              check (current_stage in
                                ('new','screened','shortlisted','on_hold','rejected'))
  screening_status          text not null default 'pending'
                              check (screening_status in
                                ('pending','in_progress','complete','needs_manual_review'))
  screening_failure_reason  text
  current_screening_id      uuid
  purged_at                 timestamptz
  created_at, updated_at
  unique (opening_id, candidate_id)     -- FR-95: one application per opening.
                                        -- Now a refusal, not a merge

screening                               -- APPEND ONLY
  id                       uuid pk
  organization_id             uuid not null
  application_id           uuid not null references application(id) on delete cascade  -- FR-84
  jd_version_id            uuid not null references jd_version(id)
  prompt_version           text not null
  provider                 text not null
  model                    text not null
  jd_fit                   int not null check (jd_fit between 0 and 10)
  experience               int not null check (experience between 0 and 10)
  skills                   int not null check (skills between 0 and 10)
  qualification            int not null check (qualification between 0 and 10)
  location                 int not null check (location between 0 and 10)
  overall                  numeric(3,1) not null
  must_have_result         jsonb not null    -- [{requirement_id, met, note}]
  meets_all_must_haves     boolean not null
  strengths                text not null
  gaps                     text not null
  overall_read             text not null
  experience_discrepancy   text              -- FR-46, null when none
  created_at               timestamptz not null default now()

stage_event                             -- APPEND ONLY
  id              uuid pk
  organization_id    uuid not null
  application_id  uuid not null references application(id) on delete cascade  -- FR-84
  from_stage      text
  to_stage        text not null
  actor_kind      text not null check (actor_kind in ('admin','system'))
  actor_id        uuid references app_user(id)   -- null when actor_kind='system'
  disposition     text                           -- FR-58, nullable
  note            text
  created_at      timestamptz not null default now()

provider_settings
  organization_id       uuid pk references organization(id)
  provider           text not null check (provider in ('openai','google','nvidia'))
  model              text not null
  api_key_encrypted  bytea
  key_hint           text            -- last 4 chars only
  validated_at       timestamptz
  updated_at         timestamptz

job
  id            uuid pk
  organization_id  uuid not null
  kind          text not null
  payload       jsonb not null
  status        text not null default 'queued'
                  check (status in ('queued','running','succeeded','failed'))
  attempts      int not null default 0
  max_attempts  int not null default 5
  run_after     timestamptz not null default now()
  locked_at     timestamptz
  locked_by     text
  last_error    text
  created_at, updated_at
```

### 2.2 Append-only with a current pointer **[new decision]**

`screening` and `stage_event` are append-only, which makes **FR-50** (scores immutable) and **FR-59** (every stage change attributable) structural rather than disciplinary. But deriving current state from the latest row on every query makes filtering (**FR-66**) and sorting (**FR-70**) slow and awkward.

**Resolution:** keep the history append-only *and* denormalise the current values onto `application` — `current_stage`, `current_screening_id`, `screening_status`.

**Rule.** The insert into the history table and the update of the pointer happen in one transaction. Never one without the other. A pointer that disagrees with its history is the worst failure this schema can produce, because both look plausible.

**Append-only means no `UPDATE`, not "can never be removed."** `screening` and `stage_event` cascade-delete with their application when an admin deletes a whole posting (**FR-84**) — that is a deliberate, confirmed, explicit action with its own confirmation dialog, a different thing entirely from a row being quietly edited or dropped in the ordinary course of using the product.

### 2.3 Indexes

```
application    (organization_id, opening_id, current_stage)
application    (organization_id, opening_id, screening_status)
application     unique (opening_id, candidate_id)
screening      (application_id, created_at desc)
stage_event    (application_id, created_at desc)
job            (status, run_after) where status = 'queued'
candidate       unique (organization_id, email)
posting         unique (apply_token)
```

### 2.4 The Not-provided distinction (FR-33, FR-68)

Three states must be distinguishable, and `null` alone cannot carry three states:

| State | Representation | Displays as |
|---|---|---|
| Asked and answered | key present, value set | the value |
| Asked, left blank | key present, value `null` | blank |
| Never asked (manual upload) | key absent from `form_answers` | **Not provided** |

**Only manual uploads produce Not-provided now.** Every field on the application page is required (**FR-91**), so a candidate who applies themselves always arrives with a complete `form_answers`. The distinction still matters — FR-68's filter-exclusion counting exists for exactly the admin-uploaded candidates who lack these fields — but it is no longer a state a form submission can be in.

`admin_overrides` is a separate object so a hand-filled value (**FR-34**) never overwrites what the candidate actually submitted. Read order: override, then form answer, then Not provided.

---

## 3. Row-level security

**Rule.** Every table has RLS enabled. Every policy resolves the caller's organizations through `membership` and compares against the row's `organization_id`.

```sql
-- Helper, used by every policy
create function current_org_ids() returns setof uuid
  language sql stable security definer as $$
    select organization_id from membership
    where user_id = auth.uid() and status = 'active'
  $$;

-- Pattern applied to every organization-scoped table
create policy tenant_read on <table> for select
  using (organization_id in (select current_org_ids()));

create policy tenant_write on <table> for all
  using (organization_id in (select current_org_ids()))
  with check (organization_id in (select current_org_ids()));
```

`in (select ...)` rather than `=` so a user belonging to more than one organization needs no policy rewrite when the permission layer lands.

**Exceptions, deliberate:**

| Table | Policy |
|---|---|
| `screening`, `stage_event`, `jd_version` | Select only. No update or delete policy exists for anyone — the absence of the policy is the enforcement |
| `job` | No client access at all. Background-only |
| `apply_attempt` | No client access at all. Written and read only by the public intake handlers |
| `provider_settings.api_key_encrypted` | Never selectable from the client. The client reads `provider`, `model`, `key_hint`, `validated_at` through a view |

**Background jobs bypass RLS** and must filter `organization_id` explicitly in every query. This is the single largest tenant-isolation risk in the system. **The public intake handlers (§5) are the second**, for the same reason: they run with the elevated client and no session, so every one of their queries is scoped by the `apply_token`'s posting and nothing else.

**Rule.** The elevated client is constructed in exactly one module, and that module is never imported by anything that renders. Enforce with a lint rule, not vigilance.

### 3.1 Organization bootstrap and access **[new decision]**

Answers the open question carried from TechDecisions: who creates the organization, and what happens to a second person signing in.

| Case | Behaviour |
|---|---|
| **Seed admin signs in** — email matches `SEED_ADMIN_EMAIL` and no organization exists | Create the organization, create `app_user`, create an `active` `admin` membership. This is the only route by which an organization comes into existence in this build |
| Seed admin signs in, organization already exists | Normal sign-in |
| **Anyone else signs in with no membership** | `app_user` is created, no membership. They see "You don't have access to an organization yet. Ask an admin to invite you." Nothing else is reachable |
| Invited user signs in | Not buildable yet — the invite flow ships with the permission layer |

`SEED_ADMIN_EMAIL` is an environment variable, set per environment. For this build: `saiphanimba09@gmail.com`.

**Rule.** Signing in never silently creates an organization for an arbitrary user. Self-serve signup is a later decision with billing and tenancy consequences; until then, no membership means no access.

**Invites are shaped, not built.** `membership` already carries `role`, `status`, `invited_by` and `invited_at`, and the role check constraint currently permits only `admin`. When the permission layer arrives it widens the constraint and adds the invite flow — no table touches, no data migration, no RLS rewrite.

---

## 4. Migrations

Timestamp-prefixed, applied in order. **As actually applied**, not as first planned — Draft 1's names were a projection and the real sequence diverged:

```
20260821060000_core_tenancy.sql             organization, app_user, membership, RLS helpers
20260822090000_m1_postings_openings.sql     posting, opening, jd_version, requirement,
                                            provider_settings
20260822140000_m1_provider_list_revision.sql  provider CHECK widened to the FR-81 list
20260822180000_m1_multi_provider_fallback.sql multi-provider chain + priority
20260822190000_m2_candidates_apps.sql       candidate, application
20260822200000_m2_screening.sql             screening, stage_event, record_screening()
20260822210000_m2_jobs.sql                  job, claim_next_job()
20260822220000_m2_storage.sql               cvs bucket + policies
20260822230000_m2_citext_schema_fix.sql     citext moved out of public (linter)
20260823090000_m3_google_connection.sql     google_connection, unmatched_submission
20260823xxxxxx_native_intake.sql            apply_token, email_verified, apply_attempt,
                                            source CHECK widened; everything the
                                            previous migration added, dropped again
```

**The last two lines are the honest record of a reversal**, one day apart. Left visible rather than tidied away: the M3 migration was applied, ran in production against a real submission, and is now rolled forward out of existence. Squashing them would hide that this happened.

**The intake migration is non-destructive to candidate data.** The pilot organisation holds a real application that arrived through the retired Google path. It keeps its candidate, its CV, its screening and its `source = 'form'` provenance; only the connection and the dead columns go.

**Rule.** Never modify a migration already applied anywhere, including a preview environment. Roll forward.

---

## 5. Application intake (FR-87 – FR-100)

Replaces the Google integration entirely. See PN-002 for why.

### 5.1 The public surface

Exactly one route is reachable without a session: `GET /apply/[token]` and its two `POST` companions. `posting.apply_token` is unguessable (32 bytes, base64url) — not as a security control on its own, but so that open postings cannot be enumerated by anyone who happens to hit `/apply`.

**Rule.** The browser never touches the database on this path. Both writes go through route handlers that validate everything server-side and use the elevated client. **No RLS policy is ever granted to `anon`** — the public surface stays exactly as wide as these handlers, and the isolation rule from §3 (background code filters `organization_id` explicitly) applies to them for the same reason.

The apply page renders only: the organisation's name, and the title and work location of each opening in that posting **that has a current JD** (FR-89, FR-8). Nothing else about the organisation, the posting, or any candidate is exposed.

### 5.2 Submission is two steps, in this order **[new decision]**

Upload first, submit second. The ordering is deliberate and the reasoning is worth keeping:

```
1.  POST /api/apply/[token]/upload-slot   { email, openingId, filename, size, mime }
      → server: posting open? opening has a JD? no existing application
        for (opening, email)? rate limit OK? size ≤ 1MB? mime allowed?
      → 200 { signedUrl, storagePath }   |   409 already applied   |   429

2.  browser PUTs the file straight to Supabase Storage against signedUrl

3.  POST /api/apply/[token]/submit        { ...fields, storagePath }
      → server: re-verify all of the above, then HEAD the object —
        it must exist, be ≤ 1MB, and carry an allowed content type
      → insert candidate (or reuse), insert application, enqueue
        screen_application, return 201
```

**Why the duplicate check sits in step 1, not step 3.** A candidate who has already applied would otherwise upload a megabyte before being told, leaving an orphaned object behind — a waste caused entirely by our own ordering. Checking before the slot is issued means nothing moves. Step 3 re-checks because the two calls are not atomic, and `unique (opening_id, candidate_id)` is the backstop when they race.

**Why the server HEADs the object rather than trusting `storagePath`.** The browser is an untrusted client that could claim any path or any size. The only authoritative statement about what was actually uploaded comes from Storage itself. **Nothing is trusted from step 2** — the size and type checks in step 1 are for fast feedback, not enforcement.

**Storage path:** `{organization_id}/apply/{token}/{uuid}-{filename}`. On success the application's `cv_storage_path` is rewritten to the standard `{organization_id}/{application_id}/{filename}` shape used everywhere else, so downstream code sees one layout.

### 5.3 Limits and abuse

| Control | Where |
|---|---|
| 1 MB, PDF or DOCX only (FR-94) | Client for feedback; **server after upload for enforcement** |
| One application per opening (FR-95) | Step 1 check, step 3 re-check, unique constraint |
| Per-IP rate limit on both endpoints | A small `apply_attempt` table, swept by the retention job |
| Honeypot field and a minimum time-to-fill | Step 3, silently discarded |
| Posting must be `open` (FR-100) | Both steps |

**No CAPTCHA in this build.** It is the next control if volume becomes real (functional spec §18), ahead of email verification.

Deliberately **not** enforced at the bucket: a bucket-wide `file_size_limit` of 1 MB would also cap the admin's manual uploads, which have no such restriction. The limit belongs to the public path, so it is enforced there.

### 5.4 Orphaned uploads

A candidate who takes a slot and never submits leaves an object with no application. The daily `purge_expired` job also sweeps `{organization_id}/apply/**` objects older than 24 hours with no owning application. Cheap, and it stops the bucket accreting abandoned files.

### 5.5 What screening receives

Nothing changes downstream. A row lands in `application` with `source = 'apply'` and a complete `form_answers` object — every field is required (FR-91), so unlike a manual upload nothing is ever Not-provided. `screen_application` is enqueued exactly as it is today and the candidate waits for none of it (FR-96).

---

## 6. Screening pipeline

```
kind: screen_application
payload: { application_id, reason: 'new' | 'rescreen' | 'retry' }
```

### 6.1 Steps

| # | Step | Failure behaviour |
|---|---|---|
| 1 | Load application, opening, current `jd_version`, requirements | Hard fail, retry |
| 2 | Fetch CV from Storage | Hard fail, retry |
| 3 | Extract text / prepare document | **Unreadable → `needs_manual_review`, stop** (**FR-47**) |
| 4 | Build prompt: JD + requirements + form answers + CV | — |
| 5 | Call provider, structured output | Retry with backoff |
| 6 | Validate against schema | Retry; never partially save |
| 7 | Compute `overall` in code | — |
| 8 | Insert `screening`, update pointer, advance stage `new → screened` | One transaction |

### 6.2 Unreadable detection (FR-47)

Runs **before** the provider call, so the failure is cheap and the reason specific.

| Condition | `screening_failure_reason` |
|---|---|
| PDF yields < 200 extractable characters across all pages | `We couldn't read this file — it may be a scanned image.` |
| File won't open / decode | `This file is damaged or empty.` |
| Text present but no CV-like content | `This file doesn't appear to be a CV.` |

Application stays at `current_stage = 'new'` with `screening_status = 'needs_manual_review'` — exactly what **FR-47** requires. `retry` is available (**FR-48**).

### 6.3 Structured output

Zod schema, validated before persistence:

```
{
  components: { jdFit, experience, skills, qualification, location }  // 0–10 ints
  mustHaves: [{ requirementId, met: boolean, note: string }]
  strengths: string
  gaps: string
  overallRead: string
  experienceDiscrepancy: string | null
}
```

**`overall` is computed in our code**, not requested from the model: `mean(components)` rounded to one decimal (**FR-41**). Arithmetic in code makes **FR-42** verifiable rather than trusted.

**`mustHaves` must return one entry per must-have requirement, keyed by id.** A missing entry is a validation failure, not an implied pass — a silently dropped requirement would produce a false "meets all must-haves", which is the most damaging wrong answer this system can give.

### 6.4 Prompt construction

Framing obligations that are requirements, not style:

| Obligation | Requirement |
|---|---|
| Gaps expressed as distance from this JD, never as characterisations of the person | **FR-45** |
| Compare declared experience against CV-evidenced experience; report material divergence | **FR-46** |
| Judge each must-have explicitly against its stated text | **FR-43** |
| Never recommend an outcome, never suggest rejection | ProductContext Principle 1 |

`prompt_version` is stored on every screening row alongside provider and model (TechDecisions §7).

### 6.5 Rescreen fan-out (FR-18, FR-60)

```
kind: rescreen_opening
payload: { opening_id, jd_version_id }
```

Enumerates applications and enqueues one `screen_application` each. **Never loops inline** — forty candidates in one job exceeds the execution limit and leaves the pipeline half-updated.

### 6.6 Requirement extraction (FR-13)

```
kind: extract_requirements
payload: { jd_version_id }
```

Returns a proposed list; the admin confirms (**FR-14**, **FR-15**). Extraction returning nothing is a valid outcome, not an error — functional spec §8 has copy for it.

**Extraction never marks anything must-have.** Everything arrives `preferred` (**FR-15**). The whole point of the step is that the JD cannot be trusted to signal its own priorities.

---

## 7. Job runner

| Aspect | Approach |
|---|---|
| Trigger | Vercel Cron → runner route, every minute |
| Claim | `update ... set status='running', locked_at=now() where id in (select ... for update skip locked)` |
| Retries | Backoff 1m, 5m, 15m, 1h, 6h; `max_attempts` 5 |
| Terminal failure | `screen_application` → `needs_manual_review` with reason |
| Stuck jobs | `locked_at` older than 10 minutes is reclaimed |
| Idempotency | Every handler is safe to run twice. Screening inserts a new row rather than updating, so a duplicate run costs money, not correctness |

**Rule.** One job = one unit of work. One application, one posting, one export. Never one opening's worth of anything.

*Draft 5 removed the `import_submissions` kind.* Intake no longer needs a job at all — a submission inserts its own row in-request.

---

## 8. Routes and rendering

| Route | Rendering | Notes |
|---|---|---|
| `/` | Server, per request | Home overview (**FR-76** – **FR-80**). Counts must be current |
| `/postings/new` | Server shell + client form | Multi-step creation |
| `/postings/[postingId]` | Server, per request | Openings, application link |
| `/apply/[token]` | Server, per request | **Public.** The application page (**FR-87** – **FR-100**) |
| `/api/apply/[token]/upload-slot` | Route handler | **Public.** Issues a signed upload URL (§5.2) |
| `/api/apply/[token]/submit` | Route handler | **Public.** Creates the application (§5.2) |
| `/postings/[postingId]/openings/[openingId]` | Server shell, client data | The pipeline |
| `/settings/organization` | Server, per request | Org profile: name, legal name, website, industry, size, location, timezone, currency, logo |

| `/settings/screening` | Server, per request | Provider and key (**FR-81** – **FR-83**) |
| `/no-access` | Server | Shown to a signed-in user with no membership (§3.1) |
| `/auth/callback` | Route handler | OAuth return |
| `/api/cron/jobs` | Route handler | Runner. Secret-guarded |
| `/api/cron/retention` | Route handler | Daily. Secret-guarded |

**Rule.** No organization-scoped response is cached at the CDN. Candidate data is private and changes constantly; a cache hit across organizations is the worst possible bug. **`/apply/[token]` is not exempt** — it is public but still organization-scoped, and it must reflect a posting being closed immediately.

**Mutations are server actions**, each of which re-verifies the caller's organization. RLS is the backstop, not the only check.

### Client data layer

Query keys, defined once and shared between server prefetch and client hooks:

```
['applications', openingId, filters]
['application', applicationId]
['opening', openingId]
['requirements', openingId]
['postings']
['overview']
```

**Rule.** A prefetch key and its hook key must be identical. Divergence causes an immediate refetch and wastes the prefetch silently — nothing breaks visibly, which is what makes it dangerous.

One hook per resource: `useApplications`, `useApplication`, `useOpening`, `useRequirements`, `useOverview`.

---

## 9. Pipeline behaviour

### Stage transitions

| From → To | Actor | Recorded |
|---|---|---|
| `new → screened` | system | `actor_kind='system'`, `actor_id` null (**FR-55**) |
| any → `shortlisted` / `on_hold` / `rejected` | admin | `actor_kind='admin'`, actor id, optional disposition (**FR-56**, **FR-57**) |
| back to any earlier stage | admin | Permitted — functional spec §8 promises "you can move them back later" |

**Batch actions insert one `stage_event` per application** (**FR-56**). No batch shortcut, because **FR-59** requires every change individually attributable — and because a batch of twenty is twenty decisions about twenty people.

### Filtering (FR-66 – FR-69)

Server-side, composed into one query. Score and component ranges hit the denormalised pointer, not the history.

**Amended 27 Aug 2026 — the first cut runs client-side.** The score,
component, must-have, status and date filters (FR-66's screening half) plus
sorting (FR-70) filter an array already loaded into the pipeline component,
not a composed query. §15's assumption 7 puts the ceiling at several hundred
applications per opening; at that size an in-memory filter is instant, where
a round trip per dropdown change would not be. **The server-side design
below still stands for the form-answer filters**, which are unbuilt and are
the ones that actually need FR-68's exclusion counting.

**FR-68 requires counting exclusions, not just applying them.** When a filter references a field, applications whose `form_answers` lack that key are excluded *and* counted separately, so the UI can offer "N candidates hidden because they have no notice period recorded" with a way to show them.

### Reassignment (FR-60)

Changing `opening_id` must respect the unique constraint on `(opening_id, candidate_id)`. If the candidate already has an application on the target opening, the move is refused with an explanation rather than failing on a constraint error. **[new decision]** — the functional spec doesn't cover this collision.

---

## 10. Exports (FR-71 – FR-75)

| Format | Where | Notes |
|---|---|---|
| CSV / Excel | In-request | Full data. Header row carries the internal-use marker |
| PDF | In-request | Rendered from React components in current screen order (**FR-72**) |
| With CV files | `build_export` job | Size unpredictable; produces a time-limited download |

Filters and selection carry into the export (**FR-74**). Every export carries the marker (**FR-75**).

---

## 10A. Candidate communications (FR-106 – FR-135)

*Added Draft 8 (PN-004). The product's first outbound path, and the one
subsystem whose failures reach a real person.*

### 10A.1 Transport — SMTP, deliberately not OAuth

```
host: smtp.gmail.com   port: 587   STARTTLS
auth: organisation address + app password
```

**Why not the Gmail API.** `gmail.send` is a restricted OAuth scope.
PN-002 established that a sensitive scope puts Ziphyre's whole consent
screen behind Google's verification review — admin sign-in included, not
just the feature that asked for it. SMTP with an app password involves no
consent screen, no scopes and no review: to Google it is a mail client.
That is the entire reason for the choice, and it should not be
"modernised" to the API without re-reading PN-002 first.

**Behind one interface.** `lib/mail/transport.ts` exposes a single
`send(message)`. Gmail SMTP is the first implementation and the Gmail
account limits are low — roughly 500 recipients a day free, ~2,000 on
Workspace — so a real provider will eventually replace it. Nothing above
this interface knows what carries the mail.

**App passwords require 2-Step Verification** on the sending account.
Google removed the older "less secure app access" toggle in 2022; app
passwords are the supported path and the settings copy must say so, since
this is the single most likely place a customer gets stuck.

### 10A.2 Schema

```
message_template                          -- APPEND ONLY, per FR-129
  id, organization_id
  kind            text not null check (kind in
                    ('application_received','interview_invite',
                     'outcome_rejected','general_update'))
  version         int not null
  subject         text not null
  body            text not null
  created_at, created_by
  unique (organization_id, kind, version)

message                                   -- the outbox, FR-133
  id, organization_id
  application_id  uuid not null references application(id) on delete cascade
  template_id     uuid references message_template(id)   -- FR-129 provenance
  kind            text not null
  to_email        text not null           -- as sent, not as looked up later
  subject         text not null
  body            text not null           -- rendered, not the template
  status          text not null default 'queued'
                    check (status in ('queued','sent','failed'))
  error           text
  sent_at         timestamptz
  sent_by         uuid references app_user(id)  -- null for FR-117
  created_at

mail_settings
  organization_id uuid pk references organization(id)
  from_email      text not null
  from_name       text
  app_password_encrypted bytea not null
  password_hint   text                    -- last 4 only
  verified_at     timestamptz
  booking_url     text                    -- FR-130
  updated_at

application
  + status_token  text not null unique    -- FR-119, FR-124
  + outcome_sent_at timestamptz           -- FR-123's gate

opening
  + booking_url   text                    -- FR-131 override, nullable
```

**The rendered body is stored, not just the template id.** FR-129 says
what was actually said to a candidate stays recoverable; a template id
alone stops being an answer the moment the template is edited. This
duplicates text on purpose.

**`outcome_sent_at` is the gate, not a derived query.** FR-123 turns on
whether the outcome has been *sent*, and a column says that in one read
where a scan of `message` for a successful `outcome_rejected` row would
be a join the status page performs on every anonymous request.

### 10A.3 Sending is a job

```
kind: send_message
payload: { message_id }
```

Queued per recipient, never per batch: FR-111 requires a failure to be
attributable to the candidate it was meant for, and one job per message
gives that for free along with the existing backoff and retry (§7). A
batch of twenty is twenty rows in `message` and twenty jobs.

**The row is written before the job runs.** A message exists as `queued`
the moment the admin confirms, so the outbox never has a gap between
"they clicked send" and "something happened".

**Terminal failure marks the row `failed` with the reason**, and the
pipeline shows it against the candidate (FR-111). It never retries
silently forever and never disappears.

### 10A.4 The status page

```
GET /status/[token]        public, no session, no account
```

Same shape as `/apply/[token]`: 32 random bytes, base64url, unguessable,
so postings cannot be enumerated. Added to the proxy's public-path list
alongside `/apply`, `/api/apply` and `/api/cron` — **omit it and every
status link 404s in production while working locally.**

**What it may read is deliberately narrow.** Role title, organisation
name, `submitted_at`, `current_stage`, and `outcome_sent_at`. It must
never select a score, component, must-have result, assessment text or
disposition — FR-121 is a Non-Goal, and the safest way to honour it is
for the query not to fetch the columns at all.

**Stage is mapped, never rendered raw** (FR-122), and the mapping lives
next to `STAGE_LABELS` so the internal and candidate-facing vocabularies
cannot drift:

```
new, screened  -> "Received"
shortlisted    -> "Shortlisted"
on_hold        -> "Under review"
rejected       -> outcome_sent_at ? "Not moving forward" : "Received"
```

That last line is FR-123 in one expression.

### 10A.5 Retention

The status page is candidate data behind a public URL, so §11's purge
must kill it. `purge_expired` additionally:

- nulls `application.status_token`, after which `/status/[token]` returns
  the expired-link copy rather than a 404 — a candidate who bookmarked it
  deserves an explanation, not a dead end;
- clears `message.to_email`, `subject` and `body`, keeping `kind`,
  `status` and `sent_at` so the outbox still shows *that* something was
  sent without retaining what it said to whom.

**This is a change to a job that has already been tested**, and §11's rule
applies again: it must be re-tested against a fixture before it runs.

### 10A.6 Routes

| Route | Purpose |
|---|---|
| `/communications` | Outbox, templates, sender, booking link (FR-133/134) |
| `/status/[token]` | Public status page (FR-119) |
| `POST /api/messages/send` | Confirmed send from the pipeline |
| `send_message` job | Delivery, retry, failure recording |

---

## 11. Retention (TechDecisions §8)

```
kind: purge_expired
schedule: daily
```

- On posting close: `purge_after = closed_at + 6 months`.
- 30 days before: notify the admin, set `purge_warned_at`.
- At expiry, for each application: delete the CV from Storage, null the CV paths, clear personal fields on `candidate` and `form_answers`/`admin_overrides`, clear `strengths`/`gaps`/`overall_read` on screenings, set `purged_at`.
- **Retained:** component ratings, overall score, stage, disposition, dates.
- Also sweeps abandoned intake uploads (§5.4) and expired `apply_attempt` rate-limit rows. Neither is candidate data worth keeping.

**Rule.** Purge is irreversible and deletes real people's data. It runs only against postings whose `purge_after` has genuinely passed, it is logged, and it is the one job that must be tested before it ever runs in production.

**This got heavier in Draft 5.** Previously every form-submitted CV also existed in the admin's Drive, so purging ours left a copy in their hands. Ziphyre now holds the **only** copy of every CV it has ever received. Deleting it deletes it. That makes this job the single place where Principle 9 — candidate data held in trust — is either honoured or broken, and it is the reason the retention rule is not optional. Candidate-facing wording can now simply say "deleted", with no Drive caveat.

---

## 12. Secrets and sensitive data

| Item | Handling |
|---|---|
| Provider API key | Encrypted at rest. Never selected client-side. `key_hint` (last 4) is all the UI sees |
| CVs | Storage bucket, no public access, time-limited signed URLs generated per view |
| Signed **upload** URLs | Issued only by §5.2 step 1, scoped to one path, short-lived. Never issued before the posting, opening and duplicate checks pass |
| Cron routes | Guarded by a shared secret; unauthenticated calls rejected |
| `apply_token` | Not a secret in the cryptographic sense — it is shared publicly by design. It prevents enumeration, nothing more, and no authorisation decision rests on it alone |

**Rule.** No secret is ever placed in a browser-exposed environment variable. This is the most common way an AI-assisted build leaks a key.

**Key validation on save** (**FR-83**): a test call at settings time, so a bad key fails in front of the admin rather than silently at 2am. On failure, new applications land as `needs_manual_review` with the reason stated.

---

## 13. Failure modes

| Failure | Behaviour | Requirement |
|---|---|---|
| CV unreadable | `needs_manual_review`, stays at New, specific reason, retry available | **FR-47**, **FR-48** |
| Provider down / no key | Same as above, reason names the provider or settings | **FR-83** |
| Structured output invalid | Retry; never partially saved | — |
| Job exceeds time limit | Reclaimed after 10 min, retried | — |
| Duplicate submission | Refused at step 1 before any upload; the first application is untouched | **FR-95** |
| Upload taken, never submitted | Orphaned object swept after 24h by `purge_expired` | §5.4 |
| Submit claims a path that was never uploaded | `HEAD` fails, submission refused, no application created | §5.2 |
| Submit claims a file over 1 MB or of the wrong type | Server-side check on the real object refuses it, whatever the client said | **FR-94** |
| Posting closed mid-application | Refused at submit with the closed message; nothing partial is stored | **FR-100** |
| Storage unreachable | Upload fails in the browser and the candidate is told to retry. Nothing is written, so there is no half-application to reconcile | — |

**Invariant across all of them:** an external failure may delay screening; it may never lose a candidate. **A failed intake is the one case where nothing is kept at all** — but that is safe, because a candidate who could not submit was never in the pipeline to lose. The failure is in front of them, not silent.

---

## 14. Testing

| Area | Test |
|---|---|
| Score computation | `overall` = mean of five components, one decimal — **FR-41** |
| Must-have evaluation | One verdict per must-have; missing entry fails validation — **FR-43** |
| Dedup | Second application for one opening is refused, never merged, and the first is untouched — **FR-95** |
| Intake validation | A submission missing any field, or with a CV over 1 MB or of the wrong type, is refused — **FR-91**, **FR-94** |
| Upload trust | A submit naming a path that was never uploaded, or an object larger than it claimed, is refused — §5.2 |
| Public surface | `/apply/[token]` exposes no score, no other candidate, and no other posting; a bad token 404s — **FR-99** |
| Unreadable detection | Scanned PDF → `needs_manual_review`, not a zero score — **FR-47** |
| Not-provided filtering | Excluded and counted, never silently dropped — **FR-68** |
| Stage history | Pointer and latest event always agree; batch writes one event per application — **FR-55**, **FR-59** |
| Purge | Deletes exactly the expired set, retains anonymised scores |
| Tenant isolation | A second organization's data is unreachable through every client path |

**Not unit-tested:** provider responses (mocked at the boundary), component rendering.

**Screening quality is not a unit test.** It is the seven CA CVs against `Testing/baseline-ranking-CA-role.md`, run as a repeatable exercise on every prompt or model change.

---

## 15. Build order

Sequenced so screening quality is proven before anything is built on top of it.

| Milestone | Contains | Done when |
|---|---|---|
| **M0 — Foundations** | Schema, RLS, auth, seed-admin bootstrap, organization profile settings, job runner | The seed admin signs in and lands in a new organization; a second Google account is refused with the no-access screen; org details can be edited; a no-op job runs on cron |
| **M1 — Openings** | Posting, opening, JD versions, requirement extraction and marking | The pilot CA JD produces a requirement list that can be edited and marked |
| **M2 — Screening** | Manual upload, CV storage, screening pipeline, provider settings | **The seven CA CVs are screened and compared against the baseline.** This is rollout stage 1 |
| **M3 — Google** *(shipped, then superseded)* | Connection, form matching, import job, unmatched queue | A real submission reached the pipeline unaided, 23 Aug 2026. Retired the same day by M3.5 |
| **M3.5 — Native intake** | Public apply page, signed-upload flow, `apply_token`, removal of the Google path | A candidate applies through a Ziphyre link on a phone and is screened, with no Google account on either side |
| **M4 — Pipeline** | Stages, batch actions, disposition, CV viewer, reassignment | A role can be worked end to end |
| **M5 — Filters & export** | Filtering, sorting, all three export formats | A shortlist can be filtered and sent |
| **M6 — Overview & retention** | Home counts, mobile layout, purge job | Rahul's glance works on a phone; purge tested |
| **M7 — Communications** | SMTP transport, send job, status page, templates, outbox | A candidate applies, is emailed a status link, is invited to book, and is told the outcome — every message sent by a person except the first |

**M2 needed no Google integration at all.** Manual upload alone exercised the entire screening path, so the riskiest question in the product — is the ranking trustworthy — was answered before a single line of OAuth was written.

**M3 shipped and was then deliberately replaced** (PN-002). It is left in the table rather than deleted because it is what proved intake worked end to end, and because the reason it was replaced — a setup ritual needing a manual, behind an OAuth review that blocked every real customer — is only legible next to the thing it replaced. **M3.5 lands before M4**: intake is cheaper to change before the pipeline is built on top of it, and it deletes the unmatched queue M4 would otherwise have had to render.

---

## 16. Traceability

| Requirement group | Where implemented |
|---|---|
| FR-106 – FR-135 | §10A Communications, §11 Retention |
| FR-1 – FR-4 | *Retired.* No Google connection exists |
| FR-5 – FR-12 | §2 `posting`, `opening`, `jd_version` |
| FR-13 – FR-18 | §6.6 Extraction, §2 `requirement` |
| FR-19 – FR-29 | *Retired.* Replaced by FR-87 – FR-100 |
| FR-30 – FR-35, FR-37 | §5 Intake, §2.4 Not-provided |
| FR-36 | *Retired.* Superseded by FR-95 |
| FR-38 – FR-51 | §6 Screening pipeline |
| FR-52 – FR-61 | §9 Pipeline behaviour |
| FR-62 – FR-65 | *Retired.* No Drive, no sheet, no source to diverge from |
| FR-66 – FR-70 | §9 Filtering |
| FR-71 – FR-75 | §10 Exports |
| FR-76 – FR-80 | §8 Routes — `/` |
| FR-81 – FR-83 | §12 Secrets, `provider_settings` |
| FR-84 | §2.2, §2.1 cascade chain (`opening → application → screening`/`stage_event`) |
| FR-85 – FR-86 | §6 Screening pipeline, provider fallback chain |
| **FR-87 – FR-100** | **§5 Application intake** |

Retired ranges are listed rather than removed. The numbers are never reused, so a reference to FR-28 found anywhere — in code, a commit, an old note — resolves to something rather than silently pointing at an unrelated requirement.

---

## 17. Open questions

1. **Reassignment collision** — resolved here as a refusal (§9). Confirm that's the behaviour you want, versus merging the two applications.
2. **Export download lifetime** — a bundled-CV export produces a time-limited link. How long should it live? It contains CVs.
3. **Purge notification route** — the 30-day warning has to reach the admin, but there is no email capability in this build. In-app only, or does this justify the first transactional email? **Draft 5 raises the stakes:** Ziphyre now holds the only copy of every CV, so an unnoticed purge is unrecoverable rather than merely inconvenient.
4. **Rate limit thresholds** — §5.3 specifies per-IP limiting but not the numbers. Genuinely unknowable before real traffic; start deliberately loose and tighten on evidence, since a limit that blocks real applicants is worse than one that lets junk through to a human queue.

*Resolved 16 Aug 2026: organization profile fields confirmed as specified in §2.1; currency and timezone confirmed as organization-level rather than per opening.*
*Resolved 23 Aug 2026 (PN-002): intake source, email verification, upload mechanics and duplicate handling.*

---

## 18. Change log

| Version | Date | Change |
|---|---|---|
| Draft 8 | 28 Aug 2026 | **§10A added — candidate communications (PN-004, functional spec Draft 9).** Mail goes over SMTP with an app password behind a single `send()` interface, because the Gmail API's `gmail.send` is a restricted scope and PN-002 established that one such scope re-gates the whole consent screen. Sending is a `send_message` job queued **per recipient**, so a failure is attributable to the candidate it was meant for and inherits the existing backoff. `message` stores the **rendered** body rather than only a template id, since FR-129's promise that what was said stays recoverable dies the moment a template is edited. `application.outcome_sent_at` exists so FR-123's gate is one column read on an anonymous request rather than a join. The status page joins `/apply` in the proxy's public-path list — omitting it 404s every status link in production while working locally — and its query deliberately does not fetch score columns at all, because the safest way to honour Non-Goal 9 is to be unable to leak it. Retention grows a second obligation: the purge nulls the status token and clears message contents, which means **the purge job must be re-tested before it runs again** |
| Draft 7 | 27 Aug 2026 | **M4's stage transitions built (FR-56 – FR-60).** Two security-definer functions join `record_screening` for the same structural reason §2.2 gives: `record_stage_change` writes the history row and moves the pointer in one transaction, and `reassign_application` checks the posting, the self-move and the `(opening_id, candidate_id)` collision under a row lock rather than from the application layer, so two admins racing cannot both pass a pre-check. Both check membership themselves — unlike `record_screening` they are reachable from a Server Action with a user-supplied id, and definer rights would otherwise cross tenants. Three decisions recorded beyond §9: **disposition is constrained in the database**, to FR-58's six values and to On hold / Rejected only, because an invented value would quietly corrupt FR-71's export column; **a no-op move writes no history**, since batch actions make "Rejected → Rejected" easy to produce by accident and §9's own audit trail is the one place that has to stay readable; and **reassignment is not a `stage_event`** — the stage does not change, and a synthetic row would break FR-102's arithmetic. Adds the stage filter FR-66 always specified but which was meaningless while nothing could leave `screened`. Reassignment's rescreen needs no new payload: `screen_application` resolves the opening at run time, so a job queued after the move reads the new JD by construction |
| Draft 6 | 27 Aug 2026 | Records the M4 UI shell as built, and one deliberate deviation: the screening-side filters and sorting run client-side over the already-loaded list rather than as a composed query (§9), justified by §15's several-hundred ceiling. The form-answer filters and FR-68's exclusion counting remain unbuilt and keep the server-side design. Also notes what the shell does *not* include — nothing can yet move an application off `screened`, so the FR-101 funnel cannot change until the stage transitions land |
| Draft 5 | 23 Aug 2026 | **Google intake replaced by a Ziphyre-hosted application page (PN-002, functional spec Draft 6).** §5 rewritten end to end: a public `/apply/[token]` surface, a two-step upload-then-submit flow where the CV never passes through the application server, and server-side verification of the uploaded object rather than trust in what the client claims. Schema: `posting.apply_token` and `candidate.email_verified` added; `google_connection`, `unmatched_submission`, `opening.form_option_value`, the six Google columns on `posting`, and `cv_drive_file_id` / `source_row_number` / `previous_cv_storage_path` / `resubmitted_at` on `application` all dropped. The `import_submissions` job kind and the fourth moving part in §1 go with them. Two consequences recorded rather than glossed: the public intake handlers join background jobs as the places where tenant isolation is hand-enforced rather than given by RLS, and retention becomes load-bearing now that Ziphyre holds the only copy of every CV |
| Draft 4 | 22 Aug 2026 | `provider_settings.provider` constraint changed from `('claude','gemini','openai')` to `('openai','google','nvidia')`, matching the revised FR-81 list. Caught before any key was stored: the live CHECK constraint would have rejected all three new provider ids at save time. Rolled forward in migration `20260822140000` rather than editing the applied one |
| Draft 3 | 21 Aug 2026 | Posting deletion confirmed as an actual product decision (**FR-84**, functional spec) rather than an unconfirmed assumption. Fixed a real schema gap this surfaced: `application.opening_id`, `screening.application_id`, `stage_event.application_id` and `unmatched_submission.posting_id` had no cascade — deleting a posting as specified would have failed on a foreign-key violation rather than actually deleting anything. All four now cascade |
| Draft 2 | 16 Aug 2026 | Workspace renamed Organization throughout, with profile fields (legal name, website, industry, size, location, timezone, currency, logo) and its own settings screen. Membership split out of `app_user` so the permission layer lands without touching every table — role and invite columns present, role constrained to `admin` for now. Organization bootstrap decided: a seed-admin email creates the org on first sign-in, everyone else is refused until invited. Closes the M0 open question |
| Draft 1 | 16 Aug 2026 | First tech spec, from functional spec Draft 2 and TechDecisions Draft 2. Three decisions beyond the functional spec, all marked: append-only history with a denormalised current pointer; reassignment collision refused rather than merged; must-have verdicts required per requirement id with a missing entry treated as a validation failure rather than an implied pass |
