-- Multiple provider keys per organization, with an explicit fallback
-- order (revises FR-81/FR-82).
-- Applied to project tkfxxhmserqkeoghyjmx on 22 Aug 2026.
-- NEVER modify this file once applied. Roll forward with a new migration.
--
-- Previously organization_id was the primary key, so saving a second
-- provider silently replaced the first — the admin appeared to have
-- three providers configured while only the last one was stored.
-- Now each organization can hold one row per provider, tried in
-- `priority` order (lowest first) until one succeeds.

alter table public.provider_settings
  drop constraint provider_settings_pkey;

alter table public.provider_settings
  add column id uuid not null default gen_random_uuid();

alter table public.provider_settings
  add primary key (id);

-- One row per provider per organization — re-saving a provider updates
-- its key rather than adding a duplicate.
alter table public.provider_settings
  add constraint provider_settings_org_provider_key
  unique (organization_id, provider);

-- Lower is tried first. 0 is the primary provider.
alter table public.provider_settings
  add column priority int not null default 0;

create index provider_settings_org_priority_idx
  on public.provider_settings (organization_id, priority);
