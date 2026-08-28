-- M7 — let the purge null a status token
-- Tech spec §10A.5, §11.
--
-- `status_token` was created NOT NULL because every live application
-- must have exactly one status page. §10A.5 requires the purge to null
-- it, so that a bookmarked `/status/<token>` stops resolving once the
-- data behind it is gone — a public URL outliving the data it describes
-- breaks the promise the apply page makes.
--
-- Dropping NOT NULL is the whole change. The unique constraint stays:
-- Postgres does not treat NULLs as equal, so any number of purged
-- applications can hold a null token while every live one stays unique.
--
-- FR-124 is unaffected. A token is still issued exactly once and never
-- reissued; nulling it at purge is the end of its life, not a second
-- one.
--
-- NEVER modify this file once applied. Roll forward with a new migration.

alter table public.application alter column status_token drop not null;
