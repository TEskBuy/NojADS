/**
 * Input validation.
 *
 * Every mutation validates here before it reaches the database. The interface
 * may also validate for a nicer experience, but this is the boundary that
 * decides — a request that skips the form still goes through these schemas.
 */
import { z } from 'zod';

const PLATFORMS = ['FACEBOOK', 'INSTAGRAM', 'TIKTOK', 'YOUTUBE', 'LINKEDIN', 'X', 'GOOGLE'] as const;
const FREQUENCIES = ['HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY', 'INTERVAL', 'CRON', 'ONCE'] as const;

const timeString = z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/, 'Use o formato HH:MM (24 horas).');
const uuid = z.string().uuid('Identificador invalido.');
const optionalText = z.string().trim().max(2000).optional().or(z.literal('')).transform((v) => v || undefined);

// -------------------------------------------------------------- clients

export const clientSchema = z.object({
  name: z.string().trim().min(2, 'O nome tem de ter pelo menos 2 caracteres.').max(120),
  company: optionalText,
  description: optionalText,
  website: z.string().trim().url('Introduza um URL valido (comeca por https://).').optional().or(z.literal('')).transform((v) => v || undefined),
  country: optionalText,
  city: optionalText,
  category: optionalText,
  target_audience: optionalText,
  products: z.array(z.string().trim().min(1)).max(50).default([]),
  services: z.array(z.string().trim().min(1)).max(50).default([]),
  contact_email: z.string().trim().email('Email invalido.').optional().or(z.literal('')).transform((v) => v || undefined),
  contact_phone: optionalText,
  language: z.string().trim().min(2).max(10).default('pt'),
  timezone: z.string().trim().min(3).max(64).default('Africa/Luanda'),
  currency: z.string().trim().length(3, 'Use o codigo ISO de 3 letras, por exemplo AOA ou USD.').default('AOA'),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).default('ACTIVE'),
  default_task_mode: z.enum(['AUTOMATIC', 'APPROVAL']).default('APPROVAL'),
});

export type ClientInput = z.infer<typeof clientSchema>;

export const brandSchema = z.object({
  client_id: uuid,
  logo_url: z.string().trim().url().optional().or(z.literal('')).transform((v) => v || undefined),
  primary_colors: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use cores em hexadecimal, por exemplo #1A73E8.')).max(6).default([]),
  secondary_colors: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).max(6).default([]),
  visual_style: optionalText,
  tone_of_voice: optionalText,
  allowed_words: z.array(z.string().trim().min(1)).max(50).default([]),
  forbidden_words: z.array(z.string().trim().min(1)).max(50).default([]),
  calls_to_action: z.array(z.string().trim().min(1)).max(20).default([]),
  audience: optionalText,
  positioning: optionalText,
});

// ---------------------------------------------------------------- tasks

export const taskSchema = z.object({
  client_id: uuid,
  name: z.string().trim().min(3, 'Dê um nome com pelo menos 3 caracteres.').max(120),
  description: optionalText,
  type: z.string().trim().min(3),
  platform: z.enum(PLATFORMS).optional().nullable(),
  social_account_id: uuid.optional().nullable(),
  ad_account_id: uuid.optional().nullable(),
  quantity: z.coerce.number().int().min(1).max(50).default(1),
  frequency: z.enum(FREQUENCIES).default('DAILY'),
  cron_expression: z.string().trim().max(120).optional().nullable(),
  interval_minutes: z.coerce.number().int().min(5).max(10080).optional().nullable(),
  run_at_times: z.array(timeString).max(12).default([]),
  weekdays: z.array(z.coerce.number().int().min(1).max(7)).max(7).default([]),
  month_days: z.array(z.coerce.number().int().min(1).max(31)).max(31).default([]),
  timezone: z.string().trim().min(3).max(64).default('Africa/Luanda'),
  starts_at: z.string().datetime().or(z.string().min(10)),
  ends_at: z.string().datetime().or(z.string().min(10)).optional().nullable(),
  mode: z.enum(['AUTOMATIC', 'APPROVAL']).default('APPROVAL'),
  config: z.record(z.unknown()).default({}),
}).superRefine((value, ctx) => {
  if (value.frequency === 'CRON' && !value.cron_expression) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom, path: ['cron_expression'],
      message: 'Uma tarefa com frequencia CRON precisa de uma expressao cron.',
    });
  }
  if (value.frequency === 'INTERVAL' && !value.interval_minutes) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom, path: ['interval_minutes'],
      message: 'Uma tarefa por intervalo precisa do numero de minutos (minimo 5).',
    });
  }
  if (['DAILY', 'WEEKLY', 'MONTHLY'].includes(value.frequency) && value.run_at_times.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom, path: ['run_at_times'],
      message: 'Indique pelo menos um horario de execucao.',
    });
  }
  if (value.frequency === 'WEEKLY' && value.weekdays.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom, path: ['weekdays'],
      message: 'Escolha pelo menos um dia da semana.',
    });
  }
  if (value.ends_at && value.starts_at && new Date(value.ends_at) <= new Date(value.starts_at)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom, path: ['ends_at'],
      message: 'A data de fim tem de ser posterior a data de inicio.',
    });
  }
});

export type TaskInput = z.infer<typeof taskSchema>;

// -------------------------------------------------------------- content

