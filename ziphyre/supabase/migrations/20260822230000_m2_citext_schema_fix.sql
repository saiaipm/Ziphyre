-- M2 — Move citext out of the public schema
-- Caught by the Supabase security linter right after
-- 20260822190000_m2_candidates_apps.sql: extensions installed in
-- `public` are flagged (lint 0014). Moves it to the conventional
-- `extensions` schema instead. NEVER modify this file once applied.

create schema if not exists extensions;
alter extension citext set schema extensions;

-- candidate.email's type must resolve regardless of search_path.
alter table public.candidate alter column email type extensions.citext;
