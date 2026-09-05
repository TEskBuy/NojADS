/**
 * Domain models.
 *
 * These mirror the SQL schema in supabase/migrations. The repository layer is
 * the only place that casts Postgres rows into these types, so the rest of the
 * app never touches an untyped row.
 */

export type UserRole = 'ADMIN' | 'MANAGER' | 'CLIENT';
export type ClientStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
export type Platform = 'FACEBOOK' | 'INSTAGRAM' | 'TIKTOK' | 'YOUTUBE' | 'LINKEDIN' | 'X' | 'GOOGLE';
export type ConnectionStatus = 'CONNECTED' | 'EXPIRED' | 'REVOKED' | 'ERROR' | 'DISCONNECTED';
export type TaskStatus = 'ACTIVE' | 'PAUSED' | 'DISABLED' | 'REMOVED' | 'ERROR';
export type TaskMode = 'AUTOMATIC' | 'APPROVAL';
export type RunStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'SKIPPED';
export type JobStatus = 'PENDING' | 'RESERVED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'DEAD' | 'CANCELLED';
export type ContentStatus =
  | 'DRAFT' | 'GENERATING' | 'READY' | 'PENDING_APPROVAL' | 'SCHEDULED'
  | 'PUBLISHING' | 'PUBLISHED' | 'FAILED' | 'CANCELLED';
export type CampaignStatus =
  | 'DRAFT' | 'PENDING_APPROVAL' | 'PENDING_PAYMENT' | 'PUBLISHING'
  | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'FAILED' | 'ARCHIVED';
export type TransactionStatus =
  | 'PENDING' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED'
  | 'REFUNDED' | 'PARTIALLY_REFUNDED';
