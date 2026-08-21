-- M0 — Core tenancy
-- Tech spec §2.1 (organization, app_user, membership) and §3 (RLS).
-- Applied to project tkfxxhmserqkeoghyjmx on 21 Aug 2026.
-- NEVER modify this file once applied. Roll forward with a new migration.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.organization (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  legal_name       text,
  website          text,
  industry         text,
  size_band        text,
  primary_location text,
  timezone         text not null default 'Asia/Kolkata',
  currency         text not null default 'INR',
  logo_path        text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create trigger organization_set_updated_at
  before update on public.organization
  for each row execute function public.set_updated_at();

create table public.app_user (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text not null,
  display_name text,
  created_at   timestamptz not null default now()
);

create table public.membership (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization(id) on delete cascade,
  user_id         uuid not null references public.app_user(id) on delete cascade,
  role            text not null default 'admin' check (role in ('admin')),
  status          text not null default 'active' check (status in ('active','invited','revoked')),
  invited_by      uuid references public.app_user(id),
  invited_at      timestamptz,
  accepted_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index membership_user_active_idx
  on public.membership (user_id) where status = 'active';

create trigger membership_set_updated_at
  before update on public.membership
  for each row execute function public.set_updated_at();

create or replace function public.current_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id
  from public.membership
  where user_id = auth.uid()
    and status = 'active';
$$;

alter table public.organization enable row level security;
alter table public.app_user     enable row level security;
alter table public.membership   enable row level security;

create policy organization_read on public.organization
  for select using (id in (select public.current_org_ids()));

create policy organization_update on public.organization
  for update using (id in (select public.current_org_ids()))
  with check (id in (select public.current_org_ids()));

create policy app_user_read_self on public.app_user
  for select using (id = auth.uid());

create policy app_user_read_org_peers on public.app_user
  for select using (
    exists (
      select 1 from public.membership m
      where m.user_id = public.app_user.id
        and m.organization_id in (select public.current_org_ids())
    )
  );

create policy membership_read on public.membership
  for select using (organization_id in (select public.current_org_ids()));

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.app_user (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Hardening (security advisor)
revoke all on function public.handle_new_auth_user() from public, anon, authenticated;
revoke all on function public.current_org_ids() from public, anon;
grant execute on function public.current_org_ids() to authenticated;
