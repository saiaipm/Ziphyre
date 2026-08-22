-- M2 — Background job queue
-- Tech spec §2.1 (job), §7 (claim strategy, retries, reclaiming stuck
-- jobs). No RLS policy is granted to any client role — the job table
-- has no client path at all (tech spec §3 exceptions table). Only the
-- service-role admin client (src/lib/supabase/admin.ts) ever touches
-- this table. NEVER modify this file once applied. Roll forward with
-- a new migration.

create table public.job (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization(id),
  kind            text not null,
  payload         jsonb not null,
  status          text not null default 'queued'
                    check (status in ('queued','running','succeeded','failed')),
  attempts        int not null default 0,
  max_attempts    int not null default 5,
  run_after       timestamptz not null default now(),
  locked_at       timestamptz,
  locked_by       text,
  last_error      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index job_queued_idx on public.job (status, run_after)
  where status = 'queued';

create trigger job_set_updated_at
  before update on public.job
  for each row execute function public.set_updated_at();

alter table public.job enable row level security;
-- No policies at all. RLS enabled with zero policies denies every row
-- to anon/authenticated by default; service_role bypasses RLS by
-- design, which is the only path that is meant to reach this table.

-- Atomic claim: `for update skip locked` means two concurrent runner
-- invocations can never claim the same row (tech spec §7).
create or replace function public.claim_next_job(p_kinds text[], p_worker text)
returns setof public.job
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.job
  set status = 'running', locked_at = now(), locked_by = p_worker,
      attempts = attempts + 1
  where id = (
    select id from public.job
    where status = 'queued'
      and run_after <= now()
      and kind = any(p_kinds)
    order by run_after asc
    for update skip locked
    limit 1
  )
  returning *;
end;
$$;

revoke all on function public.claim_next_job from public, anon, authenticated;
grant execute on function public.claim_next_job to service_role;
