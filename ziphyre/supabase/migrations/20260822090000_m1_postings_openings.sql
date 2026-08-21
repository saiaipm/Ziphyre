-- M1 — Postings, Openings, JD versions, Requirements, Provider settings
-- Tech spec §2.1. provider_settings pulled forward from M2 because
-- requirement extraction (FR-13) needs a working AI key to run.
-- Applied to project tkfxxhmserqkeoghyjmx on 22 Aug 2026.
-- NEVER modify this file once applied. Roll forward with a new migration.

create table public.posting (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organization(id),
  name               text not null,
  status             text not null default 'open'
                       check (status in ('open','closed')),
  form_id            text,
  spreadsheet_id     text,
  form_connected_at  timestamptz,
  last_imported_row  int not null default 1,
  last_import_at     timestamptz,
  last_sweep_at      timestamptz,
  closed_at          timestamptz,
  purge_after        timestamptz,
  purge_warned_at    timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index posting_org_status_idx on public.posting (organization_id, status);

create trigger posting_set_updated_at
  before update on public.posting
  for each row execute function public.set_updated_at();

create table public.opening (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references public.organization(id),
  posting_id             uuid not null references public.posting(id) on delete cascade,
  title                  text not null,
  work_location          text not null,
  form_option_value      text not null,
  current_jd_version_id  uuid,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (posting_id, form_option_value)
);

create index opening_org_posting_idx on public.opening (organization_id, posting_id);

create trigger opening_set_updated_at
  before update on public.opening
  for each row execute function public.set_updated_at();

create table public.jd_version (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization(id),
  opening_id      uuid not null references public.opening(id) on delete cascade,
  version         int not null,
  content         text not null,
  source          text check (source in ('upload','paste')),
  created_at      timestamptz not null default now(),
  unique (opening_id, version)
);

alter table public.opening
  add constraint opening_current_jd_version_fk
  foreign key (current_jd_version_id) references public.jd_version(id);

create table public.requirement (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization(id),
  opening_id      uuid not null references public.opening(id) on delete cascade,
  text            text not null,
  kind            text not null default 'preferred'
                    check (kind in ('must_have','preferred')),
  sort_order      int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index requirement_opening_idx on public.requirement (opening_id, sort_order);

create trigger requirement_set_updated_at
  before update on public.requirement
  for each row execute function public.set_updated_at();

create table public.provider_settings (
  organization_id    uuid primary key references public.organization(id),
  provider           text not null check (provider in ('claude','gemini','openai')),
  model              text not null,
  api_key_encrypted  bytea,
  key_hint           text,
  validated_at       timestamptz,
  updated_at         timestamptz not null default now()
);

create trigger provider_settings_set_updated_at
  before update on public.provider_settings
  for each row execute function public.set_updated_at();

alter table public.posting           enable row level security;
alter table public.opening           enable row level security;
alter table public.jd_version        enable row level security;
alter table public.requirement       enable row level security;
alter table public.provider_settings enable row level security;

create policy posting_all on public.posting for all
  using (organization_id in (select public.current_org_ids()))
  with check (organization_id in (select public.current_org_ids()));

create policy opening_all on public.opening for all
  using (organization_id in (select public.current_org_ids()))
  with check (organization_id in (select public.current_org_ids()));

create policy jd_version_read on public.jd_version for select
  using (organization_id in (select public.current_org_ids()));

create policy jd_version_insert on public.jd_version for insert
  with check (organization_id in (select public.current_org_ids()));

create policy requirement_all on public.requirement for all
  using (organization_id in (select public.current_org_ids()))
  with check (organization_id in (select public.current_org_ids()));

-- api_key_encrypted must never be selected by the browser client.
-- Postgres RLS is row-level, not column-level — this is enforced by
-- application code selecting specific columns, not by the database.
create policy provider_settings_all on public.provider_settings for all
  using (organization_id in (select public.current_org_ids()))
  with check (organization_id in (select public.current_org_ids()));
