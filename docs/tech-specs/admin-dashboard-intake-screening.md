# Tech Spec — Screening Desk

**Implements:** `docs/functional-specs/admin-dashboard-intake-screening.md` (Draft 2)
**Built on:** `TechDecisions.md` (Draft 2)
**Status:** Draft 1 · 16 August 2026

Requirement references are **FR-n** from the functional spec. Where this document decides something the functional spec left open, it is marked **[new decision]**.

---

## 1. Shape of the system

Four moving parts. Everything else is UI over them.

```
Google Form ──► Response Sheet ──► import job ──► application row
                                                       │
                                                       ▼
                        manual upload ──────────► screening job ──► screening row
                                                       │
                                                       ▼
                                              pipeline UI ──► exports
```

| Part | Runs where | Trigger |
|---|---|---|
| **Import** | Background job | Cron, every 60s per open posting |
| **Screening** | Background job | Queued the moment an application row exists |
| **Pipeline** | Server-rendered shell, client-side data | User |
| **Retention** | Background job | Cron, daily |

**Nothing long-running happens inside a web request.** Screening takes tens of seconds and must retry; imports touch a third party. Both are jobs.

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

google_connection
  id                       uuid pk
  organization_id             uuid not null unique references organization(id)
  google_email             text not null
  refresh_token_encrypted  bytea not null
  scopes                   text[] not null
  status                   text not null default 'active'
                             check (status in ('active','needs_reconnect'))
  connected_by             uuid references app_user(id)
  created_at, updated_at   timestamptz

posting
  id                 uuid pk
  organization_id       uuid not null references organization(id)
  name               text not null
  status             text not null default 'open'
                       check (status in ('open','closed'))
  form_id            text                 -- Google Form identifier
  spreadsheet_id     text                 -- linked response sheet
  form_connected_at  timestamptz
  last_imported_row  int not null default 1
  last_import_at     timestamptz
  last_sweep_at      timestamptz
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
  form_option_value      text not null    -- exact dropdown string
  current_jd_version_id  uuid
  created_at, updated_at
  unique (posting_id, form_option_value)

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
  id            uuid pk
  organization_id  uuid not null
  email         citext not null
  full_name     text
  created_at, updated_at
  unique (organization_id, email)          -- FR-37

application
  id                        uuid pk
  organization_id              uuid not null
  opening_id                uuid not null references opening(id) on delete cascade  -- FR-84
  candidate_id              uuid not null references candidate(id)
  source                    text not null check (source in ('form','manual'))
  form_answers              jsonb                    -- absent key = never asked
  admin_overrides           jsonb not null default '{}'   -- FR-34, kept separate
  cv_storage_path           text
  cv_drive_file_id          text
  cv_mime                   text
  cv_original_filename      text
  previous_cv_storage_path  text                     -- FR-36
  source_row_number         int
  source_status             text not null default 'present'
                              check (source_status in
                                ('present','deleted_at_source','manual'))
  submitted_at              timestamptz
  resubmitted_at            timestamptz
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
  unique (opening_id, candidate_id)     -- FR-36, the dedup constraint

