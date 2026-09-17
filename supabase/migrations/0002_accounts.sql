-- NojAds :: 0002_accounts
-- OAuth state, social accounts, encrypted token vault, ad accounts.

create table public.oauth_states (
  state         text primary key,
  platform      public.platform not null,
  client_id     uuid not null references public.clients(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  code_verifier text,
  redirect_to   text,
  scopes        text[] not null default '{}',
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default (now() + interval '15 minutes'),
  consumed_at   timestamptz
);
create index oauth_states_expiry_idx on public.oauth_states(expires_at);

create table public.social_accounts (
  id                  uuid primary key default gen_random_uuid(),
  client_id           uuid not null references public.clients(id) on delete cascade,
  platform            public.platform not null,
  external_id         text not null,
  username            text,
  display_name        text,
  avatar_url          text,
  profile_url         text,
  account_type        text,
  parent_external_id  text,
  granted_scopes      text[] not null default '{}',
  capabilities        jsonb not null default '{}'::jsonb,
  status              public.connection_status not null default 'CONNECTED',
  status_reason       text,
  connected_by        uuid references public.profiles(id) on delete set null,
  connected_at        timestamptz not null default now(),
  last_checked_at     timestamptz,
  last_error          jsonb,
  is_demo             boolean not null default false,
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (client_id, platform, external_id)
);
create index social_accounts_client_idx on public.social_accounts(client_id);
create index social_accounts_status_idx on public.social_accounts(status);
create trigger social_accounts_touch before update on public.social_accounts
  for each row execute function public.touch_updated_at();

-- Ciphertext only. No route ever selects from this table with an end-user JWT.
create table public.social_tokens (
  id                    uuid primary key default gen_random_uuid(),
  social_account_id     uuid not null unique references public.social_accounts(id) on delete cascade,
  access_token_cipher   text not null,
  refresh_token_cipher  text,
  token_type            text,
  scopes                text[] not null default '{}',
  expires_at            timestamptz,
  refresh_expires_at    timestamptz,
  last_refreshed_at     timestamptz,
  refresh_failures      int not null default 0,
  key_version           int not null default 1,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index social_tokens_expiry_idx on public.social_tokens(expires_at);
create trigger social_tokens_touch before update on public.social_tokens
  for each row execute function public.touch_updated_at();

create table public.ad_accounts (
  id                 uuid primary key default gen_random_uuid(),
  client_id          uuid not null references public.clients(id) on delete cascade,
  social_account_id  uuid references public.social_accounts(id) on delete set null,
  platform           public.platform not null,
  external_id        text not null,
  name               text,
  currency           text,
  timezone           text,
  business_id        text,
  business_name      text,
  account_status     text,
  funding_source     text,
  spend_cap          numeric(18,4),
  amount_spent       numeric(18,4),
  capabilities       jsonb not null default '{}'::jsonb,
  status             public.connection_status not null default 'CONNECTED',
  status_reason      text,
  last_synced_at     timestamptz,
  is_demo            boolean not null default false,
  metadata           jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (client_id, platform, external_id)
);
create index ad_accounts_client_idx on public.ad_accounts(client_id);
create trigger ad_accounts_touch before update on public.ad_accounts
  for each row execute function public.touch_updated_at();
