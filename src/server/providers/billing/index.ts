import 'server-only';
/** BillingProvider registry. Only Meta reads real billing state today. */
import { MetaBillingProvider } from './meta';
import { NotImplementedError } from '@/lib/errors';
import { capabilitiesFor } from '@/server/platform/capabilities';
import type { BillingProvider, PlatformBillingSnapshot } from '@/server/providers/types';
import type { Platform } from '@/types/models';

class ScaffoldedBillingProvider implements BillingProvider {
  constructor(readonly platform: Platform, readonly name: string) {}
  isConfigured() { return false; }
  missingConfiguration() { return capabilitiesFor(this.platform).envKeys; }
  getSnapshot(): Promise<PlatformBillingSnapshot> {
    throw new NotImplementedError({
      operation: 'leitura de faturacao', provider: `${this.name}`,
    });
  }
}

export function billingProviderFor(platform: Platform): BillingProvider {
  switch (platform) {
    case 'FACEBOOK':
    case 'INSTAGRAM':
      return new MetaBillingProvider();
    case 'TIKTOK': return new ScaffoldedBillingProvider('TIKTOK', 'TikTok Ads');
    case 'LINKEDIN': return new ScaffoldedBillingProvider('LINKEDIN', 'LinkedIn Ads');
    case 'GOOGLE': return new ScaffoldedBillingProvider('GOOGLE', 'Google Ads');
    case 'YOUTUBE': return new ScaffoldedBillingProvider('YOUTUBE', 'YouTube');
    case 'X': return new ScaffoldedBillingProvider('X', 'X Ads');
  }
}

export { MetaBillingProvider, ScaffoldedBillingProvider };
