-- M3 — Google connection and unmatched submissions
-- Tech spec §2.1 (google_connection, unmatched_submission), §5.1–§5.3.
-- NEVER modify this file once applied. Roll forward with a new migration.

create table public.google_connection (
  id                      uuid primary key default gen_random_uuid(),
  organization_id         uuid not null unique references public.organization(id) on delete cascade,
  google_email            text not null,
  refresh_token_encrypted bytea not null,
  scopes                  text[] not null,
  status                  text not null default 'active'
                            check (status in ('active','needs_reconnect')),
  connected_by            uuid references public.app_user(id),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create trigger google_connection_set_updated_at
  before update on public.google_connection
  for each row execute function public.set_updated_at();

create table public.unmatched_submission (
  id                      uuid primary key default gen_random_uuid(),
  organization_id         uuid not null references public.organization(id),
  posting_id              uuid not null references public.posting(id) on delete cascade,
  claimed_option          text,
  raw_answers             jsonb not null,
  cv_drive_file_id        text,
  source_row_number       int,
  resolved_application_id uuid references public.application(id) on delete set null,
  created_at              timestamptz not null default now()
);

create index unmatched_submission_posting_idx
  on public.unmatched_submission (posting_id)
  where resolved_application_id is null;

alter table public.google_connection    enable row level security;
alter table public.unmatched_submission enable row level security;

-- refresh_token_encrypted must never be selected by the browser client.
-- Postgres RLS is row-level, not column-level — this is enforced by
-- application code selecting specific columns, exactly as it is for
-- provider_settings.api_key_encrypted (see the M1 migration).
create policy google_connection_all on public.google_connection for all
  using (organization_id in (select public.current_org_ids()))
  with check (organization_id in (select public.current_org_ids()));

create policy unmatched_submission_all on public.unmatched_submission for all
  using (organization_id in (select public.current_org_ids()))
  with check (organization_id in (select public.current_org_ids()));