export const contentSchema = z.object({
  client_id: uuid,
  platform: z.enum(PLATFORMS),
  social_account_id: uuid.optional().nullable(),
  format: z.enum(['POST', 'REEL', 'STORY', 'VIDEO', 'FLYER', 'CAROUSEL', 'SHORT']).default('POST'),
  title: optionalText,
  body: z.string().trim().min(1, 'Escreva o texto da publicacao.').max(5000),
  hashtags: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  call_to_action: optionalText,
  link_url: z.string().trim().url().optional().or(z.literal('')).transform((v) => v || undefined),
  scheduled_for: z.string().optional().nullable(),
  timezone: z.string().trim().default('Africa/Luanda'),
});

// ----------------------------------------------------------- ads manager

export const targetingSchema = z.object({
  countries: z.array(z.string().length(2)).max(25).default(['AO']),
  ageMin: z.coerce.number().int().min(13).max(65).default(18),
  ageMax: z.coerce.number().int().min(13).max(65).default(65),
  genders: z.array(z.enum(['MALE', 'FEMALE', 'ALL'])).default(['ALL']),
  languages: z.array(z.string()).max(10).default([]),
  interests: z.array(z.object({ id: z.string(), name: z.string() })).max(25).default([]),
  behaviors: z.array(z.object({ id: z.string(), name: z.string() })).max(25).default([]),
  customAudienceIds: z.array(z.string()).max(25).default([]),
}).superRefine((value, ctx) => {
  if (value.ageMax < value.ageMin) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom, path: ['ageMax'],
      message: 'A idade maxima tem de ser maior ou igual a idade minima.',
    });
  }
});

export const campaignSchema = z.object({
  client_id: uuid,
  ad_account_id: uuid,
  platform: z.enum(PLATFORMS),
  name: z.string().trim().min(3, 'Dê um nome a campanha.').max(120),
  objective: z.string().trim().min(3, 'Escolha um objetivo.'),
  budget_level: z.enum(['CAMPAIGN', 'ADSET']).default('ADSET'),
  daily_budget: z.coerce.number().positive('O orcamento diario tem de ser maior que zero.').optional().nullable(),
  lifetime_budget: z.coerce.number().positive().optional().nullable(),
  bid_strategy: z.string().optional().nullable(),
  spend_cap: z.coerce.number().positive().optional().nullable(),
  special_ad_categories: z.array(z.string()).default([]),
  starts_at: z.string().optional().nullable(),
  ends_at: z.string().optional().nullable(),

  optimization_goal: z.string().trim().min(2),
  billing_event: z.string().trim().min(2),
  targeting: targetingSchema,
  placements: z.object({
    mode: z.enum(['AUTOMATIC', 'MANUAL']).default('AUTOMATIC'),
    selected: z.array(z.string()).default([]),
  }).default({ mode: 'AUTOMATIC', selected: [] }),

  creative: z.object({
    format: z.enum(['SINGLE_IMAGE', 'SINGLE_VIDEO', 'CAROUSEL']).default('SINGLE_IMAGE'),
    primary_text: z.string().trim().min(1, 'Escreva o texto principal do anuncio.').max(2000),
    headline: z.string().trim().max(80).optional().or(z.literal('')),
    description: z.string().trim().max(200).optional().or(z.literal('')),
    call_to_action: z.string().trim().default('LEARN_MORE'),
    destination_url: z.string().trim().url('O URL de destino tem de ser valido.').optional().or(z.literal('')),
    asset_ids: z.array(uuid).default([]),
    page_external_id: z.string().optional().nullable(),
    instagram_external_id: z.string().optional().nullable(),
  }),
}).superRefine((value, ctx) => {
  if (!value.daily_budget && !value.lifetime_budget) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom, path: ['daily_budget'],
      message: 'Defina um orcamento diario ou um orcamento total.',
    });
  }
  if (value.lifetime_budget && !value.ends_at) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom, path: ['ends_at'],
      message: 'Um orcamento total exige uma data de fim.',
    });
  }
  if (value.placements.mode === 'MANUAL' && value.placements.selected.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom, path: ['placements'],
      message: 'Escolha pelo menos um posicionamento ou volte ao modo automatico.',
    });
  }
});

export type CampaignInput = z.infer<typeof campaignSchema>;

// -------------------------------------------------------------- billing

export const spendLimitsSchema = z.object({
  client_id: uuid,
  currency: z.string().length(3).default('USD'),
  daily_limit: z.coerce.number().nonnegative().optional().nullable(),
  monthly_limit: z.coerce.number().nonnegative().optional().nullable(),
  per_campaign_limit: z.coerce.number().nonnegative().optional().nullable(),
  per_transaction_limit: z.coerce.number().nonnegative().optional().nullable(),
  require_approval_above: z.coerce.number().nonnegative().optional().nullable(),
  ai_max_budget_increase_pct: z.coerce.number().min(0).max(100).default(0),
  block_automatic_payments: z.coerce.boolean().default(true),
});

export const confirmPaymentSchema = z.object({
  client_id: uuid,
  campaign_id: uuid.optional().nullable(),
  amount: z.coerce.number().positive('O valor tem de ser maior que zero.'),
  currency: z.string().length(3),
  payment_method_id: uuid.optional().nullable(),
  purpose: z.enum(['AD_SPEND', 'TOP_UP', 'SUBSCRIPTION', 'FEE']).default('AD_SPEND'),
  /** The literal word the operator types to confirm a real charge. */
  confirmation: z.literal('CONFIRMAR', {
    errorMap: () => ({ message: 'Escreva CONFIRMAR para autorizar este pagamento real.' }),
  }),
});

/** Turns a ZodError into the shape the forms render. */
export function fieldErrors(error: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_form';
    (out[key] ??= []).push(issue.message);
  }
  return out;
}
