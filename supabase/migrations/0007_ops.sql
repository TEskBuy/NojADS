-- NojAds :: 0007_ops
-- Notifications, activity/audit logs, AI generation log, webhook inbox,
-- reports, integration settings.

create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.profiles(id) on delete cascade,
  client_id   uuid references public.clients(id) on delete cascade,
  type        text not null,
  severity    text not null default 'INFO',   -- INFO | SUCCESS | WARNING | ERROR
  title       text not null,
  body        text,
  link        text,
  data        jsonb not null default '{}'::jsonb,
  read_at     timestamptz,
  is_demo     boolean not null default false,
  created_at  timestamptz not null default now()
);
create index notifications_user_idx on public.notifications(user_id, created_at desc);
create index notifications_unread_idx on public.notifications(user_id) where read_at is null;

create table public.activity_logs (
  id          bigserial primary key,
  channel     public.log_channel not null default 'SYSTEM',
  level       public.log_level not null default 'INFO',
  action      text not null,
  message     text,
  user_id     uuid references public.profiles(id) on delete set null,
  client_id   uuid references public.clients(id) on delete cascade,
  task_id     uuid references public.tasks(id) on delete set null,
  task_run_id uuid references public.task_runs(id) on delete set null,
  content_id  uuid references public.content(id) on delete set null,
  campaign_id uuid references public.ad_campaigns(id) on delete set null,
  transaction_id uuid references public.payment_transactions(id) on delete set null,
  job_id      uuid references public.jobs(id) on delete set null,
  entity_type text,
  entity_id   text,
  result      text,
  error       jsonb,
  metadata    jsonb not null default '{}'::jsonb,
  ip_address  inet,
  user_agent  text,
  created_at  timestamptz not null default now()
);
create index activity_logs_created_idx on public.activity_logs(created_at desc);
create index activity_logs_channel_idx on public.activity_logs(channel, created_at desc);
create index activity_logs_client_idx on public.activity_logs(client_id, created_at desc);
create index activity_logs_level_idx on public.activity_logs(level) where level in ('WARN','ERROR');

create table public.ai_generations (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid references public.clients(id) on delete cascade,
  task_id      uuid references public.tasks(id) on delete set null,
  content_id   uuid references public.content(id) on delete set null,
  purpose      text not null,
  provider     text not null,
  model        text not null,
  system_prompt text,
  user_prompt  text,
  response     jsonb,
  input_tokens int,
  output_tokens int,
  latency_ms   int,
  cost_usd     numeric(12,6),
  status       text not null default 'SUCCEEDED',
  error        jsonb,
  created_at   timestamptz not null default now()
);
create index ai_generations_client_idx on public.ai_generations(client_id, created_at desc);

-- Every inbound platform webhook lands here first, signature-verified,
-- de-duplicated by (source, external id), then processed asynchronously.
create table public.webhook_events (
  id             uuid primary key default gen_random_uuid(),
  source         text not null,
  external_event_id text not null,
  topic          text,
  signature_valid boolean not null default false,
  headers        jsonb not null default '{}'::jsonb,
  payload        jsonb not null,
  client_id      uuid references public.clients(id) on delete cascade,
  processed_at   timestamptz,
  processing_error jsonb,
  received_at    timestamptz not null default now(),
  unique (source, external_event_id)
);
create index webhook_events_unprocessed_idx on public.webhook_events(received_at)
  where processed_at is null;

create table public.reports (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references public.clients(id) on delete cascade,
  kind         text not null,          -- DAILY | WEEKLY | MONTHLY | CAMPAIGN | CLIENT | PLATFORM | FINANCIAL
  title        text not null,
  period_start date not null,
  period_end   date not null,
  summary      text,
  data         jsonb not null default '{}'::jsonb,
  recommendations jsonb not null default '[]'::jsonb,
  storage_path text,
  generated_by text not null default 'SYSTEM',
  is_demo      boolean not null default false,
  created_at   timestamptz not null default now()
);
create index reports_client_idx on public.reports(client_id, created_at desc);

-- Per-deployment integration status. Never holds secrets: only whether a
-- given integration has been configured, and by whom.
create table public.integration_settings (
  id            uuid primary key default gen_random_uuid(),
  provider      text not null unique,
  is_configured boolean not null default false,
  api_version   text,
  scopes        text[] not null default '{}',
  redirect_uri  text,
  notes         text,
  checked_at    timestamptz,
  updated_by    uuid references public.profiles(id) on delete set null,
  updated_at    timestamptz not null default now()
);

create table public.app_settings (
  key         text primary key,
  value       jsonb not null,
  description text,
  updated_by  uuid references public.profiles(id) on delete set null,
  updated_at  timestamptz not null default now()
);
