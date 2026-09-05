import 'server-only';
/** AdsProvider registry. Facebook and Instagram share Meta's Marketing API. */
import { MetaAdsProvider } from './meta';
import { ScaffoldedAdsProvider } from './unsupported';
import type { AdsProvider } from '@/server/providers/types';
import type { Platform } from '@/types/models';

const registry: Record<Platform, () => AdsProvider> = {
  FACEBOOK: () => new MetaAdsProvider(),
  INSTAGRAM: () => new MetaAdsProvider(),
  TIKTOK: () => new ScaffoldedAdsProvider('TIKTOK', 'TikTok',
    ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET']),
  LINKEDIN: () => new ScaffoldedAdsProvider('LINKEDIN', 'LinkedIn',
    ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET']),
  GOOGLE: () => new ScaffoldedAdsProvider('GOOGLE', 'Google',
    ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_ADS_DEVELOPER_TOKEN']),
  YOUTUBE: () => new ScaffoldedAdsProvider('YOUTUBE', 'YouTube',
    ['GOOGLE_ADS_DEVELOPER_TOKEN']),
  X: () => new ScaffoldedAdsProvider('X', 'X', ['X_CLIENT_ID', 'X_CLIENT_SECRET']),
};

export function adsProviderFor(platform: Platform): AdsProvider {
  return registry[platform]();
}

export { MetaAdsProvider, ScaffoldedAdsProvider };
export { toMinorUnits, fromMinorUnits } from './meta';
