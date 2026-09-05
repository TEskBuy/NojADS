/**
 * Prompt construction.
 *
 * The brand profile is not decoration: when a client has a tone of voice,
 * forbidden words and a stated audience, the model is given all of it, so the
 * output is specific to that business rather than generic marketing filler
 * (requisito 15).
 */
import type { AIBrandContext } from '@/server/providers/types';

const PLATFORM_GUIDANCE: Record<string, string> = {
  FACEBOOK: 'Facebook: 1 a 3 paragrafos curtos. Emojis com moderacao. Ate 5 hashtags.',
  INSTAGRAM: 'Instagram: primeira linha e o gancho. Legenda ate 2200 caracteres. 8 a 15 hashtags relevantes no fim.',
  TIKTOK: 'TikTok: linguagem falada, gancho nos primeiros 2 segundos. Legenda curta. 3 a 5 hashtags.',
  YOUTUBE: 'YouTube: titulo com ate 70 caracteres, descricao com contexto e ligacoes.',
  LINKEDIN: 'LinkedIn: tom profissional, foco em resultado e credibilidade. Poucas hashtags.',
  X: 'X: ate 280 caracteres por publicacao. Direto.',
  GOOGLE: 'Google Ads: titulos ate 30 caracteres, descricoes ate 90 caracteres.',
};

const FORMAT_GUIDANCE: Record<string, string> = {
  POST: 'Publicacao estatica com uma imagem.',
  CAROUSEL: 'Carrossel: indica o que aparece em cada cartao.',
  REEL: 'Reel vertical de 15 a 45 segundos. Devolve tambem um guiao por cenas.',
  STORY: 'Story vertical, uma ideia so, texto muito curto.',
  VIDEO: 'Video horizontal. Devolve tambem um guiao por cenas.',
  FLYER: 'Flyer: texto para uma peca grafica. Titulo grande, subtitulo, oferta, CTA.',
  SHORT: 'Video curto vertical ate 60 segundos. Devolve tambem um guiao por cenas.',
};

export function buildSystemPrompt(ctx: AIBrandContext): string {
  const lines: string[] = [
    'Es o estrategista de conteudo do NojAds, uma plataforma de gestao de redes sociais.',
    'Escreves sempre em portugues de Angola, natural e direto.',
    'Nao inventas factos sobre o negocio. Se um dado nao te foi dado, nao o afirmas.',
    'Nao prometes resultados nem usas linguagem publicitaria enganosa.',
    'Respondes exclusivamente com JSON valido, sem texto antes ou depois, sem blocos de codigo.',
  ];

  lines.push('', '## Cliente');
  lines.push(`Nome: ${ctx.client.name}`);
  if (ctx.client.company) lines.push(`Empresa: ${ctx.client.company}`);
  if (ctx.client.category) lines.push(`Setor: ${ctx.client.category}`);
  if (ctx.client.description) lines.push(`Descricao: ${ctx.client.description}`);
  if (ctx.client.target_audience) lines.push(`Publico-alvo: ${ctx.client.target_audience}`);
  if (ctx.client.products?.length) lines.push(`Produtos: ${ctx.client.products.join(', ')}`);
  if (ctx.client.services?.length) lines.push(`Servicos: ${ctx.client.services.join(', ')}`);
  if (ctx.client.city || ctx.client.country) {
    lines.push(`Localizacao: ${[ctx.client.city, ctx.client.country].filter(Boolean).join(', ')}`);
  }
  if (ctx.client.website) lines.push(`Website: ${ctx.client.website}`);

  if (ctx.brand) {
    lines.push('', '## Identidade da marca');
    if (ctx.brand.tone_of_voice) lines.push(`Tom de voz: ${ctx.brand.tone_of_voice}`);
    if (ctx.brand.positioning) lines.push(`Posicionamento: ${ctx.brand.positioning}`);
    if (ctx.brand.audience) lines.push(`Audiencia da marca: ${ctx.brand.audience}`);
    if (ctx.brand.visual_style) lines.push(`Estilo visual: ${ctx.brand.visual_style}`);
    if (ctx.brand.calls_to_action?.length) {
      lines.push(`Chamadas para acao preferidas: ${ctx.brand.calls_to_action.join(' | ')}`);
    }
    if (ctx.brand.allowed_words?.length) {
      lines.push(`Palavras a privilegiar: ${ctx.brand.allowed_words.join(', ')}`);
    }
    if (ctx.brand.forbidden_words?.length) {
      lines.push(`PROIBIDO usar estas palavras: ${ctx.brand.forbidden_words.join(', ')}`);
    }
  }

  lines.push('', '## Canal');
  lines.push(PLATFORM_GUIDANCE[ctx.platform] ?? ctx.platform);
  lines.push(FORMAT_GUIDANCE[ctx.format] ?? ctx.format);

  if (ctx.recentPosts?.length) {
    lines.push('', '## Publicacoes recentes (nao repetir angulo nem abertura)');
    for (const post of ctx.recentPosts.slice(0, 8)) {
      lines.push(`- ${post.body.slice(0, 160).replace(/\s+/g, ' ')}`);
    }
  }
  if (ctx.metricsSummary) {
    lines.push('', '## Desempenho recente', ctx.metricsSummary);
  }
  if (ctx.objective) lines.push('', `## Objetivo da campanha`, ctx.objective);
  if (ctx.extraInstructions) lines.push('', '## Instrucoes adicionais', ctx.extraInstructions);

  return lines.join('\n');
}

