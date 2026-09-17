/**
 * Provider contracts.
 *
 * Every external platform reaches NojAds through one of these interfaces, so a
 * new network can be added without touching the task engine, the workers or
 * the UI. A provider that cannot do something throws NotSupportedError or
 * NotImplementedError — it never returns a fabricated success.
 */
import type {
  ContentFormat, Platform, SocialAccount, AdAccount, Client, BrandSettings,
} from '@/types/models';
import type { PlatformCapabilities } from '@/server/platform/capabilities';

// ------------------------------------------------------------------ common

export interface ProviderContext {
  clientId: string;
  /** Decrypted at the call site, never logged, never returned to the browser. */
  accessToken: string;
  account?: SocialAccount;
  adAccount?: AdAccount;
  requestId?: string;
}

export interface MediaInput {
  /** Publicly reachable URL. Platforms fetch media themselves. */
  url: string;
  kind: 'IMAGE' | 'VIDEO';
  mimeType?: string;
  width?: number;
  height?: number;
  durationMs?: number;
  thumbnailUrl?: string;
  caption?: string;
}

// ---------------------------------------------------------- SocialProvider

export interface PublishInput {
  format: ContentFormat;
  body: string;
  title?: string;
  hashtags?: string[];
  linkUrl?: string;
  media: MediaInput[];
  /** ISO 8601. Providers with native scheduling use it; others ignore it and
   *  the NojAds scheduler publishes at the right moment instead. */
  scheduledFor?: string;
  idempotencyKey: string;
}

export interface PublishResult {
  externalId: string;
  externalUrl?: string;
  publishedAt: string;
  /** Verbatim response, for the audit trail. */
  raw: Record<string, unknown>;
}

export interface AccountInsights {
  externalId: string;
  date: string;
  followers?: number;
  impressions?: number;
  reach?: number;
  profileViews?: number;
  raw: Record<string, unknown>;
}

export interface PostInsights {
  externalId: string;
  impressions?: number;
  reach?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  videoViews?: number;
  raw: Record<string, unknown>;
}

export interface DiscoveredAccount {
  externalId: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  profileUrl?: string;
  accountType?: string;
  parentExternalId?: string;
  platform: Platform;
  metadata: Record<string, unknown>;
}

export interface OAuthStartResult {
  authorizationUrl: string;
  state: string;
  codeVerifier?: string;
}

export interface OAuthTokenSet {
  accessToken: string;
  refreshToken?: string;
  tokenType?: string;
  expiresAt?: string;
  refreshExpiresAt?: string;
  scopes: string[];
}

export interface SocialProvider {
  readonly platform: Platform;
  readonly capabilities: PlatformCapabilities;

  /** Whether this deployment has the credentials this provider needs. */
  isConfigured(): boolean;
  missingConfiguration(): string[];

  buildAuthorizationUrl(args: { state: string; redirectUri: string }): OAuthStartResult;
  exchangeCode(args: { code: string; redirectUri: string; codeVerifier?: string }): Promise<OAuthTokenSet>;
  refreshToken(args: { refreshToken: string }): Promise<OAuthTokenSet>;
  revoke(ctx: ProviderContext): Promise<void>;

  /** Accounts the granted token can actually act on. */
  discoverAccounts(accessToken: string): Promise<DiscoveredAccount[]>;
  verifyConnection(ctx: ProviderContext): Promise<{ healthy: boolean; reason?: string; scopes: string[] }>;

  publish(ctx: ProviderContext, input: PublishInput): Promise<PublishResult>;
  deletePost(ctx: ProviderContext, externalId: string): Promise<void>;

  getAccountInsights(ctx: ProviderContext, args: { since: string; until: string }): Promise<AccountInsights[]>;
  getPostInsights(ctx: ProviderContext, externalIds: string[]): Promise<PostInsights[]>;
}

// ------------------------------------------------------------- AdsProvider

export interface CampaignDraft {
  name: string;
  objective: string;
  dailyBudget?: number;
  lifetimeBudget?: number;
  budgetLevel: 'CAMPAIGN' | 'ADSET';
  bidStrategy?: string;
  spendCap?: number;
  specialAdCategories: string[];
  startsAt?: string;
  endsAt?: string;
  /** Campaigns are always created paused. Nothing spends without an explicit
   *  resume by a person. */
  status: 'PAUSED';
  idempotencyKey: string;
}

export interface AdSetDraft {
  name: string;
  campaignExternalId: string;
  optimizationGoal: string;
  billingEvent: string;
  bidAmount?: number;
  dailyBudget?: number;
  lifetimeBudget?: number;
  startsAt?: string;
  endsAt?: string;
  targeting: TargetingSpec;
  placements: PlacementSpec;
  promotedObject?: Record<string, unknown>;
  idempotencyKey: string;
}

