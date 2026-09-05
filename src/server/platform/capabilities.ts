/**
 * Platform capability registry (requisito 62).
 *
 * This file is the single source of truth for what each platform can and
 * cannot do. The Ads Manager, the task editor and the billing screens all read
 * from here, so an option the platform does not offer is never rendered as if
 * it did, and an option NojAds has not built yet is labelled as such instead of
 * silently succeeding.
 *
 * Three distinct states, and the difference matters:
 *   SUPPORTED       the official API offers it and NojAds implements it
 *   NOT_IMPLEMENTED the official API offers it, NojAds does not do it yet
 *   NOT_SUPPORTED   the official API genuinely does not offer it
 *
 * Nothing here is a guess about a platform's roadmap. When a platform changes
 * its API, this file is what gets updated — not the screens.
 */
import type { ContentFormat, Platform } from '@/types/models';

export type Support = 'SUPPORTED' | 'NOT_IMPLEMENTED' | 'NOT_SUPPORTED';

export interface CapabilityNote {
  level: 'INFO' | 'WARNING';
  text: string;
}

export interface AdObjective {
  value: string;
  label: string;
  description: string;
  support: Support;
}

export interface AdPlacement {
  value: string;
  label: string;
  group: string;
  support: Support;
}

export interface OptionItem {
  value: string;
  label: string;
}

export interface SocialCapabilities {
  support: Support;
  oauth: Support;
  publish: Partial<Record<ContentFormat, Support>>;
  nativeScheduling: Support;
  deletePost: Support;
  insights: Support;
  commentManagement: Support;
  requiredScopes: string[];
  notes: CapabilityNote[];
}

export interface TargetingCapabilities {
  locations: Support;
  ageRange: Support;
  gender: Support;
  languages: Support;
  interests: Support;
  behaviors: Support;
  customAudiences: Support;
  lookalikeAudiences: Support;
  remarketing: Support;
}

export interface AdsCapabilities {
  support: Support;
  objectives: AdObjective[];
  creativeFormats: OptionItem[];
  callsToAction: OptionItem[];
  placementMode: { automatic: Support; manual: Support };
  placements: AdPlacement[];
  targeting: TargetingCapabilities;
  budget: {
    daily: Support;
    lifetime: Support;
    campaignBudgetOptimization: Support;
    bidStrategies: OptionItem[];
    minimumDailyBudgetUsd: number | null;
  };
  optimizationGoals: OptionItem[];
  billingEvents: OptionItem[];
  operations: {
    createCampaign: Support;
    createAdSet: Support;
    createCreative: Support;
    createAd: Support;
    publish: Support;
    pause: Support;
    resume: Support;
    updateBudget: Support;
    updateTargeting: Support;
    updateCreative: Support;
    duplicate: Support;
    delete: Support;
    metrics: Support;
  };
  preview: Support;
  notes: CapabilityNote[];
}

export interface BillingCapabilities {
  support: Support;
  readBalance: Support;
  readFundingSource: Support;
  listPaymentMethods: Support;
  addPaymentMethod: Support;
  chargeInApp: Support;
  topUpPrepaid: Support;
  readInvoices: Support;
  refunds: Support;
  supportedCurrencies: string[] | 'ACCOUNT_DEFINED';
  notes: CapabilityNote[];
}

export interface PlatformCapabilities {
  platform: Platform;
  label: string;
  connectorStatus: 'IMPLEMENTED' | 'SCAFFOLDED';
  docsUrl: string;
  envKeys: string[];
  social: SocialCapabilities;
  ads: AdsCapabilities;
  billing: BillingCapabilities;
}

// ---------------------------------------------------------------- shared bits

