/**
 * DEMO data.
 *
 *   npm run seed:demo     creates it
 *   npm run seed:clean    removes it
 *
 * Everything created here has is_demo = true and the interface labels it DEMO
 * wherever it appears. No demo row is ever presented as real: no social account
 * is connected, no campaign has a platform id, no transaction was charged.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config();

import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error(
    'Faltam variaveis: NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.\n' +
    'Defina-as em .env.local antes de correr o seed.',
  );
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });
const DEMO_SLUG = 'demo-padaria-do-bairro';

async function clean(): Promise<void> {
  console.log('[seed] A remover dados DEMO...');
  const { data: client } = await db.from('clients').select('id').eq('slug', DEMO_SLUG).maybeSingle();
  if (!client) {
    console.log('[seed] Nenhum cliente DEMO encontrado. Nada a fazer.');
    return;
  }
  // ON DELETE CASCADE removes tasks, content, campaigns, analytics and logs.
  const { error } = await db.from('clients').delete().eq('id', client.id);
  if (error) throw new Error(error.message);
  console.log('[seed] Dados DEMO removidos.');
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function dateDaysAgo(days: number): string {
  return isoDaysAgo(days).slice(0, 10);
}

async function seed(): Promise<void> {
  console.log('[seed] A criar dados DEMO (marcados como DEMO em toda a interface)...');

  await clean();

  const { data: client, error: clientError } = await db.from('clients').insert({
    name: 'Padaria do Bairro (DEMO)',
    company: 'Padaria do Bairro Lda',
    slug: DEMO_SLUG,
    description:
      'Padaria de bairro em Luanda, aberta desde 2011. Pao fresco de madrugada, ' +
      'bolos por encomenda e um pequeno espaco de cafe.',
    website: 'https://exemplo-demo.ao',
    country: 'Angola',
    city: 'Luanda',
    category: 'Restauracao e panificacao',
    target_audience:
      'Familias do bairro entre os 25 e os 55 anos, trabalhadores da zona ao almoco, ' +
      'e encomendas de bolos para festas.',
    products: ['Pao de trigo', 'Pao de milho', 'Bolos de aniversario', 'Salgados'],
    services: ['Encomendas por WhatsApp', 'Entrega no bairro', 'Catering para festas'],
    contact_email: 'demo@exemplo.ao',
    contact_phone: '+244 900 000 000',
    language: 'pt',
    timezone: 'Africa/Luanda',
    currency: 'AOA',
    status: 'ACTIVE',
    default_task_mode: 'APPROVAL',
    is_demo: true,
  }).select('id').single();

  if (clientError || !client) throw new Error(clientError?.message ?? 'Falha ao criar cliente DEMO.');
  const clientId = client.id;
  console.log(`[seed]   cliente: ${clientId}`);

  await db.from('brand_settings').insert({
    client_id: clientId,
    primary_colors: ['#8B4513', '#F5DEB3'],
    secondary_colors: ['#2F4F4F'],
    visual_style: 'Fotografia real do produto, luz natural da manha, fundos de madeira.',
    tone_of_voice: 'Proximo e caloroso, sem exageros publicitarios. Trata o cliente por voce.',
    allowed_words: ['fresco', 'todos os dias', 'do bairro', 'feito a mao'],
    forbidden_words: ['o melhor do mundo', 'imperdivel', 'unico'],
    calls_to_action: ['Passe pela padaria', 'Encomende pelo WhatsApp'],
    audience: 'Vizinhos do bairro e trabalhadores da zona.',
    positioning: 'A padaria de sempre, com o pao de sempre, a hora certa.',
  });

  await db.from('spend_limits').insert({
    client_id: clientId,
    currency: 'USD',
    daily_limit: 50,
    monthly_limit: 800,
    per_campaign_limit: 300,
    per_transaction_limit: 100,
    require_approval_above: 25,
    ai_max_budget_increase_pct: 0,
    block_automatic_payments: true,
  });

  // Simulated connections. status DISCONNECTED and no token: nothing here can
  // publish, and the UI shows them as demo, never as live accounts.
  const { data: socialAccount } = await db.from('social_accounts').insert({
    client_id: clientId,
    platform: 'INSTAGRAM',
    external_id: 'demo-ig-000000',
    username: 'padariadobairro.demo',
    display_name: 'Padaria do Bairro (DEMO)',
    account_type: 'BUSINESS',
    status: 'DISCONNECTED',
    status_reason: 'Conta DEMO. Nao esta ligada a nenhuma conta real e nao pode publicar.',
    is_demo: true,
    metadata: { demo: true },
  }).select('id').single();

  const { data: adAccount } = await db.from('ad_accounts').insert({
    client_id: clientId,
    social_account_id: socialAccount?.id ?? null,
    platform: 'FACEBOOK',
    external_id: 'act_demo000000',
    name: 'Conta Publicitaria DEMO',
    currency: 'USD',
    timezone: 'Africa/Luanda',
    account_status: 'ACTIVE',
    funding_source: 'DEMO — nenhum metodo de pagamento real',
    amount_spent: 128.4,
    status: 'DISCONNECTED',
    status_reason: 'Conta DEMO. Nao corresponde a nenhuma conta publicitaria real.',
    is_demo: true,
  }).select('id').single();

  const { data: task } = await db.from('tasks').insert({
    client_id: clientId,
    name: '3 publicacoes por dia — Instagram (DEMO)',
    description: 'Tarefa de exemplo. Criada em pausa; nunca executou contra uma API real.',
    type: 'GENERATE_POSTS',
    platform: 'INSTAGRAM',
    social_account_id: socialAccount?.id ?? null,
    quantity: 3,
    frequency: 'DAILY',
    run_at_times: ['08:00', '13:00', '18:30'],
    timezone: 'Africa/Luanda',
    starts_at: isoDaysAgo(30),
    status: 'PAUSED',
    mode: 'APPROVAL',
    run_count: 12,
    failure_count: 1,
    last_run_at: isoDaysAgo(1),
    last_status: 'SUCCEEDED',
    is_demo: true,
  }).select('id').single();

  await db.from('tasks').insert({
    client_id: clientId,
    name: 'Sincronizar metricas todas as manhas (DEMO)',
    type: 'SYNC_ANALYTICS',
    platform: 'INSTAGRAM',
    social_account_id: socialAccount?.id ?? null,
    quantity: 1,
    frequency: 'DAILY',
    run_at_times: ['06:00'],
    timezone: 'Africa/Luanda',
    starts_at: isoDaysAgo(30),
    status: 'PAUSED',
    mode: 'AUTOMATIC',
    run_count: 28,
    is_demo: true,
  });

  if (task) {
    for (let i = 0; i < 6; i += 1) {
      await db.from('task_runs').insert({
        task_id: task.id,
        client_id: clientId,
        scheduled_for: isoDaysAgo(i + 1),
        trigger: i === 0 ? 'MANUAL' : 'SCHEDULER',
        status: i === 4 ? 'FAILED' : 'SUCCEEDED',
        started_at: isoDaysAgo(i + 1),
        finished_at: isoDaysAgo(i + 1),
        duration_ms: 3200 + i * 400,
        output: i === 4 ? {} : { generated: 3, mode: 'APPROVAL' },
        error: i === 4 ? {
          code: 'AI_NOT_CONFIGURED',
          operation: 'geracao de conteudo',
          step: 'carregamento do provider de IA',
          message: 'Nenhum provider de IA estava configurado nesta instalacao.',
          hint: 'Defina AI_PROVIDER e a chave correspondente.',
          severity: 'ERROR', status: 503, retryable: false,
        } : null,
      });
    }
  }

  const posts = [
    {
      body: 'O pao das 6h ja esta no balcao. Ainda quente, como todos os dias desde 2011.',
      status: 'PUBLISHED', days: 3,
    },
    {
      body: 'Bolo de aniversario por encomenda com 48 horas de aviso. Diga-nos o sabor e a data.',
      status: 'PUBLISHED', days: 2,
    },
    {
      body: 'Ao almoco temos salgados frescos ate as 14h. Passe pela padaria.',
      status: 'PENDING_APPROVAL', days: 0,
    },
    {
      body: 'Sabado abrimos as 6h30. O pao de milho sai as 7h.',
      status: 'SCHEDULED', days: -1,
    },
  ];

  const contentIds: string[] = [];
  for (const post of posts) {
    const { data } = await db.from('content').insert({
      client_id: clientId,
      task_id: task?.id ?? null,
      platform: 'INSTAGRAM',
      social_account_id: socialAccount?.id ?? null,
      format: 'POST',
      body: post.body,
      hashtags: ['padaria', 'luanda', 'paofresco', 'dobairro'],
      call_to_action: 'Passe pela padaria',
      status: post.status,
      scheduled_for: isoDaysAgo(post.days),
      published_at: post.status === 'PUBLISHED' ? isoDaysAgo(post.days) : null,
      external_id: post.status === 'PUBLISHED' ? `demo_${Math.random().toString(36).slice(2, 12)}` : null,
      timezone: 'Africa/Luanda',
      ai_model: 'demo',
      ai_metadata: { imageBrief: 'Foto do pao no balcao, luz natural da manha, sem filtros.' },
      is_demo: true,
    }).select('id').single();
    if (data) contentIds.push(data.id);
    if (post.status === 'PENDING_APPROVAL' && data) {
      await db.from('approvals').insert({
        client_id: clientId,
        subject: 'CONTENT',
        subject_id: data.id,
        summary: `Conteudo POST para INSTAGRAM: "${post.body.slice(0, 60)}..."`,
        details: { demo: true },
      });
    }
  }

  const { data: campaign } = await db.from('ad_campaigns').insert({
    client_id: clientId,
    ad_account_id: adAccount!.id,
    platform: 'FACEBOOK',
    name: 'Encomendas de bolos — Dezembro (DEMO)',
    objective: 'OUTCOME_TRAFFIC',
    status: 'DRAFT',
    daily_budget: 8,
    budget_level: 'ADSET',
    currency: 'USD',
    origin: 'MANUAL',
    requires_approval: true,
    starts_at: isoDaysAgo(10),
    is_demo: true,
    // No external_id: this campaign does not exist on any platform.
  }).select('id').single();

  if (campaign) {
    const { data: adSet } = await db.from('ad_sets').insert({
      campaign_id: campaign.id,
      client_id: clientId,
      name: 'Encomendas de bolos — conjunto (DEMO)',
      optimization_goal: 'LINK_CLICKS',
      billing_event: 'IMPRESSIONS',
      daily_budget: 8,
      targeting: { countries: ['AO'], ageMin: 25, ageMax: 55, genders: ['ALL'] },
      placements: { mode: 'AUTOMATIC' },
      is_demo: true,
    }).select('id').single();

    const { data: creative } = await db.from('creatives').insert({
      client_id: clientId,
      platform: 'FACEBOOK',
      name: 'Encomendas de bolos — criativo (DEMO)',
      format: 'SINGLE_IMAGE',
      primary_text: 'Bolos por encomenda com 48 horas de aviso. Diga-nos o sabor e a data.',
      headline: 'Bolos feitos a mao',
      description: 'Padaria do Bairro, Luanda',
      call_to_action: 'CONTACT_US',
      source: 'MANUAL',
      is_demo: true,
    }).select('id').single();

    if (adSet && creative) {
      await db.from('ads').insert({
        ad_set_id: adSet.id,
        campaign_id: campaign.id,
        client_id: clientId,
        creative_id: creative.id,
        name: 'Encomendas de bolos — anuncio (DEMO)',
        status: 'DRAFT',
        is_demo: true,
      });
    }
  }

  // Plausible but clearly demo analytics, one row per day.
  for (let day = 29; day >= 0; day -= 1) {
    const wave = Math.sin(day / 4) * 0.3 + 1;
    const impressions = Math.round((900 + day * 12) * wave);
    const reach = Math.round(impressions * 0.72);
    const clicks = Math.round(impressions * 0.031);
    const likes = Math.round(impressions * 0.045);

    await db.from('analytics').insert({
      client_id: clientId,
      platform: 'INSTAGRAM',
      scope: 'ACCOUNT',
      external_id: 'demo-ig-000000',
      date: dateDaysAgo(day),
      impressions, reach, clicks, likes,
      comments: Math.round(likes * 0.12),
      shares: Math.round(likes * 0.08),
      followers: 1180 + (29 - day) * 4,
      follower_delta: 4,
      engagement_rate: Number(((likes * 1.2) / reach).toFixed(6)),
      currency: 'USD',
      is_demo: true,
    });

    if (day < 14 && campaign) {
      const spend = Number((6 + Math.random() * 3).toFixed(2));
      await db.from('analytics').insert({
        client_id: clientId,
        platform: 'FACEBOOK',
        scope: 'CAMPAIGN',
        entity_id: campaign.id,
        date: dateDaysAgo(day),
        impressions: Math.round(impressions * 0.6),
        reach: Math.round(reach * 0.6),
        clicks: Math.round(clicks * 1.4),
        spend,
        currency: 'USD',
        ctr: 0.0412,
        cpc: Number((spend / Math.max(1, Math.round(clicks * 1.4))).toFixed(4)),
        conversions: Math.round(clicks * 0.12),
        is_demo: true,
      });
    }
  }

  await db.from('notifications').insert([
    {
      client_id: clientId,
      type: 'DEMO_DATA_CREATED',
      severity: 'WARNING',
      title: 'Dados DEMO criados',
      body:
        'Este cliente e ficticio e esta marcado como DEMO em toda a interface. ' +
        'Nenhuma conta esta realmente ligada, nenhuma campanha existe numa plataforma e ' +
        'nenhum pagamento foi feito. Remova com: npm run seed:clean',
      link: '/clientes',
      is_demo: true,
    },
  ]);

  await db.from('activity_logs').insert({
    channel: 'SYSTEM',
    level: 'WARN',
    action: 'seed.demo_created',
    message: 'Dados DEMO criados. Todos os registos tem is_demo = true.',
    client_id: clientId,
  });

  console.log(`
[seed] Concluido.

  Cliente ...... Padaria do Bairro (DEMO)
  Tarefas ...... 2 (ambas em pausa)
  Conteudos .... ${contentIds.length}
  Campanhas .... 1 rascunho, sem existencia em qualquer plataforma
  Metricas ..... 30 dias de conta + 14 dias de campanha

  Nada aqui e real. Tudo aparece com a etiqueta DEMO.
  Para remover:  npm run seed:clean
`);
}

const command = process.argv.includes('--clean') ? clean : seed;

command()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[seed] Falhou:', err.message);
    process.exit(1);
  });