export interface TargetingSpec {
  countries?: string[];
  cities?: { key: string; radiusKm?: number }[];
  ageMin?: number;
  ageMax?: number;
  genders?: ('MALE' | 'FEMALE' | 'ALL')[];
  languages?: string[];
  interests?: { id: string; name: string }[];
  behaviors?: { id: string; name: string }[];
  customAudienceIds?: string[];
  excludedCustomAudienceIds?: string[];
}

export interface PlacementSpec {
  mode: 'AUTOMATIC' | 'MANUAL';
  /** 'publisher:position' pairs from the capability registry. */
  selected?: string[];
}

export interface CreativeDraft {
  name: string;
  format: 'SINGLE_IMAGE' | 'SINGLE_VIDEO' | 'CAROUSEL';
  primaryText: string;
  headline?: string;
  description?: string;
  callToAction?: string;
  destinationUrl?: string;
  pageExternalId?: string;
  instagramExternalId?: string;
  media: MediaInput[];
  idempotencyKey: string;
}

export interface AdDraft {
  name: string;
  adSetExternalId: string;
  creativeExternalId: string;
  status: 'PAUSED';
  idempotencyKey: string;
}

export interface ExternalRef {
  externalId: string;
  externalUrl?: string;
  raw: Record<string, unknown>;
}

export interface RemoteCampaign {
  externalId: string;
  name: string;
  objective: string;
  status: string;
  dailyBudget?: number;
  lifetimeBudget?: number;
  currency?: string;
  startsAt?: string;
  endsAt?: string;
  raw: Record<string, unknown>;
}

export interface CampaignMetrics {
  externalId: string;
  date: string;
  impressions: number;
  reach: number;
  clicks: number;
  spend: number;
  currency: string;
  ctr?: number;
  cpc?: number;
  cpm?: number;
  conversions?: number;
  costPerResult?: number;
  videoViews?: number;
  raw: Record<string, unknown>;
}

export interface RemoteAdAccount {
  externalId: string;
  name: string;
  currency: string;
  timezone?: string;
  accountStatus: string;
  businessId?: string;
  businessName?: string;
  fundingSource?: string;
  spendCap?: number;
  amountSpent?: number;
  raw: Record<string, unknown>;
}

export interface AdsProvider {
  readonly platform: Platform;
  readonly capabilities: PlatformCapabilities;

  isConfigured(): boolean;
  missingConfiguration(): string[];

  getAdAccounts(accessToken: string): Promise<RemoteAdAccount[]>;
  getAdAccount(ctx: ProviderContext, externalId: string): Promise<RemoteAdAccount>;

  getCampaigns(ctx: ProviderContext): Promise<RemoteCampaign[]>;
  getCampaign(ctx: ProviderContext, externalId: string): Promise<RemoteCampaign>;

  createCampaign(ctx: ProviderContext, draft: CampaignDraft): Promise<ExternalRef>;
  createAdSet(ctx: ProviderContext, draft: AdSetDraft): Promise<ExternalRef>;
  createCreative(ctx: ProviderContext, draft: CreativeDraft): Promise<ExternalRef>;
  createAd(ctx: ProviderContext, draft: AdDraft): Promise<ExternalRef>;

  pauseCampaign(ctx: ProviderContext, externalId: string): Promise<void>;
  resumeCampaign(ctx: ProviderContext, externalId: string): Promise<void>;
  updateCampaign(ctx: ProviderContext, externalId: string, patch: Partial<CampaignDraft>): Promise<void>;
  deleteCampaign(ctx: ProviderContext, externalId: string): Promise<void>;

  getCampaignMetrics(
    ctx: ProviderContext,
    args: { externalIds: string[]; since: string; until: string },
  ): Promise<CampaignMetrics[]>;
}

// -------------------------------------------------------------- AIProvider

export interface AIBrandContext {
  client: Pick<Client, 'name' | 'company' | 'description' | 'category' | 'target_audience' |
    'products' | 'services' | 'language' | 'country' | 'city' | 'website'>;
  brand?: Pick<BrandSettings, 'tone_of_voice' | 'visual_style' | 'allowed_words' |
    'forbidden_words' | 'calls_to_action' | 'audience' | 'positioning' | 'primary_colors'> | null;
  platform: Platform;
  format: ContentFormat;
  objective?: string;
  campaignName?: string;
  recentPosts?: { body: string; publishedAt: string; engagementRate?: number | null }[];
  metricsSummary?: string;
  extraInstructions?: string;
}

