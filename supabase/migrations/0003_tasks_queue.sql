-- NojAds :: 0003_tasks_queue
-- Task engine, scheduled executions, durable Postgres queue, run history.

create table public.tasks (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references public.clients(id) on delete cascade,
  name              text not null,
  description       text,
  type              text not null,               -- see src/server/tasks/types.ts
  platform          public.platform,
  social_account_id uuid references public.social_accounts(id) on delete set null,
  ad_account_id     uuid references public.ad_accounts(id) on delete set null,
  quantity          int not null default 1 check (quantity between 1 and 50),
  frequency         text not null default 'DAILY',  -- DAILY | WEEKLY | MONTHLY | HOURLY | INTERVAL | CRON | ONCE
  cron_expression   text,
  interval_minutes  int check (interval_minutes is null or interval_minutes >= 5),
  run_at_times      text[] not null default '{}',   -- 'HH:MM' local to timezone
  weekdays          int[] not null default '{}',    -- 1=Mon .. 7=Sun
  month_days        int[] not null default '{}',
  timezone          text not null default 'Africa/Luanda',
  starts_at         timestamptz not null default now(),
  ends_at           timestamptz,
  status            public.task_status not null default 'PAUSED',
  mode              public.task_mode not null default 'APPROVAL',
  config            jsonb not null default '{}'::jsonb,
  last_run_at       timestamptz,
  last_status       public.run_status,
  next_run_at       timestamptz,
  run_count         int not null default 0,
  failure_count     int not null default 0,
  consecutive_failures int not null default 0,
  last_error        jsonb,
  is_demo           boolean not null default false,
  created_by        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  removed_at        timestamptz,
  constraint tasks_cron_required check (frequency <> 'CRON' or cron_expression is not null),
  constraint tasks_interval_required check (frequency <> 'INTERVAL' or interval_minutes is not null)
);
create index tasks_client_idx on public.tasks(client_id);
create index tasks_due_idx on public.tasks(next_run_at) where status = 'ACTIVE';
create index tasks_status_idx on public.tasks(status);
create trigger tasks_touch before update on public.tasks
  for each row execute function public.touch_updated_at();

-- One row per planned execution. The unique key makes scheduling idempotent:
-- the scheduler can run twice in the same minute without double-booking.
create table public.scheduled_jobs (
  id            uuid primary key default gen_random_uuid(),
  task_id       uuid not null references public.tasks(id) on delete cascade,
  client_id     uuid not null references public.clients(id) on delete cascade,
  scheduled_for timestamptz not null,
  dedupe_key    text not null unique,
  origin        text not null default 'SCHEDULER',  -- SCHEDULER | MANUAL | RETRY
  created_at    timestamptz not null default now(),
  dispatched_at timestamptz,
  job_id        uuid
);
create index scheduled_jobs_task_idx on public.scheduled_jobs(task_id, scheduled_for desc);

-- Durable queue. Claimed with FOR UPDATE SKIP LOCKED by the worker process.
create table public.jobs (
  id             uuid primary key default gen_random_uuid(),
  queue          text not null,
  type           text not null,
  payload        jsonb not null default '{}'::jsonb,
  status         public.job_status not null default 'PENDING',
  priority       int not null default 100,
  run_after      timestamptz not null default now(),
  attempts       int not null default 0,
  max_attempts   int not null default 5,
  idempotency_key text unique,
  locked_by      text,
  locked_at      timestamptz,
  timeout_seconds int not null default 300,
  last_error     jsonb,
  result         jsonb,
  client_id      uuid references public.clients(id) on delete cascade,
  task_id        uuid references public.tasks(id) on delete set null,
  task_run_id    uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  started_at     timestamptz,
  finished_at    timestamptz
);
create index jobs_ready_idx on public.jobs(queue, status, run_after, priority);
create index jobs_status_idx on public.jobs(status);
create index jobs_client_idx on public.jobs(client_id);
create trigger jobs_touch before update on public.jobs
  for each row execute function public.touch_updated_at();

create table public.task_runs (
  id             uuid primary key default gen_random_uuid(),
  task_id        uuid not null references public.tasks(id) on delete cascade,
  client_id      uuid not null references public.clients(id) on delete cascade,
  job_id         uuid references public.jobs(id) on delete set null,
  scheduled_for  timestamptz,
  trigger        text not null default 'SCHEDULER',   -- SCHEDULER | MANUAL | RETRY
  status         public.run_status not null default 'QUEUED',
  attempt        int not null default 1,
  started_at     timestamptz,
  finished_at    timestamptz,
  duration_ms    int,
  output         jsonb not null default '{}'::jsonb,
  produced_content_ids uuid[] not null default '{}',
  error          jsonb,
  triggered_by   uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index task_runs_task_idx on public.task_runs(task_id, created_at desc);
create index task_runs_client_idx on public.task_runs(client_id, created_at desc);
create index task_runs_status_idx on public.task_runs(status);

alter table public.jobs
  add constraint jobs_task_run_fk foreign key (task_run_id)
  references public.task_runs(id) on delete set null;

alter table public.scheduled_jobs
  add constraint scheduled_jobs_job_fk foreign key (job_id)
  references public.jobs(id) on delete set null;

-- Atomic claim. Returns jobs already flipped to RUNNING and stamped with the worker id.
create or replace function public.claim_jobs(
  p_worker text,
  p_queues text[],
  p_limit  int default 5
) returns setof public.jobs
language plpgsql security definer set search_path = public as $$
begin
  return query
  with ready as (
    select j.id
      from public.jobs j
     where j.status = 'PENDING'
       and j.run_after <= now()
       and (p_queues is null or array_length(p_queues,1) is null or j.queue = any(p_queues))
     order by j.priority asc, j.run_after asc
     limit p_limit
     for update skip locked
  )
  update public.jobs j
     set status = 'RUNNING',
         locked_by = p_worker,
         locked_at = now(),
         started_at = coalesce(j.started_at, now()),
         attempts = j.attempts + 1,
         updated_at = now()
    from ready
   where j.id = ready.id
  returning j.*;
end $$;

-- Requeue jobs whose worker died mid-flight (lock older than the job timeout).
create or replace function public.reap_stalled_jobs()
returns int language plpgsql security definer set search_path = public as $$
declare
  affected int;
begin
  with stalled as (
    select id, attempts, max_attempts
      from public.jobs
     where status = 'RUNNING'
       and locked_at < now() - (timeout_seconds || ' seconds')::interval
     for update skip locked
  )
  update public.jobs j
     set status = case when s.attempts >= s.max_attempts then 'DEAD'::public.job_status
                       else 'PENDING'::public.job_status end,
         locked_by = null,
         locked_at = null,
         run_after = now() + (least(power(2, s.attempts)::int, 900) || ' seconds')::interval,
         last_error = jsonb_build_object('code','WORKER_TIMEOUT','message','Job excedeu o tempo limite e foi recolocado na fila.'),
         updated_at = now()
    from stalled s
   where j.id = s.id;
  get diagnostics affected = row_count;
  return affected;
end $$;