export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
export type ApprovalSubject = 'CONTENT' | 'AD' | 'CAMPAIGN' | 'BUDGET' | 'PAYMENT' | 'TASK_CHANGE';
export type LogChannel = 'ADMIN' | 'SYSTEM' | 'AI' | 'PUBLISHING' | 'ADS' | 'BILLING' | 'AUTH' | 'WEBHOOK';
export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
export type ContentFormat = 'POST' | 'REEL' | 'STORY' | 'VIDEO' | 'FLYER' | 'CAROUSEL' | 'SHORT';
export type Frequency = 'HOURLY' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'INTERVAL' | 'CRON' | 'ONCE';

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: UserRole;
  timezone: string;
  locale: string;
  phone: string | null;
  is_active: boolean;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Client {
  id: string;
  name: string;
  company: string | null;
  slug: string;
  description: string | null;
  website: string | null;
  country: string | null;
  city: string | null;
  category: string | null;
  target_audience: string | null;
  products: string[];
  services: string[];
  contact_email: string | null;
  contact_phone: string | null;
  language: string;
  timezone: string;
  currency: string;
  status: ClientStatus;
  default_task_mode: TaskMode;
  approval_rules: Record<string, unknown>;
  automation_rules: Record<string, unknown>;
  content_preferences: Record<string, unknown>;
  is_demo: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface BrandSettings {
  id: string;
  client_id: string;
  logo_url: string | null;
  logo_variants: Json;
  primary_colors: string[];
  secondary_colors: string[];
  fonts: Json;
  visual_style: string | null;
  tone_of_voice: string | null;
  allowed_words: string[];
  forbidden_words: string[];
  calls_to_action: string[];
  audience: string | null;
  positioning: string | null;
  visual_references: Json;
  created_at: string;
  updated_at: string;
}

export interface SocialAccount {
  id: string;
  client_id: string;
  platform: Platform;
  external_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  profile_url: string | null;
  account_type: string | null;
  parent_external_id: string | null;
  granted_scopes: string[];
  capabilities: Record<string, unknown>;
  status: ConnectionStatus;
  status_reason: string | null;
  connected_by: string | null;
  connected_at: string;
  last_checked_at: string | null;
  last_error: Json;
  is_demo: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface AdAccount {
  id: string;
  client_id: string;
  social_account_id: string | null;
  platform: Platform;
  external_id: string;
  name: string | null;
  currency: string | null;
  timezone: string | null;
  business_id: string | null;
  business_name: string | null;
  account_status: string | null;
  funding_source: string | null;
  spend_cap: number | null;
  amount_spent: number | null;
  capabilities: Record<string, unknown>;
  status: ConnectionStatus;
  status_reason: string | null;
  last_synced_at: string | null;
  is_demo: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  client_id: string;
  name: string;
  description: string | null;
  type: string;
  platform: Platform | null;
  social_account_id: string | null;
  ad_account_id: string | null;
  quantity: number;
  frequency: Frequency;
  cron_expression: string | null;
  interval_minutes: number | null;
  run_at_times: string[];
  weekdays: number[];
  month_days: number[];
  timezone: string;
  starts_at: string;
  ends_at: string | null;
  status: TaskStatus;
  mode: TaskMode;
  config: Record<string, unknown>;
  last_run_at: string | null;
  last_status: RunStatus | null;
  next_run_at: string | null;
  run_count: number;
  failure_count: number;
  consecutive_failures: number;
  last_error: Json;
  is_demo: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  removed_at: string | null;
}

export interface TaskRun {
  id: string;
  task_id: string;
  client_id: string;
  job_id: string | null;
  scheduled_for: string | null;
  trigger: 'SCHEDULER' | 'MANUAL' | 'RETRY';
  status: RunStatus;
  attempt: number;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  output: Record<string, unknown>;
  produced_content_ids: string[];
  error: Json;
  triggered_by: string | null;
  created_at: string;
}

export interface QueueJob {
  id: string;
  queue: string;
  type: string;
  payload: Record<string, unknown>;
  status: JobStatus;
  priority: number;
  run_after: string;
  attempts: number;
  max_attempts: number;
  idempotency_key: string | null;
  locked_by: string | null;
  locked_at: string | null;
  timeout_seconds: number;
  last_error: Json;
  result: Json;
  client_id: string | null;
  task_id: string | null;
  task_run_id: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface Content {
  id: string;
  client_id: string;
  task_id: string | null;
  task_run_id: string | null;
  platform: Platform;
  social_account_id: string | null;
  format: ContentFormat;
  title: string | null;
  body: string | null;
  hashtags: string[];
  call_to_action: string | null;
  link_url: string | null;
  status: ContentStatus;
  scheduled_for: string | null;
  timezone: string;
  published_at: string | null;
  external_id: string | null;
  external_url: string | null;
  attempts: number;
  last_error: Json;
  ai_prompt: string | null;
  ai_model: string | null;
  ai_metadata: Record<string, unknown>;
  version: number;
  is_demo: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContentAsset {
  id: string;
  content_id: string | null;
  client_id: string;
  kind: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'FONT' | 'LOGO' | 'TEMPLATE';
  storage_path: string | null;
  public_url: string | null;
  external_url: string | null;
  mime_type: string | null;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  bytes: number | null;
  checksum: string | null;
  source: 'UPLOAD' | 'AI' | 'STUDIO' | 'IMPORT';
  position: number;
  metadata: Record<string, unknown>;
  is_demo: boolean;
  created_at: string;
}

export interface AdCampaign {
  id: string;
  client_id: string;
  ad_account_id: string;
  platform: Platform;
  task_id: string | null;
  name: string;
  objective: string;
  status: CampaignStatus;
  external_status: string | null;
  external_id: string | null;
  external_url: string | null;
  buying_type: string | null;
  special_ad_categories: string[];
  daily_budget: number | null;
  lifetime_budget: number | null;
  budget_level: 'CAMPAIGN' | 'ADSET';
  currency: string;
  bid_strategy: string | null;
  spend_cap: number | null;
  starts_at: string | null;
  ends_at: string | null;
  origin: 'MANUAL' | 'AUTOMATIC';
  requires_approval: boolean;
  approved_at: string | null;
  approved_by: string | null;
  published_at: string | null;
  last_synced_at: string | null;
  last_error: Json;
  idempotency_key: string | null;
  is_demo: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdSet {
  id: string;
  campaign_id: string;
  client_id: string;
  name: string;
  external_id: string | null;
  status: CampaignStatus;
  external_status: string | null;
  optimization_goal: string | null;
  billing_event: string | null;
  bid_amount: number | null;
  daily_budget: number | null;
  lifetime_budget: number | null;
  starts_at: string | null;
  ends_at: string | null;
  targeting: Record<string, unknown>;
  placements: Record<string, unknown>;
  audience_id: string | null;
  promoted_object: Json;
  last_error: Json;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
}

export interface Creative {
  id: string;
  client_id: string;
  platform: Platform;
  name: string;
  external_id: string | null;
  format: 'SINGLE_IMAGE' | 'SINGLE_VIDEO' | 'CAROUSEL';
  primary_text: string | null;
  headline: string | null;
  description: string | null;
  call_to_action: string | null;
  destination_url: string | null;
  display_url: string | null;
  content_id: string | null;
  asset_ids: string[];
  page_external_id: string | null;
  instagram_external_id: string | null;
  spec: Record<string, unknown>;
  source: 'MANUAL' | 'AI' | 'STUDIO' | 'CONTENT';
  is_demo: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Ad {
  id: string;
  ad_set_id: string;
  campaign_id: string;
  client_id: string;
  creative_id: string | null;
  name: string;
  external_id: string | null;
  external_url: string | null;
  status: CampaignStatus;
  external_status: string | null;
  review_status: string | null;
  last_error: Json;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
}

export interface AnalyticsRow {
  id: string;
  client_id: string;
  platform: Platform;
  scope: 'ACCOUNT' | 'CONTENT' | 'CAMPAIGN' | 'ADSET' | 'AD';
  entity_id: string | null;
  external_id: string | null;
  date: string;
  impressions: number;
  reach: number;
  clicks: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  video_views: number;
  followers: number;
  follower_delta: number;
  conversions: number;
  engagement_rate: number | null;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  cost_per_result: number | null;
  spend: number;
  currency: string | null;
  raw: Record<string, unknown>;
  is_demo: boolean;
  synced_at: string;
}

export interface PaymentTransaction {
  id: string;
  reference: string;
  client_id: string;
  user_id: string | null;
  platform: Platform | null;
  ad_account_id: string | null;
  campaign_id: string | null;
  provider: string;
  payment_method_id: string | null;
  billing_account_id: string | null;
  purpose: 'AD_SPEND' | 'TOP_UP' | 'SUBSCRIPTION' | 'FEE';
  ad_spend_amount: number;
  nojads_fee: number;
  gateway_fee: number;
  total_amount: number;
  currency: string;
  fx_rate: number | null;
  fx_source: string | null;
  original_amount: number | null;
  original_currency: string | null;
  status: TransactionStatus;
  status_reason: string | null;
  idempotency_key: string;
  external_id: string | null;
  external_status: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  authorized_at: string | null;
  succeeded_at: string | null;
  failed_at: string | null;
  refunded_amount: number;
  metadata: Record<string, unknown>;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
}

export interface BillingAccount {
  id: string;
  client_id: string;
  ad_account_id: string | null;
  platform: Platform;
  provider: string;
  external_id: string | null;
  currency: string | null;
  funding_model: string | null;
  balance: number | null;
  credit_limit: number | null;
  next_bill_at: string | null;
  supported_operations: string[];
  status: string;
  status_reason: string | null;
  last_synced_at: string | null;
  raw: Record<string, unknown>;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
}

export interface PaymentMethod {
  id: string;
  client_id: string;
  customer_id: string | null;
  provider: string;
  external_id: string;
  kind: 'CARD' | 'BANK' | 'WALLET' | 'PLATFORM';
  brand: string | null;
  last4: string | null;
  exp_month: number | null;
  exp_year: number | null;
  holder_name: string | null;
  is_default: boolean;
  status: string;
  metadata: Record<string, unknown>;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
}

export interface Invoice {
  id: string;
  number: string;
  client_id: string;
  transaction_id: string | null;
  period_start: string | null;
  period_end: string | null;
  ad_spend_amount: number;
  nojads_fee: number;
  gateway_fee: number;
  tax_amount: number;
  total_amount: number;
  currency: string;
  status: 'DRAFT' | 'ISSUED' | 'PAID' | 'VOID';
  issued_at: string;
  due_at: string | null;
  paid_at: string | null;
  line_items: Json;
  storage_path: string | null;
  is_demo: boolean;
  created_at: string;
}

export interface SpendLimits {
  id: string;
  client_id: string;
  currency: string;
  daily_limit: number | null;
  monthly_limit: number | null;
  per_campaign_limit: number | null;
  per_transaction_limit: number | null;
  require_approval_above: number | null;
  ai_max_budget_increase_pct: number;
  block_automatic_payments: boolean;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Approval {
  id: string;
  client_id: string;
  subject: ApprovalSubject;
  subject_id: string;
  status: ApprovalStatus;
  summary: string;
  details: Record<string, unknown>;
  amount: number | null;
  currency: string | null;
  requested_by: string | null;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  expires_at: string | null;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string | null;
  client_id: string | null;
  type: string;
  severity: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';
  title: string;
  body: string | null;
  link: string | null;
  data: Record<string, unknown>;
  read_at: string | null;
  is_demo: boolean;
  created_at: string;
}

export interface ActivityLog {
  id: number;
  channel: LogChannel;
  level: LogLevel;
  action: string;
  message: string | null;
  user_id: string | null;
  client_id: string | null;
  task_id: string | null;
  task_run_id: string | null;
  content_id: string | null;
  campaign_id: string | null;
  transaction_id: string | null;
  job_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
  result: string | null;
  error: Json;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface IntegrationSetting {
  id: string;
  provider: string;
  is_configured: boolean;
  api_version: string | null;
  scopes: string[];
  redirect_uri: string | null;
  notes: string | null;
  checked_at: string | null;
  updated_by: string | null;
  updated_at: string;
}

export interface Report {
  id: string;
  client_id: string;
  kind: string;
  title: string;
  period_start: string;
  period_end: string;
  summary: string | null;
  data: Record<string, unknown>;
  recommendations: Json;
  storage_path: string | null;
  generated_by: string;
  is_demo: boolean;
  created_at: string;
}