export function postsUserPrompt(count: number, ctx: AIBrandContext): string {
  const needsScript = ['REEL', 'VIDEO', 'SHORT'].includes(ctx.format);
  return [
    `Gera ${count} ${count === 1 ? 'publicacao' : 'publicacoes'} distintas.`,
    'Cada uma com um angulo diferente. Nada de variacoes da mesma frase.',
    '',
    'Responde com este JSON exato:',
    '{"posts":[{',
    '  "title": "titulo curto ou null",',
    '  "body": "texto da publicacao",',
    '  "hashtags": ["semcardinal"],',
    '  "callToAction": "chamada para acao",',
    '  "imageBrief": "descricao do visual a produzir"' + (needsScript ? ',' : ''),
    needsScript
      ? '  "videoScript": [{"scene":"o que se ve","onScreenText":"texto no ecra","voiceover":"narracao","seconds":5}]'
      : '',
    '}]}',
  ].filter(Boolean).join('\n');
}

export function adCopyUserPrompt(variants: number): string {
  return [
    `Gera ${variants} variacoes de texto para anuncio pago.`,
    'Cada variacao testa um angulo diferente (dor, beneficio, prova social, urgencia).',
    '',
    'Responde com este JSON exato:',
    '{"variants":[{"primaryText":"texto principal","headline":"titulo ate 40 caracteres",',
    '"description":"descricao ate 30 palavras","callToAction":"LEARN_MORE"}]}',
    '',
    'callToAction tem de ser um destes valores literais: LEARN_MORE, SHOP_NOW, SIGN_UP,',
    'CONTACT_US, DOWNLOAD, GET_QUOTE, SUBSCRIBE, WHATSAPP_MESSAGE, MESSAGE_PAGE,',
    'CALL_NOW, APPLY_NOW, GET_OFFER, ORDER_NOW, BOOK_TRAVEL.',
  ].join('\n');
}

export function ideasUserPrompt(count: number): string {
  return [
    `Gera ${count} ideias de conteudo especificas para este cliente.`,
    'Cada ideia numa frase acionavel, nao um tema generico.',
    '',
    'Responde com este JSON exato: {"ideas":["ideia 1","ideia 2"]}',
  ].join('\n');
}

export function analysisUserPrompt(metrics: string): string {
  return [
    'Analisa os dados de desempenho abaixo.',
    '',
    metrics,
    '',
    'Responde com este JSON exato:',
    '{"findings":["o que os dados mostram"],',
    ' "recommendations":[{"action":"o que fazer","rationale":"porque","impact":"ALTO"}]}',
    '',
    'impact tem de ser ALTO, MEDIO ou BAIXO.',
    'Nao recomendes aumentar orcamento em mais de 20% numa unica alteracao.',
  ].join('\n');
}
