-- M3.5 — Native application intake
-- Tech spec Draft 5 §5, functional spec Draft 6 FR-87–FR-100, PN-002.
--
-- Replaces the Google Form path with a Ziphyre-hosted apply page. This
-- rolls forward the whole of 20260823090000_m3_google_connection.sql,
-- applied one day earlier — see tech spec §4 for why that reversal is
-- left visible rather than squashed.
--
-- NON-DESTRUCTIVE to candidate data: the pilot organisation holds a real
-- application that arrived through the retired path. It keeps its
-- candidate, CV, screening and its source='form' provenance.
-- NEVER modify this file once applied. Roll forward.

-- ---------------------------------------------------------------------
-- 1. The public apply link
-- ---------------------------------------------------------------------

alter table public.posting add column apply_token text;

-- Backfill before the not-null constraint. 32 random bytes, base64url —
-- unguessable, so open postings cannot be enumerated (tech spec §5.1).
update public.posting
set apply_token = translate(encode(gen_random_bytes(32), 'base64'), '+/=', '-_')
where apply_token is null;

alter table public.posting alter column apply_token set not null;
alter table public.posting add constraint posting_apply_token_key unique (apply_token);

-- ---------------------------------------------------------------------
-- 2. Identity: email is now given, not proven (PN-002 §3)
-- ---------------------------------------------------------------------

alter table public.candidate
  add column email_verified boolean not null default false;

comment on column public.candidate.email_verified is
  'Always false in v1 — no verification exists yet. Present so enabling '
  'OTP later is a behaviour change, not a migration. PN-002 Decision 3.';

-- ---------------------------------------------------------------------
-- 3. source = 'apply' for self-submitted applications
-- ---------------------------------------------------------------------

alter table public.application drop constraint application_source_check;
alter table public.application add constraint application_source_check
  check (source in ('apply', 'manual', 'form'));

comment on column public.application.source is
  'apply = the candidate submitted through the public page. '
  'manual = the admin uploaded a CV. '
  'form = legacy, imported by the retired Google Sheet path.';

-- ---------------------------------------------------------------------
-- 4. Rate limiting for the public surface (tech spec §5.3)
-- ---------------------------------------------------------------------

create table public.apply_attempt (
  id         uuid primary key default gen_random_uuid(),
  posting_id uuid not null references public.posting(id) on delete cascade,
  ip_hash    text not null,
  created_at timestamptz not null default now()
);

create index apply_attempt_lookup_idx
  on public.apply_attempt (posting_id, ip_hash, created_at desc);

alter table public.apply_attempt enable row level security;
-- No policies. Written and read only by the public intake handlers via
-- the service-role client, same rule as `job` (tech spec §3).

-- ---------------------------------------------------------------------
-- 5. Drop the Google path
-- ---------------------------------------------------------------------

drop table if exists public.unmatched_submission;
drop table if exists public.google_connection;

alter table public.posting
  drop column if exists form_id,
  drop column if exists spreadsheet_id,
  drop column if exists form_connected_at,
  drop column if exists last_imported_row,
  drop column if exists last_import_at,
  drop column if exists last_sweep_at;

-- Existed solely to match a Google Form dropdown string exactly.
-- The apply page reads openings from this table by id instead.
alter table public.opening drop column if exists form_option_value;

alter table public.application
  drop column if exists cv_drive_file_id,
  drop column if exists source_row_number,
  drop column if exists previous_cv_storage_path,
  drop column if exists resubmitted_at;

-- 'deleted_at_source' described a Google Sheet row that vanished. No
-- source can diverge from us now, so the value is unreachable.
alter table public.application drop constraint application_source_status_check;
alter table public.application add constraint application_source_status_check
  check (source_status in ('present', 'manual'));
