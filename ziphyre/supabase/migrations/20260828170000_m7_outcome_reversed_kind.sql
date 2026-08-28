-- M7 — a template kind for a reversed outcome
--
-- The reversal message reused `general_update`, whose default body is
-- deliberately a blank to fill in: "[Write your update here.]". With no
-- template editor built yet, that placeholder was sendable — it would
-- have reached a real candidate verbatim.
--
-- A reversal is not a general update. It says one specific thing, it can
-- be written properly in advance, and giving it its own kind is what
-- stops a fill-in-the-blank template being sent unfilled. `general_update`
-- keeps its placeholder, which is correct for what it is: nothing sends
-- it automatically.
--
-- NEVER modify this file once applied. Roll forward with a new migration.

alter table public.message_template drop constraint message_template_kind_check;

alter table public.message_template add constraint message_template_kind_check
  check (kind in (
    'application_received',
    'interview_invite',
    'outcome_rejected',
    'outcome_reversed',
    'general_update'
  ));
