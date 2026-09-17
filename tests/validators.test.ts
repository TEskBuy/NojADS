/**
 * Input validation is the boundary that decides. These check the rules that
 * would otherwise only exist as form behaviour.
 */
import { describe, expect, it } from 'vitest';
import {
  campaignSchema, clientSchema, confirmPaymentSchema, fieldErrors,
  spendLimitsSchema, taskSchema,
} from '@/server/validators/schemas';

const UUID = '11111111-1111-4111-8111-111111111111';

function baseTask(overrides: Record<string, unknown> = {}) {
  return {
    client_id: UUID,
    name: 'Publicacoes diarias',
    type: 'GENERATE_POSTS',
    quantity: 3,
    frequency: 'DAILY',
    run_at_times: ['09:00'],
    weekdays: [],
    month_days: [],
    timezone: 'Africa/Luanda',
    starts_at: '2026-01-01T00:00:00.000Z',
    config: {},
    ...overrides,
  };
}

describe('taskSchema', () => {
  it('aceita uma tarefa diaria valida', () => {
    expect(taskSchema.safeParse(baseTask()).success).toBe(true);
  });

  it('exige horarios numa tarefa diaria', () => {
    const result = taskSchema.safeParse(baseTask({ run_at_times: [] }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(fieldErrors(result.error).run_at_times?.[0]).toMatch(/pelo menos um horario/i);
    }
  });

  it('exige dias da semana numa tarefa semanal', () => {
    const result = taskSchema.safeParse(baseTask({ frequency: 'WEEKLY', weekdays: [] }));
    expect(result.success).toBe(false);
  });

  it('exige expressao cron quando a frequencia e CRON', () => {
    const result = taskSchema.safeParse(baseTask({ frequency: 'CRON', cron_expression: null }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(fieldErrors(result.error).cron_expression?.[0]).toMatch(/expressao cron/i);
    }
  });

  it('exige minutos quando a frequencia e INTERVAL', () => {
    expect(taskSchema.safeParse(baseTask({ frequency: 'INTERVAL' })).success).toBe(false);
    expect(taskSchema.safeParse(baseTask({ frequency: 'INTERVAL', interval_minutes: 30 })).success).toBe(true);
  });

  it('recusa intervalos abaixo de 5 minutos', () => {
    expect(taskSchema.safeParse(baseTask({ frequency: 'INTERVAL', interval_minutes: 1 })).success).toBe(false);
  });

  it('recusa horarios mal formatados', () => {
    expect(taskSchema.safeParse(baseTask({ run_at_times: ['25:00'] })).success).toBe(false);
    expect(taskSchema.safeParse(baseTask({ run_at_times: ['9h'] })).success).toBe(false);
  });

  it('recusa uma data de fim anterior ao inicio', () => {
    const result = taskSchema.safeParse(baseTask({
      starts_at: '2026-06-01T00:00:00.000Z',
      ends_at: '2026-01-01T00:00:00.000Z',
    }));
    expect(result.success).toBe(false);
  });
});

describe('clientSchema', () => {
  it('aceita o minimo necessario e aplica os valores por omissao', () => {
    const result = clientSchema.safeParse({ name: 'Cliente Teste', products: [], services: [] });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.timezone).toBe('Africa/Luanda');
      expect(result.data.currency).toBe('AOA');
      // Approval is the safe default: nothing publishes unreviewed by accident.
      expect(result.data.default_task_mode).toBe('APPROVAL');
    }
  });

  it('recusa um nome demasiado curto', () => {
    expect(clientSchema.safeParse({ name: 'A', products: [], services: [] }).success).toBe(false);
  });

  it('recusa um website que nao e URL', () => {
    const result = clientSchema.safeParse({
      name: 'Cliente', website: 'nao-e-url', products: [], services: [],
    });
    expect(result.success).toBe(false);
  });

  it('recusa uma moeda que nao tem 3 letras', () => {
    expect(clientSchema.safeParse({
      name: 'Cliente', currency: 'DOLAR', products: [], services: [],
    }).success).toBe(false);
  });
});

function baseCampaign(overrides: Record<string, unknown> = {}) {
  return {
    client_id: UUID,
    ad_account_id: UUID,
    platform: 'FACEBOOK',
    name: 'Campanha de teste',
    objective: 'OUTCOME_TRAFFIC',
    daily_budget: 10,
    optimization_goal: 'LINK_CLICKS',
    billing_event: 'IMPRESSIONS',
    targeting: { countries: ['AO'], ageMin: 18, ageMax: 65 },
    placements: { mode: 'AUTOMATIC', selected: [] },
    creative: { primary_text: 'Texto do anuncio', call_to_action: 'LEARN_MORE' },
    ...overrides,
  };
}

describe('campaignSchema', () => {
  it('aceita uma campanha valida', () => {
    expect(campaignSchema.safeParse(baseCampaign()).success).toBe(true);
  });

  it('exige um orcamento', () => {
    const result = campaignSchema.safeParse(baseCampaign({ daily_budget: null }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(fieldErrors(result.error).daily_budget?.[0]).toMatch(/orcamento/i);
    }
  });

  it('exige data de fim com orcamento total', () => {
    const result = campaignSchema.safeParse(baseCampaign({
      daily_budget: null, lifetime_budget: 500,
    }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(fieldErrors(result.error).ends_at?.[0]).toMatch(/data de fim/i);
    }
  });

  it('exige posicionamentos quando o modo e manual', () => {
    const result = campaignSchema.safeParse(baseCampaign({
      placements: { mode: 'MANUAL', selected: [] },
    }));
    expect(result.success).toBe(false);
  });

  it('recusa idade maxima menor que a minima', () => {
    const result = campaignSchema.safeParse(baseCampaign({
      targeting: { countries: ['AO'], ageMin: 40, ageMax: 20 },
    }));
    expect(result.success).toBe(false);
  });

  it('recusa um orcamento negativo ou zero', () => {
    expect(campaignSchema.safeParse(baseCampaign({ daily_budget: 0 })).success).toBe(false);
    expect(campaignSchema.safeParse(baseCampaign({ daily_budget: -5 })).success).toBe(false);
  });
});

describe('confirmPaymentSchema', () => {
  it('exige a palavra CONFIRMAR escrita por uma pessoa', () => {
    const base = { client_id: UUID, amount: 50, currency: 'USD' };
    expect(confirmPaymentSchema.safeParse({ ...base, confirmation: 'sim' }).success).toBe(false);
    expect(confirmPaymentSchema.safeParse({ ...base, confirmation: 'confirmar' }).success).toBe(false);
    expect(confirmPaymentSchema.safeParse({ ...base, confirmation: 'CONFIRMAR' }).success).toBe(true);
  });

  it('recusa valores nao positivos', () => {
    const result = confirmPaymentSchema.safeParse({
      client_id: UUID, amount: 0, currency: 'USD', confirmation: 'CONFIRMAR',
    });
    expect(result.success).toBe(false);
  });
});

describe('spendLimitsSchema', () => {
  it('bloqueia pagamentos automaticos por omissao', () => {
    const result = spendLimitsSchema.safeParse({ client_id: UUID });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.block_automatic_payments).toBe(true);
      expect(result.data.ai_max_budget_increase_pct).toBe(0);
    }
  });

  it('recusa uma percentagem de aumento acima de 100', () => {
    expect(spendLimitsSchema.safeParse({
      client_id: UUID, ai_max_budget_increase_pct: 150,
    }).success).toBe(false);
  });
});