const NO_ADS: AdsCapabilities = {
  support: 'NOT_IMPLEMENTED',
  objectives: [],
  creativeFormats: [],
  callsToAction: [],
  placementMode: { automatic: 'NOT_IMPLEMENTED', manual: 'NOT_IMPLEMENTED' },
  placements: [],
  targeting: {
    locations: 'NOT_IMPLEMENTED', ageRange: 'NOT_IMPLEMENTED', gender: 'NOT_IMPLEMENTED',
    languages: 'NOT_IMPLEMENTED', interests: 'NOT_IMPLEMENTED', behaviors: 'NOT_IMPLEMENTED',
    customAudiences: 'NOT_IMPLEMENTED', lookalikeAudiences: 'NOT_IMPLEMENTED',
    remarketing: 'NOT_IMPLEMENTED',
  },
  budget: {
    daily: 'NOT_IMPLEMENTED', lifetime: 'NOT_IMPLEMENTED',
    campaignBudgetOptimization: 'NOT_IMPLEMENTED', bidStrategies: [],
    minimumDailyBudgetUsd: null,
  },
  optimizationGoals: [],
  billingEvents: [],
  operations: {
    createCampaign: 'NOT_IMPLEMENTED', createAdSet: 'NOT_IMPLEMENTED',
    createCreative: 'NOT_IMPLEMENTED', createAd: 'NOT_IMPLEMENTED',
    publish: 'NOT_IMPLEMENTED', pause: 'NOT_IMPLEMENTED', resume: 'NOT_IMPLEMENTED',
    updateBudget: 'NOT_IMPLEMENTED', updateTargeting: 'NOT_IMPLEMENTED',
    updateCreative: 'NOT_IMPLEMENTED', duplicate: 'NOT_IMPLEMENTED',
    delete: 'NOT_IMPLEMENTED', metrics: 'NOT_IMPLEMENTED',
  },
  preview: 'NOT_IMPLEMENTED',
  notes: [{
    level: 'WARNING',
    text: 'O conector de anuncios desta plataforma ainda nao foi construido no NojAds. ' +
          'Nenhuma campanha e criada nem cobrada a partir daqui.',
  }],
};

const NO_BILLING: BillingCapabilities = {
  support: 'NOT_IMPLEMENTED',
  readBalance: 'NOT_IMPLEMENTED',
  readFundingSource: 'NOT_IMPLEMENTED',
  listPaymentMethods: 'NOT_IMPLEMENTED',
  addPaymentMethod: 'NOT_IMPLEMENTED',
  chargeInApp: 'NOT_IMPLEMENTED',
  topUpPrepaid: 'NOT_IMPLEMENTED',
  readInvoices: 'NOT_IMPLEMENTED',
  refunds: 'NOT_IMPLEMENTED',
  supportedCurrencies: 'ACCOUNT_DEFINED',
  notes: [{
    level: 'WARNING',
    text: 'O NojAds ainda nao le nem processa faturacao desta plataforma. ' +
          'Use o painel oficial da plataforma para pagamentos.',
  }],
};

// ------------------------------------------------------------------ Meta

/** Meta ODAX objectives, as accepted by the Marketing API today. */
const META_OBJECTIVES: AdObjective[] = [
  { value: 'OUTCOME_AWARENESS', label: 'Reconhecimento', description: 'Alcancar o maior numero de pessoas.', support: 'SUPPORTED' },
  { value: 'OUTCOME_TRAFFIC', label: 'Trafego', description: 'Levar pessoas a um site, app ou conversa.', support: 'SUPPORTED' },
  { value: 'OUTCOME_ENGAGEMENT', label: 'Interacao', description: 'Mensagens, interacoes na publicacao ou video views.', support: 'SUPPORTED' },
  { value: 'OUTCOME_LEADS', label: 'Cadastros', description: 'Recolher contactos de potenciais clientes.', support: 'SUPPORTED' },
  { value: 'OUTCOME_APP_PROMOTION', label: 'Promocao de app', description: 'Instalacoes e eventos dentro da aplicacao.', support: 'NOT_IMPLEMENTED' },
  { value: 'OUTCOME_SALES', label: 'Vendas', description: 'Conversoes no site, app ou loja.', support: 'SUPPORTED' },
];

