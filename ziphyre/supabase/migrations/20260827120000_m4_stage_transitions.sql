-- M4 — Admin stage transitions
-- Functional spec Draft 7 FR-56–FR-60, tech spec Draft 6 §9.
--
-- Until now the only stage change in the product was screening's own
-- new -> screened, written by record_screening() from the job runner's
-- admin client. Everything else — Shortlisted, On hold, Rejected, and
-- moving back — belongs to the admin, and there was no way to make it.
--
-- stage_event has no insert policy for `authenticated` and never will:
-- tech spec §3 makes the *absence* of update/delete policies the
-- enforcement for FR-59, and an insert policy would let the browser
-- write history without touching the pointer. So admin stage changes
-- go through a security-definer function too, for the same reason
-- record_screening does — the history insert and the pointer update
-- have to commit together or not at all.
--
-- NEVER modify this file once applied. Roll forward with a new migration.

-- ---------------------------------------------------------------------
-- 1. Disposition vocabulary (FR-58)
-- ---------------------------------------------------------------------

-- Constrained in the database, not only in the UI. The functional spec
-- fixes this list; a typo'd or invented disposition would quietly break
-- the export column (FR-71) that reports on it.
alter table public.stage_event
  add constraint stage_event_disposition_check
  check (
    disposition is null
    or disposition in (
      'must_haves',
      'experience',
      'location',
      'ctc',
      'better_candidates',
      'other'
    )
  );

-- FR-57 scopes disposition to On hold and Rejected. Recording "why" on
-- a shortlisting is a different question with a different answer set,
-- and allowing it here would put unanswerable values in the export.
alter table public.stage_event
  add constraint stage_event_disposition_stage_check
  check (
    disposition is null
    or to_stage in ('on_hold', 'rejected')
  );

-- ---------------------------------------------------------------------
-- 2. record_stage_change (FR-56, FR-57, FR-59)
-- ---------------------------------------------------------------------

-- Returns the stage moved from, so the caller can report the change
-- honestly rather than assuming it knew the starting point. Raises
-- rather than returning null on every refusal: a stage change that
-- silently does nothing is worse than one that fails loudly.
--
-- SECURITY DEFINER bypasses RLS, so this checks membership itself.
-- record_screening() did not need to — it is only ever called by the
-- job runner's admin client — but this one is reachable from a Server
-- Action with a user-supplied application id.
create or replace function public.record_stage_change(
  p_application_id uuid,
  p_to_stage       text,
  p_actor_id       uuid,
  p_disposition    text default null,
  p_note           text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org        uuid;
  v_from_stage text;
begin
  if p_to_stage not in ('new','screened','shortlisted','on_hold','rejected') then
    raise exception 'unknown stage %', p_to_stage;
  end if;

  select organization_id, current_stage into v_org, v_from_stage
  from public.application
  where id = p_application_id
  for update;

  if v_org is null then
    raise exception 'application % not found', p_application_id;
  end if;

  -- The actor must be an active member of the organisation that owns
  -- the application. Without this, definer rights would let any signed
  -- in user move any other organisation's candidates.
  if not exists (
    select 1 from public.membership
    where user_id = p_actor_id
      and organization_id = v_org
      and status = 'active'
  ) then
    raise exception 'actor % has no active membership in organization %',
      p_actor_id, v_org;
  end if;

  -- A no-op move writes no history. FR-59 is about recording decisions
  -- that changed something; a row saying "Rejected -> Rejected" is
  -- noise in the one place that has to stay readable, and batch actions
  -- make it easy to produce by accident when a selection already
  -- contains candidates at the target stage.
  if v_from_stage = p_to_stage then
    return v_from_stage;
  end if;

  insert into public.stage_event (
    organization_id, application_id, from_stage, to_stage,
    actor_kind, actor_id, disposition, note
  ) values (
    v_org, p_application_id, v_from_stage, p_to_stage,
    'admin', p_actor_id,
    -- Belt and braces with the check constraint above: the UI hides
    -- disposition for Shortlisted, but a caller could still send it.
    case when p_to_stage in ('on_hold','rejected') then p_disposition end,
    nullif(btrim(coalesce(p_note, '')), '')
  );

  update public.application
  set current_stage = p_to_stage
  where id = p_application_id;

  return v_from_stage;
end;
$$;

revoke all on function public.record_stage_change(uuid, text, uuid, text, text) from public;
grant execute on function public.record_stage_change(uuid, text, uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 3. reassign_application (FR-60)
-- ---------------------------------------------------------------------

-- Tech spec §9 records the collision as a [new decision]: the unique
-- constraint on (opening_id, candidate_id) means a candidate who has
-- already applied to the target opening cannot be moved there, and that
-- has to read as an explanation rather than a constraint violation.
--
-- Checking and moving in one locked statement rather than checking from
-- the application layer and hoping: two admins reassigning the same
-- candidate at the same moment would both pass a pre-check.
--
-- Returns the target opening's title for the confirmation message.
create or replace function public.reassign_application(
  p_application_id     uuid,
  p_target_opening_id  uuid,
  p_actor_id           uuid
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org            uuid;
  v_candidate_id   uuid;
  v_current_opening uuid;
  v_source_posting uuid;
  v_target_posting uuid;
  v_target_title   text;
begin
  select a.organization_id, a.candidate_id, a.opening_id, o.posting_id
    into v_org, v_candidate_id, v_current_opening, v_source_posting
  from public.application a
  join public.opening o on o.id = a.opening_id
  where a.id = p_application_id
  for update of a;

  if v_org is null then
    raise exception 'application % not found', p_application_id;
  end if;

  if not exists (
    select 1 from public.membership
    where user_id = p_actor_id
      and organization_id = v_org
      and status = 'active'
  ) then
    raise exception 'actor % has no active membership in organization %',
      p_actor_id, v_org;
  end if;

  select posting_id, title into v_target_posting, v_target_title
  from public.opening
  where id = p_target_opening_id
    and organization_id = v_org;

  if v_target_posting is null then
    raise exception 'opening % not found', p_target_opening_id;
  end if;

  -- FR-60 is "a different opening within the same posting". Moving
  -- across postings would move a candidate to a role they never applied
  -- for, under a different application link.
  if v_target_posting <> v_source_posting then
    raise exception 'ZIPHYRE_DIFFERENT_POSTING';
  end if;

  if v_current_opening = p_target_opening_id then
    raise exception 'ZIPHYRE_SAME_OPENING';
  end if;

  if exists (
    select 1 from public.application
    where opening_id = p_target_opening_id
      and candidate_id = v_candidate_id
  ) then
    raise exception 'ZIPHYRE_ALREADY_APPLIED';
  end if;

  update public.application
  set opening_id = p_target_opening_id
  where id = p_application_id;

  return v_target_title;
end;
$$;

revoke all on function public.reassign_application(uuid, uuid, uuid) from public;
grant execute on function public.reassign_application(uuid, uuid, uuid) to authenticated;
