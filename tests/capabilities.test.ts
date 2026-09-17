/**
 * The capability registry is what stops the interface from offering something a
 * platform cannot do. These tests check it stays honest.
 */
import { describe, expect, it } from 'vitest';
import {
  ALL_PLATFORMS, capabilitiesFor, platformsWithAds, publishableFormats,
  selectableObjectives, selectablePlacements, supportLabel,
} from '@/server/platform/capabilities';

describe('registry de capacidades', () => {
  it('cobre todas as plataformas declaradas', () => {
    for (const platform of ALL_PLATFORMS) {
      const capability = capabilitiesFor(platform);
      expect(capability.platform).toBe(platform);
      expect(capability.label.length).toBeGreaterThan(0);
      expect(capability.docsUrl).toMatch(/^https:\/\//);
    }
  });

  it('so oferece objetivos realmente suportados', () => {
    for (const platform of ALL_PLATFORMS) {
      for (const objective of selectableObjectives(platform)) {
        expect(objective.support).toBe('SUPPORTED');
      }
    }
  });

  it('so oferece posicionamentos realmente suportados', () => {
    for (const platform of ALL_PLATFORMS) {
      for (const placement of selectablePlacements(platform)) {
        expect(placement.support).toBe('SUPPORTED');
      }
    }
  });

  it('nenhuma plataforma sem conector de anuncios aparece como disponivel', () => {
    const withAds = platformsWithAds();
    for (const platform of ALL_PLATFORMS) {
      const supported = capabilitiesFor(platform).ads.support === 'SUPPORTED';
      expect(withAds.includes(platform)).toBe(supported);
    }
  });
});

describe('limites reais das plataformas', () => {
  it('o Instagram nao tem agendamento nativo nem eliminacao', () => {
    const instagram = capabilitiesFor('INSTAGRAM').social;
    expect(instagram.nativeScheduling).toBe('NOT_SUPPORTED');
    expect(instagram.deletePost).toBe('NOT_SUPPORTED');
  });

  it('o Facebook tem agendamento nativo e eliminacao', () => {
    const facebook = capabilitiesFor('FACEBOOK').social;
    expect(facebook.nativeScheduling).toBe('SUPPORTED');
    expect(facebook.deletePost).toBe('SUPPORTED');
  });

  it('nenhuma plataforma declara cobranca dentro do NojAds', () => {
    // No official ads API allows charging a card from a third-party app.
    // If this test ever fails, a capability was overstated.
    for (const platform of ALL_PLATFORMS) {
      expect(capabilitiesFor(platform).billing.chargeInApp).not.toBe('SUPPORTED');
      expect(capabilitiesFor(platform).billing.addPaymentMethod).not.toBe('SUPPORTED');
    }
  });

  it('a Meta le saldo mas nao lista metodos de pagamento', () => {
    const billing = capabilitiesFor('FACEBOOK').billing;
    expect(billing.readBalance).toBe('SUPPORTED');
    expect(billing.listPaymentMethods).toBe('NOT_SUPPORTED');
  });

  it('a Meta nao permite trocar o criativo de um anuncio publicado', () => {
    expect(capabilitiesFor('FACEBOOK').ads.operations.updateCreative).toBe('NOT_SUPPORTED');
  });

  it('os formatos publicaveis sao apenas os suportados', () => {
    const formats = publishableFormats('INSTAGRAM');
    expect(formats).toContain('REEL');
    expect(formats).toContain('STORY');
    expect(formats).not.toContain('SHORT');
  });

  it('as plataformas sem conector estao marcadas como estrutura pronta', () => {
    for (const platform of ['TIKTOK', 'YOUTUBE', 'LINKEDIN', 'X', 'GOOGLE'] as const) {
      expect(capabilitiesFor(platform).connectorStatus).toBe('SCAFFOLDED');
      expect(capabilitiesFor(platform).social.support).not.toBe('SUPPORTED');
    }
  });

  it('cada estado de suporte tem uma etiqueta legivel', () => {
    expect(supportLabel('SUPPORTED')).toBe('Disponivel');
    expect(supportLabel('NOT_IMPLEMENTED')).toMatch(/nao implementado/i);
    expect(supportLabel('NOT_SUPPORTED')).toMatch(/nao suportado/i);
  });
});
