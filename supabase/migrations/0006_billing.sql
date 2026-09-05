-- NojAds :: 0006_billing
-- Billing accounts, payment customers/methods, transactions, invoices,
-- refunds, spend limits and the raw provider event log.
--
-- Money rule enforced here: ad_spend, nojads_fee and gateway_fee are stored
-- separately and total_amount must equal their sum. Nothing merges them.

create table public.billing_accounts (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references public.clients(id) on delete cascade,
  ad_account_id     uuid references public.ad_accounts(id) on delete cascade,
  platform          public.platform not null,
  provider          text not null,               -- META | TIKTOK | LINKEDIN | GOOGLE | STRIPE
  external_id       text,
  currency          text,
  funding_model     text,                        -- PREPAID | POSTPAID | UNKNOWN
  balance           numeric(18,4),
  credit_limit      numeric(18,4),
  next_bill_at      timestamptz,
  supported_operations text[] not null default '{}',
  status            text not null default 'UNKNOWN',
  status_reason     text,
  last_synced_at    timestamptz,
  raw               jsonb not null default '{}'::jsonb,
  is_demo           boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create unique index billing_accounts_unique
  on public.billing_accounts(client_id, platform, coalesce(external_id, ''));
create index billing_accounts_client_idx on public.billing_accounts(client_id);
create trigger billing_accounts_touch before update on public.billing_accounts
  for each row execute function public.touch_updated_at();

create table public.payment_customers (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.clients(id) on delete cascade,
  provider      text not null,
  external_id   text not null,
  email         text,
  name          text,
  default_method_id uuid,
  metadata      jsonb not null default '{}'::jsonb,
  is_demo       boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (provider, external_id)
);
create trigger payment_customers_touch before update on public.payment_customers
  for each row execute function public.touch_updated_at();

-- Tokenised references only. Raw PAN/CVV is never accepted or stored.
create table public.payment_methods (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references public.clients(id) on delete cascade,
  customer_id    uuid references public.payment_customers(id) on delete cascade,
  provider       text not null,
  external_id    text not null,
  kind           text not null default 'CARD',   -- CARD | BANK | WALLET | PLATFORM
  brand          text,
  last4          text check (last4 is null or last4 ~ '^[0-9]{4}$'),
  exp_month      int check (exp_month is null or exp_month between 1 and 12),
  exp_year       int,
  holder_name    text,
  is_default     boolean not null default false,
  status         text not null default 'ACTIVE',
  metadata       jsonb not null default '{}'::jsonb,
  is_demo        boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (provider, external_id)
);
create index payment_methods_client_idx on public.payment_methods(client_id);
create trigger payment_methods_touch before update on public.payment_methods
  for each row execute function public.touch_updated_at();

alter table public.payment_customers
  add constraint payment_customers_default_method_fk
  foreign key (default_method_id) references public.payment_methods(id) on delete set null;

create table public.payment_transactions (
  id              uuid primary key default gen_random_uuid(),
  reference       text not null unique default ('TX-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))),
  client_id       uuid not null references public.clients(id) on delete cascade,
  user_id         uuid references public.profiles(id) on delete set null,
  platform        public.platform,
  ad_account_id   uuid references public.ad_accounts(id) on delete set null,
  campaign_id     uuid references public.ad_campaigns(id) on delete set null,
  provider        text not null,
  payment_method_id uuid references public.payment_methods(id) on delete set null,
  billing_account_id uuid references public.billing_accounts(id) on delete set null,
  purpose         text not null default 'AD_SPEND',  -- AD_SPEND | TOP_UP | SUBSCRIPTION | FEE
  ad_spend_amount numeric(18,4) not null default 0 check (ad_spend_amount >= 0),
  nojads_fee      numeric(18,4) not null default 0 check (nojads_fee >= 0),
  gateway_fee     numeric(18,4) not null default 0 check (gateway_fee >= 0),
  total_amount    numeric(18,4) not null check (total_amount >= 0),
  currency        text not null,
  fx_rate         numeric(18,8),
  fx_source       text,
  original_amount numeric(18,4),
  original_currency text,
  status          public.transaction_status not null default 'PENDING',
  status_reason   text,
  idempotency_key text not null unique,
  external_id     text,
  external_status text,
  confirmed_by    uuid references public.profiles(id) on delete set null,
  confirmed_at    timestamptz,
  authorized_at   timestamptz,
  succeeded_at    timestamptz,
  failed_at       timestamptz,
  refunded_amount numeric(18,4) not null default 0 check (refunded_amount >= 0),
  metadata        jsonb not null default '{}'::jsonb,
  is_demo         boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint transactions_total_matches_parts
    check (total_amount = ad_spend_amount + nojads_fee + gateway_fee),
  constraint transactions_refund_within_total
    check (refunded_amount <= total_amount)
);
create index tx_client_idx on public.payment_transactions(client_id, created_at desc);
create index tx_status_idx on public.payment_transactions(status);
create index tx_campaign_idx on public.payment_transactions(campaign_id);
create unique index tx_external_unique on public.payment_transactions(provider, external_id)
  where external_id is not null;
create trigger tx_touch before update on public.payment_transactions
  for each row execute function public.touch_updated_at();

create table public.invoices (
  id             uuid primary key default gen_random_uuid(),
  number         text not null unique,
  client_id      uuid not null references public.clients(id) on delete cascade,
  transaction_id uuid references public.payment_transactions(id) on delete set null,
  period_start   date,
  period_end     date,
  ad_spend_amount numeric(18,4) not null default 0,
  nojads_fee     numeric(18,4) not null default 0,
  gateway_fee    numeric(18,4) not null default 0,
  tax_amount     numeric(18,4) not null default 0,
  total_amount   numeric(18,4) not null default 0,
  currency       text not null,
  status         text not null default 'ISSUED',   -- DRAFT | ISSUED | PAID | VOID
  issued_at      timestamptz not null default now(),
  due_at         timestamptz,
  paid_at        timestamptz,
  line_items     jsonb not null default '[]'::jsonb,
  storage_path   text,
  is_demo        boolean not null default false,
  created_at     timestamptz not null default now()
);
create index invoices_client_idx on public.invoices(client_id, issued_at desc);

create table public.refunds (
  id             uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.payment_transactions(id) on delete cascade,
  client_id      uuid not null references public.clients(id) on delete cascade,
  provider       text not null,
  external_id    text,
  amount         numeric(18,4) not null check (amount > 0),
  currency       text not null,
  reason         text,
  status         public.transaction_status not null default 'PENDING',
  idempotency_key text not null unique,
  requested_by   uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  settled_at     timestamptz
);
create index refunds_tx_idx on public.refunds(transaction_id);

-- Raw provider callbacks. Kept for audit; unique on (provider, event id)
-- so a redelivered webhook can never be processed twice.
create table public.billing_events (
  id             uuid primary key default gen_random_uuid(),
  provider       text not null,
  external_event_id text not null,
  event_type     text not null,
  transaction_id uuid references public.payment_transactions(id) on delete set null,
  client_id      uuid references public.clients(id) on delete cascade,
  signature_valid boolean not null default false,
  payload        jsonb not null,
  processed_at   timestamptz,
  processing_error jsonb,
  received_at    timestamptz not null default now(),
  unique (provider, external_event_id)
);
create index billing_events_unprocessed_idx on public.billing_events(processed_at) where processed_at is null;

create table public.spend_limits (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null unique references public.clients(id) on delete cascade,
  currency          text not null default 'USD',
  daily_limit       numeric(18,4),
  monthly_limit     numeric(18,4),
  per_campaign_limit numeric(18,4),
  per_transaction_limit numeric(18,4),
  require_approval_above numeric(18,4),
  ai_max_budget_increase_pct numeric(6,2) not null default 0,
  block_automatic_payments boolean not null default true,
  updated_by        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create trigger spend_limits_touch before update on public.spend_limits
  for each row execute function public.touch_updated_at();