const META_PLACEMENTS: AdPlacement[] = [
  { value: 'facebook:feed', label: 'Feed do Facebook', group: 'Facebook', support: 'SUPPORTED' },
  { value: 'facebook:video_feeds', label: 'Feeds de video', group: 'Facebook', support: 'SUPPORTED' },
  { value: 'facebook:story', label: 'Stories do Facebook', group: 'Facebook', support: 'SUPPORTED' },
  { value: 'facebook:facebook_reels', label: 'Reels do Facebook', group: 'Facebook', support: 'SUPPORTED' },
  { value: 'facebook:marketplace', label: 'Marketplace', group: 'Facebook', support: 'SUPPORTED' },
  { value: 'facebook:search', label: 'Resultados de pesquisa', group: 'Facebook', support: 'SUPPORTED' },
  { value: 'instagram:stream', label: 'Feed do Instagram', group: 'Instagram', support: 'SUPPORTED' },
  { value: 'instagram:story', label: 'Stories do Instagram', group: 'Instagram', support: 'SUPPORTED' },
  { value: 'instagram:reels', label: 'Reels do Instagram', group: 'Instagram', support: 'SUPPORTED' },
  { value: 'instagram:explore', label: 'Explorar', group: 'Instagram', support: 'SUPPORTED' },
  { value: 'messenger:messenger_inbox', label: 'Caixa de entrada do Messenger', group: 'Messenger', support: 'SUPPORTED' },
  { value: 'audience_network:classic', label: 'Audience Network', group: 'Audience Network', support: 'SUPPORTED' },
];

const META_CTAS: OptionItem[] = [
  { value: 'LEARN_MORE', label: 'Saber mais' },
  { value: 'SHOP_NOW', label: 'Comprar agora' },
  { value: 'SIGN_UP', label: 'Registar-se' },
  { value: 'BOOK_TRAVEL', label: 'Reservar' },
  { value: 'CONTACT_US', label: 'Contactar-nos' },
  { value: 'DOWNLOAD', label: 'Transferir' },
  { value: 'GET_QUOTE', label: 'Pedir orcamento' },
  { value: 'SUBSCRIBE', label: 'Subscrever' },
  { value: 'WHATSAPP_MESSAGE', label: 'Enviar WhatsApp' },
  { value: 'MESSAGE_PAGE', label: 'Enviar mensagem' },
  { value: 'CALL_NOW', label: 'Ligar agora' },
  { value: 'APPLY_NOW', label: 'Candidatar-se' },
  { value: 'GET_OFFER', label: 'Obter oferta' },
  { value: 'ORDER_NOW', label: 'Encomendar' },
  { value: 'NO_BUTTON', label: 'Sem botao' },
];

