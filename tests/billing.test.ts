/**
 * Money arithmetic.
 *
 * The invariant that matters: total = adSpend + nojadsFee + gatewayFee, always,
 * exactly. The database enforces it with a CHECK constraint; this checks the
 * code that feeds it.
 */
import { describe, expect, it } from 'vitest';
import { computeBreakdown, convertCurrency } from '@/server/services/billing';

const NO_FEES = { nojadsFeePercent: 0, gatewayFeePercent: 0, gatewayFeeFixed: 0 };
const STRIPE = { nojadsFeePercent: 10, gatewayFeePercent: 2.9, gatewayFeeFixed: 0.3 };

describe('computeBreakdown', () => {
  it('sem taxas, o total e o gasto publicitario', () => {
    const result = computeBreakdown(100, 'USD', NO_FEES);
    expect(result).toEqual({
      adSpend: 100, nojadsFee: 0, gatewayFee: 0, total: 100, currency: 'USD',
    });
  });

  it('separa as tres parcelas e nunca as mistura', () => {
    const result = computeBreakdown(100, 'usd', STRIPE);
    expect(result.adSpend).toBe(100);
    expect(result.nojadsFee).toBe(10);
    // 110 * 0.029 + 0.30 = 3.49
    expect(result.gatewayFee).toBe(3.49);
    expect(result.total).toBe(113.49);
  });

  it('o total corresponde sempre a soma das parcelas', () => {
    for (const amount of [1, 7.77, 33.33, 199.99, 1234.56, 0.01]) {
      const r = computeBreakdown(amount, 'EUR', STRIPE);
      expect(r.total).toBeCloseTo(r.adSpend + r.nojadsFee + r.gatewayFee, 4);
    }
  });

  it('normaliza a moeda para maiusculas', () => {
    expect(computeBreakdown(10, 'aoa', NO_FEES).currency).toBe('AOA');
  });

  it('arredonda a 4 casas, como as colunas numeric(18,4)', () => {
    const r = computeBreakdown(33.333333, 'USD', STRIPE);
    expect(String(r.adSpend).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(4);
    expect(String(r.total).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(4);
  });
});

describe('convertCurrency', () => {
  it('a mesma moeda passa sem conversao', () => {
    const result = convertCurrency({ amount: 100, from: 'USD', to: 'usd' });
    expect(result).toEqual({ amount: 100, rate: 1, source: 'identity' });
  });

  it('recusa converter quando nao ha taxa configurada, em vez de inventar uma', () => {
    delete process.env.FX_PROVIDER;
    delete process.env.FX_MANUAL_RATES;
    expect(() => convertCurrency({ amount: 100, from: 'AOA', to: 'USD' }))
      .toThrowError(/nao existe taxa de cambio configurada/i);
  });

  it('usa a taxa manual quando esta configurada e diz de onde veio', () => {
    process.env.FX_PROVIDER = 'manual';
    process.env.FX_MANUAL_RATES = JSON.stringify({ AOA_USD: 0.0011 });
    const result = convertCurrency({ amount: 100000, from: 'AOA', to: 'USD' });
    expect(result.amount).toBe(110);
    expect(result.rate).toBe(0.0011);
    expect(result.source).toBe('FX_MANUAL_RATES');
    delete process.env.FX_PROVIDER;
    delete process.env.FX_MANUAL_RATES;
  });
});
