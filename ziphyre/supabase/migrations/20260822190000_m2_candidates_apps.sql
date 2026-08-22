-- M2 — Candidates and applications
-- Tech spec §2.1 (candidate, application). Manual upload only in this
-- milestone — google_connection and unmatched_submission are M3.
-- NEVER modify this file once applied. Roll forward with a new migration.

create extension if not exists citext;

create table public.candidate (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization(id),
  email           citext not null,
  full_name       text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, email)
);

create trigger candidate_set_updated_at
  before update on public.candidate
  for each row execute function public.set_updated_at();

create table public.application (
  id                        uuid primary key default gen_random_uuid(),
  organization_id           uuid not null references public.organization(id),
  opening_id                uuid not null references public.opening(id) on delete cascade,
  candidate_id              uuid not null references public.candidate(id),
  source                    text not null check (source in ('form','manual')),
  form_answers              jsonb not null default '{}'::jsonb,
  admin_overrides           jsonb not null default '{}'::jsonb,
  cv_storage_path           text,
  cv_drive_file_id          text,
  cv_mime                   text,
  cv_original_filename      text,
  previous_cv_storage_path  text,
  source_row_number         int,
  source_status             text not null default 'present'
                               check (source_status in ('present','deleted_at_source','manual')),
  submitted_at              timestamptz,
  resubmitted_at            timestamptz,
  current_stage             text not null default 'new'
                               check (current_stage in ('new','screened','shortlisted','on_hold','rejected')),
  screening_status          text not null default 'pending'
                               check (screening_status in ('pending','in_progress','complete','needs_manual_review')),
  screening_failure_reason  text,
  current_screening_id      uuid,
  purged_at                 timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  unique (opening_id, candidate_id)
);

create index application_org_opening_stage_idx
  on public.application (organization_id, opening_id, current_stage);
create index application_org_opening_screening_idx
  on public.application (organization_id, opening_id, screening_status);

create trigger application_set_updated_at
  before update on public.application
  for each row execute function public.set_updated_at();

alter table public.candidate   enable row level security;
alter table public.application enable row level security;

create policy candidate_all on public.candidate for all
  using (organization_id in (select public.current_org_ids()))
  with check (organization_id in (select public.current_org_ids()));

create policy application_all on public.application for all
  using (organization_id in (select public.current_org_ids()))
  with check (organization_id in (select public.current_org_ids()));