unmatched_submission                    -- FR-28
  id                      uuid pk
  organization_id            uuid not null
  posting_id              uuid not null references posting(id) on delete cascade  -- FR-84
  claimed_option          text
  raw_answers             jsonb not null
  cv_drive_file_id        text
  source_row_number       int
  resolved_application_id uuid references application(id)
  created_at

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
```

### 2.4 The Not-provided distinction (FR-33, FR-68)

Three states must be distinguishable, and `null` alone cannot carry three states:

| State | Representation | Displays as |
|---|---|---|
| Asked and answered | key present, value set | the value |
| Asked, left blank | key present, value `null` | blank |
| Never asked (manual upload) | key absent from `form_answers` | **Not provided** |

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
| `provider_settings.api_key_encrypted` | Never selectable from the client. The client reads `provider`, `model`, `key_hint`, `validated_at` through a view |

**Background jobs bypass RLS** and must filter `organization_id` explicitly in every query. This is the single largest tenant-isolation risk in the system.

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

Timestamp-prefixed, applied in order:

```
20260816090000_core_tenancy.sql        organization, app_user, membership, RLS helpers
20260816090100_postings_openings.sql   posting, opening, jd_version, requirement
20260816090200_candidates_apps.sql     candidate, application, unmatched_submission
20260816090300_screening.sql           screening, stage_event
20260816090400_jobs_settings.sql       job, provider_settings
20260816090500_storage_buckets.sql     cv bucket + policies
```

**Rule.** Never modify a migration already applied anywhere, including a preview environment. Roll forward.

---

## 5. Google integration

### 5.1 Connection (FR-1 – FR-4)

Google sign-in through Supabase Auth with **read-only** scopes:

```
drive.readonly          read uploaded CVs
spreadsheets.readonly   read response rows
forms.body.readonly     read the form's dropdown options for FR-27
```

**Rule.** No write scope is ever requested. **FR-63** (never write to the sheet) becomes impossible to violate rather than merely forbidden.

Refresh token encrypted at rest, never returned to the browser. A refresh failure sets `status = 'needs_reconnect'`, which drives the banner in functional spec §8. Existing applications remain fully readable because their CVs are already in our own Storage (TechDecisions §5.3).

### 5.2 Form matching (FR-27, FR-28)

On connecting a form, read its dropdown options and compare against `opening.form_option_value` for the posting. Report both directions of mismatch — options with no opening, and openings with no option — as functional spec §8 specifies.

**Matching is on the exact option string.** This is why `form_option_value` is stored separately from `title`: the admin may word the dropdown differently from the role title, and matching on title would silently break.

### 5.3 Import job

```
kind: import_submissions
payload: { posting_id }
schedule: every 60s per open posting
```

1. Read rows after `last_imported_row`.
2. For each row:
   - Resolve or create `candidate` by verified email.
   - Match `claimed_option` to an opening. **No match →** `unmatched_submission`, continue (**FR-28**).
   - **Existing application for (opening, candidate)?** → resubmission path (**FR-36**): move current CV to `previous_cv_storage_path`, store the new one, set `resubmitted_at`, leave stage untouched, queue a rescreen.
   - Otherwise insert `application`, copy the CV from Drive into Storage, queue `screen_application`.
3. Advance `last_imported_row`.

**A row that fails is recorded and skipped.** It never blocks the rows behind it — one malformed submission must not stop intake for a whole posting.

**Separate slower sweep** (`last_sweep_at`, every ~15 min) re-reads the full response range to satisfy **FR-64** (edits at source reflected) and **FR-65** (deleted rows flagged, application retained as `deleted_at_source`).

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
| Terminal failure | `screen_application` → `needs_manual_review` with reason. `import_submissions` → posting flagged, admin notified |
| Stuck jobs | `locked_at` older than 10 minutes is reclaimed |
| Idempotency | Every handler is safe to run twice. Screening inserts a new row rather than updating, so a duplicate run costs money, not correctness |

**Rule.** One job = one unit of work. One application, one posting, one export. Never one opening's worth of anything.

---

## 8. Routes and rendering

| Route | Rendering | Notes |
|---|---|---|
| `/` | Server, per request | Home overview (**FR-76** – **FR-80**). Counts must be current |
| `/postings/new` | Server shell + client form | Multi-step creation |
| `/postings/[postingId]` | Server, per request | Openings, form connection, unmatched queue |
| `/postings/[postingId]/openings/[openingId]` | Server shell, client data | The pipeline |
| `/settings/organization` | Server, per request | Org profile: name, legal name, website, industry, size, location, timezone, currency, logo |
| `/settings/connections` | Server, per request | Google connection |
| `/settings/screening` | Server, per request | Provider and key (**FR-81** – **FR-83**) |
| `/no-access` | Server | Shown to a signed-in user with no membership (§3.1) |
| `/auth/callback` | Route handler | OAuth return |
| `/api/cron/jobs` | Route handler | Runner. Secret-guarded |
| `/api/cron/retention` | Route handler | Daily. Secret-guarded |

**Rule.** No organization-scoped response is cached at the CDN. Candidate data is private and changes constantly; a cache hit across organizations is the worst possible bug.

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

## 11. Retention (TechDecisions §8)

```
kind: purge_expired
schedule: daily
```

- On posting close: `purge_after = closed_at + 6 months`.
- 30 days before: notify the admin, set `purge_warned_at`.
- At expiry, for each application: delete the CV from Storage, null the CV paths, clear personal fields on `candidate` and `form_answers`/`admin_overrides`, clear `strengths`/`gaps`/`overall_read` on screenings, set `purged_at`.
- **Retained:** component ratings, overall score, stage, disposition, dates.

**Rule.** Purge is irreversible and deletes real people's data. It runs only against postings whose `purge_after` has genuinely passed, it is logged, and it is the one job that must be tested before it ever runs in production.

The admin's Drive copies are untouched — we hold no write scope. Any candidate-facing wording must say "deleted from Ziphyre".

---

## 12. Secrets and sensitive data

| Item | Handling |
|---|---|
| Provider API key | Encrypted at rest. Never selected client-side. `key_hint` (last 4) is all the UI sees |
| Google refresh token | Encrypted at rest. Server-only |
| CVs | Storage bucket, no public access, time-limited signed URLs generated per view |
| Cron routes | Guarded by a shared secret; unauthenticated calls rejected |

**Rule.** No secret is ever placed in a browser-exposed environment variable. This is the most common way an AI-assisted build leaks a key.

**Key validation on save** (**FR-83**): a test call at settings time, so a bad key fails in front of the admin rather than silently at 2am. On failure, new applications land as `needs_manual_review` with the reason stated.

---

## 13. Failure modes

| Failure | Behaviour | Requirement |
|---|---|---|
| Google access revoked | Imports stop, posting banner, existing CVs still readable from our Storage | **FR-4** |
| Sheet unreachable | Import retries; no data loss; `last_imported_row` unchanged | — |
| CV unreadable | `needs_manual_review`, stays at New, specific reason, retry available | **FR-47**, **FR-48** |
| Provider down / no key | Same as above, reason names the provider or settings | **FR-83** |
| Structured output invalid | Retry; never partially saved | — |
| Job exceeds time limit | Reclaimed after 10 min, retried | — |
| Row deleted at source | Application retained, `deleted_at_source` | **FR-65** |
| Duplicate submission | Updates in place, previous CV retained, rescreen queued | **FR-36** |
| Unknown dropdown option | `unmatched_submission`, surfaced for assignment | **FR-28**, **FR-29** |

**Invariant across all of them:** an external failure may delay screening; it may never lose a candidate.

---

## 14. Testing

| Area | Test |
|---|---|
| Score computation | `overall` = mean of five components, one decimal — **FR-41** |
| Must-have evaluation | One verdict per must-have; missing entry fails validation — **FR-43** |
| Dedup | Second submission updates, never inserts — **FR-36** |
| Unreadable detection | Scanned PDF → `needs_manual_review`, not a zero score — **FR-47** |
| Not-provided filtering | Excluded and counted, never silently dropped — **FR-68** |
| Stage history | Pointer and latest event always agree; batch writes one event per application — **FR-55**, **FR-59** |
| Purge | Deletes exactly the expired set, retains anonymised scores |
| Tenant isolation | A second organization's data is unreachable through every client path |

**Not unit-tested:** provider responses (mocked at the boundary), Google services, component rendering.

**Screening quality is not a unit test.** It is the seven CA CVs against `Testing/baseline-ranking-CA-role.md`, run as a repeatable exercise on every prompt or model change.

---

## 15. Build order

Sequenced so screening quality is proven before any Google work is built.

| Milestone | Contains | Done when |
|---|---|---|
| **M0 — Foundations** | Schema, RLS, auth, seed-admin bootstrap, organization profile settings, job runner | The seed admin signs in and lands in a new organization; a second Google account is refused with the no-access screen; org details can be edited; a no-op job runs on cron |
| **M1 — Openings** | Posting, opening, JD versions, requirement extraction and marking | The pilot CA JD produces a requirement list that can be edited and marked |
| **M2 — Screening** | Manual upload, CV storage, screening pipeline, provider settings | **The seven CA CVs are screened and compared against the baseline.** This is rollout stage 1 |
| **M3 — Google** | Connection, form matching, import job, unmatched queue | A real submission reaches the pipeline unaided |
| **M4 — Pipeline** | Stages, batch actions, disposition, CV viewer, reassignment | A role can be worked end to end |
| **M5 — Filters & export** | Filtering, sorting, all three export formats | A shortlist can be filtered and sent |
| **M6 — Overview & retention** | Home counts, mobile layout, purge job | Rahul's glance works on a phone; purge tested |

**M2 needs no Google integration at all.** Manual upload alone exercises the entire screening path, so the riskiest question in the product — is the ranking trustworthy — is answered before a single line of OAuth is written. If the answer is no, M3 through M6 were never wasted.

---

## 16. Traceability

| Requirement group | Where implemented |
|---|---|
| FR-1 – FR-4 | §5.1 Connection |
| FR-5 – FR-12 | §2 `posting`, `opening`, `jd_version` |
| FR-13 – FR-18 | §6.6 Extraction, §2 `requirement` |
| FR-19 – FR-25 | Form template (external artefact) + §5.2 matching |
| FR-26 – FR-29 | §5.2, §5.3, `unmatched_submission` |
| FR-30 – FR-37 | §5.3 Import, §2.4 Not-provided, unique constraint |
| FR-38 – FR-51 | §6 Screening pipeline |
| FR-52 – FR-65 | §9 Pipeline behaviour |
| FR-66 – FR-70 | §9 Filtering |
| FR-71 – FR-75 | §10 Exports |
| FR-76 – FR-80 | §8 Routes — `/` |
| FR-81 – FR-83 | §12 Secrets, `provider_settings` |
| FR-84 | §2.2, §2.1 cascade chain (`opening → application → screening`/`stage_event`, `posting → unmatched_submission`) |

---

## 17. Open questions

1. **Reassignment collision** — resolved here as a refusal (§9). Confirm that's the behaviour you want, versus merging the two applications.
2. **Export download lifetime** — a bundled-CV export produces a time-limited link. How long should it live? It contains CVs.
3. **Purge notification route** — the 30-day warning has to reach the admin, but there is no email capability in this build. In-app only, or does this justify the first transactional email?
*Resolved 16 Aug 2026: organization profile fields confirmed as specified in §2.1; currency and timezone confirmed as organization-level rather than per opening.*

---

## 18. Change log

| Version | Date | Change |
|---|---|---|
| Draft 4 | 22 Aug 2026 | `provider_settings.provider` constraint changed from `('claude','gemini','openai')` to `('openai','google','nvidia')`, matching the revised FR-81 list. Caught before any key was stored: the live CHECK constraint would have rejected all three new provider ids at save time. Rolled forward in migration `20260822140000` rather than editing the applied one |
| Draft 3 | 21 Aug 2026 | Posting deletion confirmed as an actual product decision (**FR-84**, functional spec) rather than an unconfirmed assumption. Fixed a real schema gap this surfaced: `application.opening_id`, `screening.application_id`, `stage_event.application_id` and `unmatched_submission.posting_id` had no cascade — deleting a posting as specified would have failed on a foreign-key violation rather than actually deleting anything. All four now cascade |
| Draft 2 | 16 Aug 2026 | Workspace renamed Organization throughout, with profile fields (legal name, website, industry, size, location, timezone, currency, logo) and its own settings screen. Membership split out of `app_user` so the permission layer lands without touching every table — role and invite columns present, role constrained to `admin` for now. Organization bootstrap decided: a seed-admin email creates the org on first sign-in, everyone else is refused until invited. Closes the M0 open question |
| Draft 1 | 16 Aug 2026 | First tech spec, from functional spec Draft 2 and TechDecisions Draft 2. Three decisions beyond the functional spec, all marked: append-only history with a denormalised current pointer; reassignment collision refused rather than merged; must-have verdicts required per requirement id with a missing entry treated as a validation failure rather than an implied pass |
