-- M8 — Sample data (PN-005, tech spec §10B)
--
-- Two columns, and the whole feature is the application code that
-- reads them. `posting.is_sample` marks a seeded, fabricated pipeline;
-- `organization.show_sample_data` is the toggle an org controls in
-- Settings. Default false / true respectively, so every existing row
-- is untouched by this migration on its own — nothing changes until a
-- sample posting actually exists.
--
-- NEVER modify this file once applied. Roll forward with a new migration.

alter table public.posting add column is_sample boolean not null default false;
alter table public.organization add column show_sample_data boolean not null default true;