const META: PlatformCapabilities = {
  platform: 'FACEBOOK',
  label: 'Facebook',
  connectorStatus: 'IMPLEMENTED',
  docsUrl: 'https://developers.facebook.com/docs/marketing-apis',
  envKeys: ['META_APP_ID', 'META_APP_SECRET', 'META_REDIRECT_URI'],
  social: {
    support: 'SUPPORTED',
    oauth: 'SUPPORTED',
    publish: {
      POST: 'SUPPORTED',
      CAROUSEL: 'SUPPORTED',
      VIDEO: 'SUPPORTED',
      REEL: 'SUPPORTED',
      STORY: 'NOT_IMPLEMENTED',
      FLYER: 'SUPPORTED',
      SHORT: 'NOT_SUPPORTED',
    },
    nativeScheduling: 'SUPPORTED',
    deletePost: 'SUPPORTED',
    insights: 'SUPPORTED',
    commentManagement: 'NOT_IMPLEMENTED',
    requiredScopes: [
      'pages_show_list', 'pages_read_engagement', 'pages_manage_posts', 'read_insights',
    ],
    notes: [
      { level: 'INFO', text: 'A publicacao e feita numa Pagina do Facebook, nunca num perfil pessoal — a API oficial nao permite publicar em perfis.' },
      { level: 'INFO', text: 'O agendamento nativo do Facebook aceita datas entre 10 minutos e 6 meses a partir de agora.' },
    ],
  },
  ads: {
    support: 'SUPPORTED',
    objectives: META_OBJECTIVES,
    creativeFormats: [
      { value: 'SINGLE_IMAGE', label: 'Imagem unica' },
      { value: 'SINGLE_VIDEO', label: 'Video unico' },
      { value: 'CAROUSEL', label: 'Carrossel' },
    ],
    callsToAction: META_CTAS,
    placementMode: { automatic: 'SUPPORTED', manual: 'SUPPORTED' },
    placements: META_PLACEMENTS,
    targeting: {
      locations: 'SUPPORTED',
      ageRange: 'SUPPORTED',
      gender: 'SUPPORTED',
      languages: 'SUPPORTED',
      interests: 'SUPPORTED',
      behaviors: 'SUPPORTED',
      customAudiences: 'SUPPORTED',
      lookalikeAudiences: 'NOT_IMPLEMENTED',
      remarketing: 'NOT_IMPLEMENTED',
    },
    budget: {
      daily: 'SUPPORTED',
      lifetime: 'SUPPORTED',
      campaignBudgetOptimization: 'SUPPORTED',
      bidStrategies: [
        { value: 'LOWEST_COST_WITHOUT_CAP', label: 'Maior volume (sem limite de custo)' },
        { value: 'LOWEST_COST_WITH_BID_CAP', label: 'Limite de lance' },
        { value: 'COST_CAP', label: 'Limite de custo' },
      ],
      minimumDailyBudgetUsd: 1,
    },
    optimizationGoals: [
      { value: 'REACH', label: 'Alcance' },
      { value: 'IMPRESSIONS', label: 'Impressoes' },
      { value: 'LINK_CLICKS', label: 'Cliques no link' },
      { value: 'LANDING_PAGE_VIEWS', label: 'Visualizacoes da pagina' },
      { value: 'POST_ENGAGEMENT', label: 'Interacao com a publicacao' },
      { value: 'THRUPLAY', label: 'ThruPlay (video)' },
      { value: 'LEAD_GENERATION', label: 'Cadastros' },
      { value: 'OFFSITE_CONVERSIONS', label: 'Conversoes' },
    ],
    billingEvents: [
      { value: 'IMPRESSIONS', label: 'Por impressao (CPM)' },
      { value: 'LINK_CLICKS', label: 'Por clique (CPC)' },
      { value: 'THRUPLAY', label: 'Por ThruPlay' },
    ],
    operations: {
      createCampaign: 'SUPPORTED',
      createAdSet: 'SUPPORTED',
      createCreative: 'SUPPORTED',
      createAd: 'SUPPORTED',
      publish: 'SUPPORTED',
      pause: 'SUPPORTED',
      resume: 'SUPPORTED',
      updateBudget: 'SUPPORTED',
      updateTargeting: 'SUPPORTED',
      updateCreative: 'NOT_SUPPORTED',
      duplicate: 'NOT_IMPLEMENTED',
      delete: 'SUPPORTED',
      metrics: 'SUPPORTED',
    },
    preview: 'SUPPORTED',
    notes: [
      { level: 'WARNING', text: 'A Meta nao permite trocar o criativo de um anuncio ja publicado. Para mudar o criativo e necessario criar um anuncio novo — o NojAds oferece essa opcao explicitamente.' },
      { level: 'WARNING', text: 'Campanhas em categorias especiais (credito, emprego, habitacao, temas sociais/politicos) tem segmentacao restrita pela propria Meta.' },
      { level: 'INFO', text: 'Campanhas criadas pelo NojAds nascem em PAUSED. Nada comeca a gastar sem uma acao explicita sua.' },
    ],
  },
  billing: {
    support: 'SUPPORTED',
    readBalance: 'SUPPORTED',
    readFundingSource: 'SUPPORTED',
    listPaymentMethods: 'NOT_SUPPORTED',
    addPaymentMethod: 'NOT_SUPPORTED',
    chargeInApp: 'NOT_SUPPORTED',
    topUpPrepaid: 'NOT_SUPPORTED',
    readInvoices: 'NOT_IMPLEMENTED',
    refunds: 'NOT_SUPPORTED',
    supportedCurrencies: 'ACCOUNT_DEFINED',
    notes: [
      { level: 'WARNING', text: 'A Meta nao expoe API publica para adicionar metodos de pagamento nem para cobrar um cartao. O pagamento do investimento publicitario acontece obrigatoriamente no Gestor de Anuncios da Meta, com o metodo ja associado a conta.' },
      { level: 'INFO', text: 'O NojAds le o saldo, a moeda e a fonte de financiamento da conta publicitaria e bloqueia a publicacao quando a conta nao esta apta a gastar.' },
      { level: 'INFO', text: 'A moeda da conta publicitaria e definida na Meta e nao pode ser alterada pela API. O NojAds mostra sempre a moeda real da conta.' },
    ],
  },
};

