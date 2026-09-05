-- NojAds :: 0004_content
-- Content, media assets, version history, publishing attempts, approvals.

create table public.content (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references public.clients(id) on delete cascade,
  task_id           uuid references public.tasks(id) on delete set null,
  task_run_id       uuid references public.task_runs(id) on delete set null,
  platform          public.platform not null,
  social_account_id uuid references public.social_accounts(id) on delete set null,
  format            text not null default 'POST',   -- POST | REEL | STORY | VIDEO | FLYER | CAROUSEL | SHORT
  title             text,
  body              text,
  hashtags          text[] not null default '{}',
  call_to_action    text,
  link_url          text,
  status            public.content_status not null default 'DRAFT',
  scheduled_for     timestamptz,
  timezone          text not null default 'Africa/Luanda',
  published_at      timestamptz,
  external_id       text,
  external_url      text,
  attempts          int not null default 0,
  last_error        jsonb,
  ai_prompt         text,
  ai_model          text,
  ai_metadata       jsonb not null default '{}'::jsonb,
  version           int not null default 1,
  is_demo           boolean not null default false,
  created_by        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index content_client_idx on public.content(client_id, created_at desc);
create index content_status_idx on public.content(status);
create index content_schedule_idx on public.content(scheduled_for) where status = 'SCHEDULED';
create unique index content_external_unique on public.content(platform, external_id)
  where external_id is not null;
create trigger content_touch before update on public.content
  for each row execute function public.touch_updated_at();

create table public.content_assets (
  id           uuid primary key default gen_random_uuid(),
  content_id   uuid references public.content(id) on delete cascade,
  client_id    uuid not null references public.clients(id) on delete cascade,
  kind         text not null default 'IMAGE',   -- IMAGE | VIDEO | AUDIO | FONT | LOGO | TEMPLATE
  storage_path text,
  public_url   text,
  external_url text,
  mime_type    text,
  width        int,
  height       int,
  duration_ms  int,
  bytes        bigint,
  checksum     text,
  source       text not null default 'UPLOAD',  -- UPLOAD | AI | STUDIO | IMPORT
  position     int not null default 0,
  metadata     jsonb not null default '{}'::jsonb,
  is_demo      boolean not null default false,
  created_at   timestamptz not null default now()
);
create index content_assets_content_idx on public.content_assets(content_id, position);
create index content_assets_client_idx on public.content_assets(client_id);

create table public.content_versions (
  id         uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.content(id) on delete cascade,
  version    int not null,
  snapshot   jsonb not null,
  reason     text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (content_id, version)
);

create table public.publishing_jobs (
  id            uuid primary key default gen_random_uuid(),
  content_id    uuid not null references public.content(id) on delete cascade,
  client_id     uuid not null references public.clients(id) on delete cascade,
  platform      public.platform not null,
  social_account_id uuid references public.social_accounts(id) on delete set null,
  job_id        uuid references public.jobs(id) on delete set null,
  idempotency_key text not null unique,
  status        public.run_status not null default 'QUEUED',
  attempt       int not null default 1,
  request       jsonb not null default '{}'::jsonb,
  response      jsonb,
  external_id   text,
  external_url  text,
  error         jsonb,
  started_at    timestamptz,
  finished_at   timestamptz,
  created_at    timestamptz not null default now()
);
create index publishing_jobs_content_idx on public.publishing_jobs(content_id, created_at desc);

create table public.approvals (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references public.clients(id) on delete cascade,
  subject      public.approval_subject not null,
  subject_id   uuid not null,
  status       public.approval_status not null default 'PENDING',
  summary      text not null,
  details      jsonb not null default '{}'::jsonb,
  amount       numeric(18,4),
  currency     text,
  requested_by uuid references public.profiles(id) on delete set null,
  decided_by   uuid references public.profiles(id) on delete set null,
  decided_at   timestamptz,
  decision_note text,
  expires_at   timestamptz,
  created_at   timestamptz not null default now()
);
-- Only one open approval request per subject at a time.
create unique index approvals_one_pending on public.approvals(subject, subject_id)
  where status = 'PENDING';
create index approvals_pending_idx on public.approvals(client_id, status, created_at desc);
