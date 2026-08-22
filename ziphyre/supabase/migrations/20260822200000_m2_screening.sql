-- M2 — Screening pipeline history
-- Tech spec §2.1 (screening, stage_event), §2.2 (append-only + a
-- denormalised current pointer, kept consistent in one transaction),
-- §3 (select-only RLS — the missing update/delete policy IS the
-- enforcement for FR-50 and FR-59). NEVER modify this file once
-- applied. Roll forward with a new migration.

create table public.screening (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references public.organization(id),
  application_id         uuid not null references public.application(id) on delete cascade,
  jd_version_id          uuid not null references public.jd_version(id),
  prompt_version         text not null,
  provider               text not null,
  model                  text not null,
  jd_fit                 int not null check (jd_fit between 0 and 10),
  experience             int not null check (experience between 0 and 10),
  skills                 int not null check (skills between 0 and 10),
  qualification          int not null check (qualification between 0 and 10),
  location               int not null check (location between 0 and 10),
  overall                numeric(3,1) not null,
  must_have_result       jsonb not null,
  meets_all_must_haves   boolean not null,
  strengths              text not null,
  gaps                   text not null,
  overall_read           text not null,
  experience_discrepancy text,
  created_at             timestamptz not null default now()
);

create index screening_application_idx
  on public.screening (application_id, created_at desc);

create table public.stage_event (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization(id),
  application_id  uuid not null references public.application(id) on delete cascade,
  from_stage      text,
  to_stage        text not null,
  actor_kind      text not null check (actor_kind in ('admin','system')),
  actor_id        uuid references public.app_user(id),
  disposition     text,
  note            text,
  created_at      timestamptz not null default now()
);

create index stage_event_application_idx
  on public.stage_event (application_id, created_at desc);

alter table public.application
  add constraint application_current_screening_fk
  foreign key (current_screening_id) references public.screening(id);

alter table public.screening   enable row level security;
alter table public.stage_event enable row level security;

-- Select-only. No update/delete policy exists for anyone — the
-- absence of the policy is the enforcement (tech spec §3).
create policy screening_read on public.screening for select
  using (organization_id in (select public.current_org_ids()));

create policy stage_event_read on public.stage_event for select
  using (organization_id in (select public.current_org_ids()));

-- Inserts happen only through record_screening() below, called by the
-- background screening job's admin client — never from the browser.
-- Deliberately no insert policy for authenticated.

-- Inserts the screening row, inserts the new->screened stage_event
-- (only when the application is still New — FR-55), and updates
-- application's denormalised pointer, all in one function body so
-- Postgres commits them as one transaction. A pointer that disagrees
-- with its history is, per the tech spec, the worst failure this
-- schema can produce — this makes that structurally impossible rather
-- than a discipline the caller has to get right every time.
create or replace function public.record_screening(
  p_application_id         uuid,
  p_jd_version_id          uuid,
  p_prompt_version         text,
  p_provider               text,
  p_model                  text,
  p_jd_fit                 int,
  p_experience             int,
  p_skills                 int,
  p_qualification          int,
  p_location               int,
  p_overall                numeric,
  p_must_have_result       jsonb,
  p_meets_all_must_haves   boolean,
  p_strengths              text,
  p_gaps                   text,
  p_overall_read           text,
  p_experience_discrepancy text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org   uuid;
  v_stage text;
  v_id    uuid;
begin
  select organization_id, current_stage into v_org, v_stage
  from public.application
  where id = p_application_id
  for update;

  if v_org is null then
    raise exception 'application % not found', p_application_id;
  end if;

  insert into public.screening (
    organization_id, application_id, jd_version_id, prompt_version,
    provider, model, jd_fit, experience, skills, qualification, location,
    overall, must_have_result, meets_all_must_haves, strengths, gaps,
    overall_read, experience_discrepancy
  ) values (
    v_org, p_application_id, p_jd_version_id, p_prompt_version,
    p_provider, p_model, p_jd_fit, p_experience, p_skills, p_qualification,
    p_location, p_overall, p_must_have_result, p_meets_all_must_haves,
    p_strengths, p_gaps, p_overall_read, p_experience_discrepancy
  )
  returning id into v_id;

  -- FR-55: only a New application auto-advances to Screened. A
  -- rescreen of an application the admin already moved on records a
  -- new score but never moves the stage back — every other stage
  -- change belongs to the admin, not the system.
  if v_stage = 'new' then
    insert into public.stage_event (
      organization_id, application_id, from_stage, to_stage, actor_kind
    ) values (v_org, p_application_id, v_stage, 'screened', 'system');
  end if;

  update public.application
  set current_screening_id = v_id,
      screening_status = 'complete',
      screening_failure_reason = null,
      current_stage = case when v_stage = 'new' then 'screened' else v_stage end
  where id = p_application_id;

  return v_id;
end;
$$;

revoke all on function public.record_screening from public, anon, authenticated;
grant execute on function public.record_screening to service_role;
