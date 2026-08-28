-- M7 — Candidate communications
-- PN-004, functional spec Draft 9 (FR-106 – FR-135), tech spec Draft 8 §10A.
--
-- Ziphyre's first outbound path and its second public surface. Two
-- things in here exist because a candidate is a real person on the far
-- end: `message` keeps the rendered body rather than only a template
-- reference, and `application.status_token` is nulled by the purge
-- rather than left pointing at deleted data.
--
-- NEVER modify this file once applied. Roll forward with a new migration.

-- ---------------------------------------------------------------------
-- 1. The sending identity (FR-113, FR-130) — one per organisation
-- ---------------------------------------------------------------------

create table public.mail_settings (
  organization_id        uuid primary key references public.organization(id) on delete cascade,
  from_email             text not null,
  from_name              text,
  -- Same handling as provider keys: AES-256-GCM under
  -- SETTINGS_ENCRYPTION_KEY, never returned to the browser. This is a
  -- Gmail *app password*, which requires 2-Step Verification on the
  -- account — not the account password.
  app_password_encrypted bytea not null,
  password_hint          text,
  verified_at            timestamptz,
  -- FR-130. Ziphyre carries this link; it does not read or write a
  -- calendar (Non-Goal 5, and PN-004 Option C on why not).
  booking_url            text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create trigger mail_settings_set_updated_at
  before update on public.mail_settings
  for each row execute function public.set_updated_at();

-- FR-131. Null means "use the organisation's link".
alter table public.opening add column booking_url text;

-- ---------------------------------------------------------------------
-- 2. Templates (FR-126 – FR-129) — APPEND ONLY
-- ---------------------------------------------------------------------

create table public.message_template (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization(id) on delete cascade,
  kind            text not null check (kind in (
                    'application_received',
                    'interview_invite',
                    'outcome_rejected',
                    'general_update'
                  )),
  version         int not null,
  subject         text not null,
  body            text not null,
  created_at      timestamptz not null default now(),
  created_by      uuid references public.app_user(id),
  unique (organization_id, kind, version)
);

create index message_template_current_idx
  on public.message_template (organization_id, kind, version desc);

-- ---------------------------------------------------------------------
-- 3. The outbox (FR-111, FR-112, FR-133)
-- ---------------------------------------------------------------------

create table public.message (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization(id),
  application_id  uuid not null references public.application(id) on delete cascade,
  template_id     uuid references public.message_template(id),
  kind            text not null,
  -- The address as it was actually sent to, not one looked up later:
  -- a candidate's address could change, and the outbox records history.
  to_email        text not null,
  -- The RENDERED subject and body, not just a template pointer. FR-129
  -- promises that what was said to a candidate stays recoverable, and a
  -- template id stops being an answer the moment the template is edited.
  subject         text not null,
  body            text not null,
  status          text not null default 'queued'
                    check (status in ('queued', 'sent', 'failed')),
  error           text,
  sent_at         timestamptz,
  -- Null for the application-received message (FR-117), which is the
  -- only one no person chose to send.
  sent_by         uuid references public.app_user(id),
  created_at      timestamptz not null default now()
);

create index message_application_idx on public.message (application_id, created_at desc);
create index message_org_created_idx on public.message (organization_id, created_at desc);

-- ---------------------------------------------------------------------
-- 4. The status page (FR-119, FR-123, FR-124)
-- ---------------------------------------------------------------------

-- 32 random bytes, base64url — the same unguessable shape as
-- posting.apply_token, so status pages cannot be enumerated.
alter table public.application add column status_token text;

update public.application
set status_token = translate(encode(gen_random_bytes(32), 'base64'), '+/=', '-_')
where status_token is null;

alter table public.application alter column status_token set not null;
alter table public.application add constraint application_status_token_key unique (status_token);

-- FR-123's gate, as a column rather than a query. The status page is
-- anonymous and hit on every refresh; asking "has a successful
-- outcome_rejected message been sent?" as a join on each request would
-- be work, and this is read far more often than it is written.
alter table public.application add column outcome_sent_at timestamptz;

-- ---------------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------------

alter table public.mail_settings    enable row level security;
alter table public.message_template enable row level security;
alter table public.message          enable row level security;

create policy mail_settings_all on public.mail_settings for all
  using (organization_id in (select public.current_org_ids()))
  with check (organization_id in (select public.current_org_ids()));

-- Append-only, like jd_version: a saved template is a new version, and
-- the absence of an update policy is what enforces FR-129.
create policy message_template_read on public.message_template for select
  using (organization_id in (select public.current_org_ids()));
create policy message_template_insert on public.message_template for insert
  with check (organization_id in (select public.current_org_ids()));

-- The outbox is readable by the organisation; rows are written by the
-- send path and updated by the job runner's admin client, never from
-- the browser.
create policy message_read on public.message for select
  using (organization_id in (select public.current_org_ids()));
