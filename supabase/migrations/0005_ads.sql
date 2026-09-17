-- NojAds :: 0005_ads
-- Campaigns, ad sets, creatives, ads, saved audiences, ad insights.

create table public.ad_campaigns (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references public.clients(id) on delete cascade,
  ad_account_id     uuid not null references public.ad_accounts(id) on delete cascade,
  platform          public.platform not null,
  task_id           uuid references public.tasks(id) on delete set null,
  name              text not null,
  objective         text not null,
  status            public.campaign_status not null default 'DRAFT',
  external_status   text,
  external_id       text,
  external_url      text,
  buying_type       text,
  special_ad_categories text[] not null default '{}',
  daily_budget      numeric(18,4),
  lifetime_budget   numeric(18,4),
  budget_level      text not null default 'ADSET',   -- CAMPAIGN | ADSET
  currency          text not null default 'USD',
  bid_strategy      text,
  spend_cap         numeric(18,4),
  starts_at         timestamptz,
  ends_at           timestamptz,
  origin            text not null default 'MANUAL',  -- MANUAL | AUTOMATIC
  requires_approval boolean not null default true,
  approved_at       timestamptz,
  approved_by       uuid references public.profiles(id) on delete set null,
  published_at      timestamptz,
  last_synced_at    timestamptz,
  last_error        jsonb,
  idempotency_key   text unique,
  is_demo           boolean not null default false,
  created_by        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index ad_campaigns_client_idx on public.ad_campaigns(client_id, created_at desc);
create index ad_campaigns_status_idx on public.ad_campaigns(status);
create unique index ad_campaigns_external_unique on public.ad_campaigns(platform, external_id)
  where external_id is not null;
create trigger ad_campaigns_touch before update on public.ad_campaigns
  for each row execute function public.touch_updated_at();

create table public.audiences (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.clients(id) on delete cascade,
  platform      public.platform not null,
  name          text not null,
  kind          text not null default 'SAVED',  -- SAVED | CUSTOM | LOOKALIKE
  external_id   text,
  spec          jsonb not null default '{}'::jsonb,
  estimated_size bigint,
  is_demo       boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index audiences_client_idx on public.audiences(client_id);
create trigger audiences_touch before update on public.audiences
  for each row execute function public.touch_updated_at();

create table public.ad_sets (
  id              uuid primary key default gen_random_uuid(),
  campaign_id     uuid not null references public.ad_campaigns(id) on delete cascade,
  client_id       uuid not null references public.clients(id) on delete cascade,
  name            text not null,
  external_id     text,
  status          public.campaign_status not null default 'DRAFT',
  external_status text,
  optimization_goal text,
  billing_event   text,
  bid_amount      numeric(18,4),
  daily_budget    numeric(18,4),
  lifetime_budget numeric(18,4),
  starts_at       timestamptz,
  ends_at         timestamptz,
  targeting       jsonb not null default '{}'::jsonb,
  placements      jsonb not null default '{"mode":"AUTOMATIC"}'::jsonb,
  audience_id     uuid references public.audiences(id) on delete set null,
  promoted_object jsonb,
  last_error      jsonb,
  is_demo         boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index ad_sets_campaign_idx on public.ad_sets(campaign_id);
create trigger ad_sets_touch before update on public.ad_sets
  for each row execute function public.touch_updated_at();

create table public.creatives (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.clients(id) on delete cascade,
  platform      public.platform not null,
  name          text not null,
  external_id   text,
  format        text not null default 'SINGLE_IMAGE',  -- SINGLE_IMAGE | SINGLE_VIDEO | CAROUSEL
  primary_text  text,
  headline      text,
  description   text,
  call_to_action text,
  destination_url text,
  display_url   text,
  content_id    uuid references public.content(id) on delete set null,
  asset_ids     uuid[] not null default '{}',
  page_external_id text,
  instagram_external_id text,
  spec          jsonb not null default '{}'::jsonb,
  source        text not null default 'MANUAL',   -- MANUAL | AI | STUDIO | CONTENT
  is_demo       boolean not null default false,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index creatives_client_idx on public.creatives(client_id, created_at desc);
create trigger creatives_touch before update on public.creatives
  for each row execute function public.touch_updated_at();

create table public.ads (
  id            uuid primary key default gen_random_uuid(),
  ad_set_id     uuid not null references public.ad_sets(id) on delete cascade,
  campaign_id   uuid not null references public.ad_campaigns(id) on delete cascade,
  client_id     uuid not null references public.clients(id) on delete cascade,
  creative_id   uuid references public.creatives(id) on delete set null,
  name          text not null,
  external_id   text,
  external_url  text,
  status        public.campaign_status not null default 'DRAFT',
  external_status text,
  review_status text,
  last_error    jsonb,
  is_demo       boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index ads_campaign_idx on public.ads(campaign_id);
create index ads_client_idx on public.ads(client_id);
create trigger ads_touch before update on public.ads
  for each row execute function public.touch_updated_at();

-- One row per (entity, day). Upserted by the analytics worker.
create table public.analytics (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.clients(id) on delete cascade,
  platform      public.platform not null,
  scope         text not null,   -- ACCOUNT | CONTENT | CAMPAIGN | ADSET | AD
  entity_id     uuid,
  external_id   text,
  date          date not null,
  impressions   bigint not null default 0,
  reach         bigint not null default 0,
  clicks        bigint not null default 0,
  likes         bigint not null default 0,
  comments      bigint not null default 0,
  shares        bigint not null default 0,
  saves         bigint not null default 0,
  video_views   bigint not null default 0,
  followers     bigint not null default 0,
  follower_delta bigint not null default 0,
  conversions   bigint not null default 0,
  engagement_rate numeric(10,6),
  ctr           numeric(10,6),
  cpc           numeric(18,6),
  cpm           numeric(18,6),
  cost_per_result numeric(18,6),
  spend         numeric(18,4) not null default 0,
  currency      text,
  raw           jsonb not null default '{}'::jsonb,
  is_demo       boolean not null default false,
  synced_at     timestamptz not null default now()
);
create unique index analytics_unique on public.analytics(client_id, platform, scope, coalesce(entity_id,'00000000-0000-0000-0000-000000000000'::uuid), coalesce(external_id,''), date);
create index analytics_client_date_idx on public.analytics(client_id, date desc);
create index analytics_scope_idx on public.analytics(scope, date desc);
