-- NojAds :: 0001_core
-- Extensions, enums, profiles, clients, brand settings.

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

-- ---------------------------------------------------------------- enums
create type public.user_role       as enum ('ADMIN','MANAGER','CLIENT');
create type public.client_status   as enum ('ACTIVE','INACTIVE','ARCHIVED');
create type public.platform        as enum ('FACEBOOK','INSTAGRAM','TIKTOK','YOUTUBE','LINKEDIN','X','GOOGLE');
create type public.connection_status as enum ('CONNECTED','EXPIRED','REVOKED','ERROR','DISCONNECTED');
create type public.task_status     as enum ('ACTIVE','PAUSED','DISABLED','REMOVED','ERROR');
create type public.task_mode       as enum ('AUTOMATIC','APPROVAL');
create type public.run_status      as enum ('QUEUED','RUNNING','SUCCEEDED','FAILED','CANCELLED','SKIPPED');
create type public.job_status      as enum ('PENDING','RESERVED','RUNNING','SUCCEEDED','FAILED','DEAD','CANCELLED');
create type public.content_status  as enum ('DRAFT','GENERATING','READY','PENDING_APPROVAL','SCHEDULED','PUBLISHING','PUBLISHED','FAILED','CANCELLED');
create type public.campaign_status as enum ('DRAFT','PENDING_APPROVAL','PENDING_PAYMENT','PUBLISHING','ACTIVE','PAUSED','COMPLETED','FAILED','ARCHIVED');
create type public.transaction_status as enum ('PENDING','PROCESSING','SUCCEEDED','FAILED','CANCELLED','REFUNDED','PARTIALLY_REFUNDED');
create type public.approval_status as enum ('PENDING','APPROVED','REJECTED','EXPIRED');
create type public.approval_subject as enum ('CONTENT','AD','CAMPAIGN','BUDGET','PAYMENT','TASK_CHANGE');
create type public.log_channel     as enum ('ADMIN','SYSTEM','AI','PUBLISHING','ADS','BILLING','AUTH','WEBHOOK');
create type public.log_level       as enum ('DEBUG','INFO','WARN','ERROR');

-- --------------------------------------------------------- updated_at
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ------------------------------------------------------------ profiles
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text not null,
  full_name    text,
  avatar_url   text,
  role         public.user_role not null default 'CLIENT',
  timezone     text not null default 'Africa/Luanda',
  locale       text not null default 'pt',
  phone        text,
  is_active    boolean not null default true,
  last_seen_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index profiles_role_idx on public.profiles(role);
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- New auth users get a profile automatically. The very first user becomes ADMIN.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  assigned public.user_role;
begin
  if (select count(*) from public.profiles) = 0 then
    assigned := 'ADMIN';
  else
    assigned := 'CLIENT';
  end if;
  insert into public.profiles (id, email, full_name, role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email), assigned)
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------- clients
create table public.clients (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  company           text,
  slug              text not null unique,
  description       text,
  website           text,
  country           text,
  city              text,
  category          text,
  target_audience   text,
  products          text[] not null default '{}',
  services          text[] not null default '{}',
  contact_email     text,
  contact_phone     text,
  language          text not null default 'pt',
  timezone          text not null default 'Africa/Luanda',
  currency          text not null default 'AOA',
  status            public.client_status not null default 'ACTIVE',
  default_task_mode public.task_mode not null default 'APPROVAL',
  approval_rules    jsonb not null default '{}'::jsonb,
  automation_rules  jsonb not null default '{}'::jsonb,
  content_preferences jsonb not null default '{}'::jsonb,
  is_demo           boolean not null default false,
  created_by        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  archived_at       timestamptz
);
create index clients_status_idx on public.clients(status);
create index clients_name_trgm on public.clients using gin (name gin_trgm_ops);
create index clients_demo_idx on public.clients(is_demo);
create trigger clients_touch before update on public.clients
  for each row execute function public.touch_updated_at();

-- Which non-admin users may reach which client.
create table public.client_members (
  client_id  uuid not null references public.clients(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  can_write  boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (client_id, user_id)
);
create index client_members_user_idx on public.client_members(user_id);

-- ------------------------------------------------------ brand settings
create table public.brand_settings (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null unique references public.clients(id) on delete cascade,
  logo_url          text,
  logo_variants     jsonb not null default '[]'::jsonb,
  primary_colors    text[] not null default '{}',
  secondary_colors  text[] not null default '{}',
  fonts             jsonb not null default '[]'::jsonb,
  visual_style      text,
  tone_of_voice     text,
  allowed_words     text[] not null default '{}',
  forbidden_words   text[] not null default '{}',
  calls_to_action   text[] not null default '{}',
  audience          text,
  positioning       text,
  visual_references jsonb not null default '[]'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create trigger brand_touch before update on public.brand_settings
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------- access helpers
create or replace function public.current_role_of(uid uuid)
returns public.user_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = uid
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'ADMIN' from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('ADMIN','MANAGER') from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.has_client_access(target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or exists (select 1 from public.client_members m
                  where m.client_id = target and m.user_id = auth.uid())
$$;

create or replace function public.can_write_client(target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or exists (select 1 from public.client_members m
                  where m.client_id = target and m.user_id = auth.uid() and m.can_write)
$$;