const INSTAGRAM: PlatformCapabilities = {
  ...META,
  platform: 'INSTAGRAM',
  label: 'Instagram',
  docsUrl: 'https://developers.facebook.com/docs/instagram-platform/content-publishing',
  social: {
    support: 'SUPPORTED',
    oauth: 'SUPPORTED',
    publish: {
      POST: 'SUPPORTED',
      CAROUSEL: 'SUPPORTED',
      REEL: 'SUPPORTED',
      VIDEO: 'SUPPORTED',
      STORY: 'SUPPORTED',
      FLYER: 'SUPPORTED',
      SHORT: 'NOT_SUPPORTED',
    },
    nativeScheduling: 'NOT_SUPPORTED',
    deletePost: 'NOT_SUPPORTED',
    insights: 'SUPPORTED',
    commentManagement: 'NOT_IMPLEMENTED',
    requiredScopes: [
      'instagram_basic', 'instagram_content_publish', 'instagram_manage_insights',
      'pages_show_list', 'pages_read_engagement',
    ],
    notes: [
      { level: 'WARNING', text: 'So contas Instagram Business ou Creator ligadas a uma Pagina do Facebook podem publicar pela API. Contas pessoais nao sao suportadas pela Meta.' },
      { level: 'WARNING', text: 'A API do Instagram nao tem agendamento nativo: o NojAds guarda a data e publica no momento certo atraves do seu proprio scheduler.' },
      { level: 'WARNING', text: 'A API do Instagram nao permite apagar publicacoes. Isso tem de ser feito na aplicacao.' },
      { level: 'INFO', text: 'A media tem de estar acessivel por URL publico no momento da publicacao — o NojAds gera um URL assinado temporario a partir do Storage.' },
      { level: 'INFO', text: 'A Meta aplica um limite de 50 publicacoes por conta em 24 horas.' },
    ],
  },
};

// ------------------------------------------------- platforms not yet built

function scaffold(
  platform: Platform,
  label: string,
  docsUrl: string,
  envKeys: string[],
  socialNotes: CapabilityNote[],
  billingNotes: CapabilityNote[],
): PlatformCapabilities {
  return {
    platform,
    label,
    connectorStatus: 'SCAFFOLDED',
    docsUrl,
    envKeys,
    social: {
      support: 'NOT_IMPLEMENTED',
      oauth: 'NOT_IMPLEMENTED',
      publish: {},
      nativeScheduling: 'NOT_IMPLEMENTED',
      deletePost: 'NOT_IMPLEMENTED',
      insights: 'NOT_IMPLEMENTED',
      commentManagement: 'NOT_IMPLEMENTED',
      requiredScopes: [],
      notes: socialNotes,
    },
    ads: NO_ADS,
    billing: { ...NO_BILLING, notes: billingNotes },
  };
}

const TIKTOK = scaffold(
  'TIKTOK', 'TikTok',
  'https://business-api.tiktok.com/portal/docs',
  ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET', 'TIKTOK_REDIRECT_URI'],
  [{ level: 'WARNING', text: 'O conector TikTok esta desenhado mas ainda nao implementado. A publicacao exige app aprovado no TikTok for Developers com o scope video.publish, que passa por revisao manual.' }],
  [{ level: 'WARNING', text: 'A TikTok Ads API permite ler saldo e transacoes de contas com Business Center, mas nao permite adicionar metodos de pagamento por API. O NojAds ainda nao le nada disto.' }],
);

const YOUTUBE = scaffold(
  'YOUTUBE', 'YouTube',
  'https://developers.google.com/youtube/v3/docs',
  ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI'],
  [{ level: 'WARNING', text: 'O conector YouTube esta desenhado mas ainda nao implementado. O upload de video exige quota aprovada na Google Cloud e uma auditoria da app para sair do modo de teste.' }],
  [{ level: 'INFO', text: 'O YouTube nao tem faturacao publicitaria propria: a publicidade em YouTube passa pela Google Ads.' }],
);

