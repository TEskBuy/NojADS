import 'server-only';
/** SocialProvider registry. One entry per platform, no exceptions. */
import { MetaFacebookProvider, MetaInstagramProvider } from './meta';
import { ScaffoldedSocialProvider } from './unsupported';
import type { SocialProvider } from '@/server/providers/types';
import type { Platform } from '@/types/models';

const registry: Record<Platform, () => SocialProvider> = {
  FACEBOOK: () => new MetaFacebookProvider(),
  INSTAGRAM: () => new MetaInstagramProvider(),
  TIKTOK: () => new ScaffoldedSocialProvider('TIKTOK', 'TikTok',
    ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET', 'TIKTOK_REDIRECT_URI']),
  YOUTUBE: () => new ScaffoldedSocialProvider('YOUTUBE', 'YouTube',
    ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI']),
  LINKEDIN: () => new ScaffoldedSocialProvider('LINKEDIN', 'LinkedIn',
    ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET', 'LINKEDIN_REDIRECT_URI']),
  X: () => new ScaffoldedSocialProvider('X', 'X',
    ['X_CLIENT_ID', 'X_CLIENT_SECRET', 'X_REDIRECT_URI']),
  GOOGLE: () => new ScaffoldedSocialProvider('GOOGLE', 'Google',
    ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET']),
};

export function socialProviderFor(platform: Platform): SocialProvider {
  return registry[platform]();
}

export { MetaFacebookProvider, MetaInstagramProvider, ScaffoldedSocialProvider };
