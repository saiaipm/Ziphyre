-- Provider list revised (FR-81, TechDecisions Draft 5).
-- Claude dropped; NVIDIA NIM added as the open-weight fallback.
-- 'gemini' renamed 'google' to match the provider, not the model family.
-- Applied to project tkfxxhmserqkeoghyjmx on 22 Aug 2026.
--
-- Rolling forward rather than editing 20260822090000 — that migration
-- has been applied, and applied migrations are never modified.
--
-- Caught because the CHECK constraint in the original migration would
-- have rejected every one of the three new provider ids at save time.

update public.provider_settings set provider = 'google' where provider = 'gemini';
delete from public.provider_settings where provider = 'claude';

alter table public.provider_settings
  drop constraint if exists provider_settings_provider_check;

alter table public.provider_settings
  add constraint provider_settings_provider_check
  check (provider in ('openai','google','nvidia'));