const LINKEDIN = scaffold(
  'LINKEDIN', 'LinkedIn',
  'https://learn.microsoft.com/linkedin/marketing/',
  ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET', 'LINKEDIN_REDIRECT_URI'],
  [{ level: 'WARNING', text: 'O conector LinkedIn esta desenhado mas ainda nao implementado. Publicar em nome de uma pagina exige acesso ao Community Management API, sujeito a aprovacao.' }],
  [{ level: 'WARNING', text: 'A LinkedIn Marketing API nao expoe adicao de metodos de pagamento. O pagamento e feito no Campaign Manager.' }],
);

const X_PLATFORM = scaffold(
  'X', 'X',
  'https://developer.x.com/en/docs/x-api',
  ['X_CLIENT_ID', 'X_CLIENT_SECRET', 'X_REDIRECT_URI'],
  [{ level: 'WARNING', text: 'O conector X esta desenhado mas ainda nao implementado. A publicacao pela API v2 depende do plano contratado — o plano gratuito tem limites muito baixos de escrita.' }],
  [{ level: 'WARNING', text: 'A X Ads API tem acesso restrito e nao esta implementada no NojAds.' }],
);

const GOOGLE_ADS = scaffold(
  'GOOGLE', 'Google Ads',
  'https://developers.google.com/google-ads/api/docs/start',
  ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_ADS_DEVELOPER_TOKEN'],
  [{ level: 'INFO', text: 'A Google Ads nao e uma rede social: nao ha publicacao organica. Apenas anuncios.' }],
  [{ level: 'WARNING', text: 'A Google Ads API permite ler contas de faturacao e orcamentos, mas nao permite processar pagamentos. Nada disto esta implementado no NojAds.' }],
);

// -------------------------------------------------------------- registry

export const PLATFORM_CAPABILITIES: Record<Platform, PlatformCapabilities> = {
  FACEBOOK: META,
  INSTAGRAM: INSTAGRAM,
  TIKTOK,
  YOUTUBE,
  LINKEDIN,
  X: X_PLATFORM,
  GOOGLE: GOOGLE_ADS,
};

export const ALL_PLATFORMS: Platform[] =
  ['FACEBOOK', 'INSTAGRAM', 'TIKTOK', 'YOUTUBE', 'LINKEDIN', 'X', 'GOOGLE'];

export function capabilitiesFor(platform: Platform): PlatformCapabilities {
  return PLATFORM_CAPABILITIES[platform];
}

export function isSupported(support: Support): boolean {
  return support === 'SUPPORTED';
}

/** Only the objectives a user may actually pick for this platform. */
export function selectableObjectives(platform: Platform): AdObjective[] {
  return capabilitiesFor(platform).ads.objectives.filter((o) => o.support === 'SUPPORTED');
}

/** Only the placements the platform offers AND NojAds can send. */
export function selectablePlacements(platform: Platform): AdPlacement[] {
  return capabilitiesFor(platform).ads.placements.filter((p) => p.support === 'SUPPORTED');
}

export function publishableFormats(platform: Platform): ContentFormat[] {
  const publish = capabilitiesFor(platform).social.publish;
  return (Object.keys(publish) as ContentFormat[]).filter((f) => publish[f] === 'SUPPORTED');
}

export function supportLabel(support: Support): string {
  switch (support) {
    case 'SUPPORTED': return 'Disponivel';
    case 'NOT_IMPLEMENTED': return 'Ainda nao implementado no NojAds';
    case 'NOT_SUPPORTED': return 'Nao suportado pela plataforma';
  }
}

/** Platforms whose ads connector is genuinely usable right now. */
export function platformsWithAds(): Platform[] {
  return ALL_PLATFORMS.filter((p) => capabilitiesFor(p).ads.support === 'SUPPORTED');
}

export function platformsWithPublishing(): Platform[] {
  return ALL_PLATFORMS.filter((p) => capabilitiesFor(p).social.support === 'SUPPORTED');
}