export interface GeneratedPost {
  title?: string;
  body: string;
  hashtags: string[];
  callToAction?: string;
  imageBrief?: string;
  videoScript?: { scene: string; onScreenText: string; voiceover: string; seconds: number }[];
}

export interface GeneratedAdCopy {
  primaryText: string;
  headline: string;
  description: string;
  callToAction: string;
}

export interface AIUsage {
  provider: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs: number;
}

export interface AIResult<T> {
  data: T;
  usage: AIUsage;
  prompt: { system: string; user: string };
}

export interface AIProvider {
  readonly name: string;
  isConfigured(): boolean;
  missingConfiguration(): string[];

  generatePosts(ctx: AIBrandContext, count: number): Promise<AIResult<GeneratedPost[]>>;
  generateAdCopy(ctx: AIBrandContext, variants: number): Promise<AIResult<GeneratedAdCopy[]>>;
  generateIdeas(ctx: AIBrandContext, count: number): Promise<AIResult<string[]>>;
  analyzePerformance(ctx: AIBrandContext, metrics: string): Promise<AIResult<{
    findings: string[];
    recommendations: { action: string; rationale: string; impact: 'ALTO' | 'MEDIO' | 'BAIXO' }[];
  }>>;
}

// ----------------------------------------------------------- VideoProvider

export interface VideoScene {
  seconds: number;
  onScreenText: string;
  voiceover?: string;
  imageUrl?: string;
  clipUrl?: string;
}

export interface VideoRenderRequest {
  clientId: string;
  format: 'REEL' | 'STORY' | 'SHORT' | 'VIDEO';
  aspectRatio: '9:16' | '1:1' | '16:9';
  scenes: VideoScene[];
  audioUrl?: string;
  brand?: { primaryColor?: string; logoUrl?: string; fontFamily?: string };
  idempotencyKey: string;
}

export type VideoRenderStatus = 'QUEUED' | 'RENDERING' | 'READY' | 'FAILED';

export interface VideoRenderResult {
  renderId: string;
  status: VideoRenderStatus;
  url?: string;
  durationMs?: number;
  error?: string;
}

export interface VideoProvider {
  readonly name: string;
  isConfigured(): boolean;
  missingConfiguration(): string[];
  render(request: VideoRenderRequest): Promise<VideoRenderResult>;
  getRender(renderId: string): Promise<VideoRenderResult>;
}

// --------------------------------------------------- Payment and Billing

export interface MoneyBreakdown {
  adSpend: number;
  nojadsFee: number;
  gatewayFee: number;
  total: number;
  currency: string;
}

export interface ChargeRequest {
  clientId: string;
  campaignId?: string;
  amount: MoneyBreakdown;
  paymentMethodExternalId?: string;
  customerExternalId?: string;
  description: string;
  idempotencyKey: string;
  /** Set by a human clicking "Confirmar pagamento". Never set by the AI. */
  confirmedByUserId: string;
}

export interface ChargeResult {
  externalId: string;
  status: 'PENDING' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED';
  /** Present when the provider requires the person to finish elsewhere. */
  redirectUrl?: string;
  raw: Record<string, unknown>;
}

export interface PaymentProvider {
  readonly name: string;
  isConfigured(): boolean;
  missingConfiguration(): string[];
  createCustomer(args: { clientId: string; email?: string; name?: string }): Promise<{ externalId: string }>;
  listPaymentMethods(customerExternalId: string): Promise<{
    externalId: string; brand?: string; last4?: string; expMonth?: number; expYear?: number;
  }[]>;
  charge(request: ChargeRequest): Promise<ChargeResult>;
  refund(args: { transactionExternalId: string; amount: number; currency: string; idempotencyKey: string }): Promise<ChargeResult>;
  verifyWebhook(args: { rawBody: string; signature: string }): { valid: boolean; eventId?: string; eventType?: string; payload?: unknown };
}

export interface PlatformBillingSnapshot {
  externalId: string;
  currency: string;
  fundingModel: 'PREPAID' | 'POSTPAID' | 'UNKNOWN';
  balance?: number;
  creditLimit?: number;
  nextBillAt?: string;
  status: string;
  canSpend: boolean;
  reason?: string;
  supportedOperations: string[];
  raw: Record<string, unknown>;
}

export interface BillingProvider {
  readonly platform: Platform;
  readonly name: string;
  isConfigured(): boolean;
  missingConfiguration(): string[];
  /** Reads what the platform actually exposes. Never guesses. */
  getSnapshot(ctx: ProviderContext, adAccountExternalId: string): Promise<PlatformBillingSnapshot>;
}
