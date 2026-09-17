/**
 * Platform identity and capability display.
 *
 * `SupportPill` is how requisito 62 reaches the screen: an option the platform
 * cannot do, or that NojAds has not built, is labelled rather than hidden and
 * silently broken.
 */
import { Facebook, Instagram, Linkedin, Youtube, Music2, Twitter, Search, type LucideIcon } from 'lucide-react';
import { Badge, type BadgeTone } from './index';
import { cn } from '@/lib/utils';
import type { Platform } from '@/types/models';
import type { Support } from '@/server/platform/capabilities';

export const PLATFORM_META: Record<Platform, { label: string; icon: LucideIcon; color: string }> = {
  FACEBOOK: { label: 'Facebook', icon: Facebook, color: '#1877F2' },
  INSTAGRAM: { label: 'Instagram', icon: Instagram, color: '#E1306C' },
  TIKTOK: { label: 'TikTok', icon: Music2, color: '#010101' },
  YOUTUBE: { label: 'YouTube', icon: Youtube, color: '#FF0000' },
  LINKEDIN: { label: 'LinkedIn', icon: Linkedin, color: '#0A66C2' },
  X: { label: 'X', icon: Twitter, color: '#111111' },
  GOOGLE: { label: 'Google Ads', icon: Search, color: '#4285F4' },
};

export function PlatformIcon({ platform, className }: { platform: Platform; className?: string }) {
  const meta = PLATFORM_META[platform];
  const Icon = meta.icon;
  return <Icon className={cn('h-4 w-4', className)} style={{ color: meta.color }} aria-hidden />;
}

export function PlatformChip({ platform }: { platform: Platform }) {
  const meta = PLATFORM_META[platform];
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium text-ink">
      <PlatformIcon platform={platform} />
      {meta.label}
    </span>
  );
}

const SUPPORT_TONE: Record<Support, BadgeTone> = {
  SUPPORTED: 'ok',
  NOT_IMPLEMENTED: 'warn',
  NOT_SUPPORTED: 'neutral',
};

const SUPPORT_LABEL: Record<Support, string> = {
  SUPPORTED: 'Disponivel',
  NOT_IMPLEMENTED: 'Nao implementado',
  NOT_SUPPORTED: 'Nao suportado',
};

export function SupportPill({ support }: { support: Support }) {
  return <Badge tone={SUPPORT_TONE[support]}>{SUPPORT_LABEL[support]}</Badge>;
}
