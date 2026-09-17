import type { Metadata } from 'next';
import Link from 'next/link';
import { Video, Film } from 'lucide-react';
import { requireStaff, accessibleClientIds } from '@/server/auth/session';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { videoProvider } from '@/server/providers/video';
import { capabilitiesFor } from '@/server/platform/capabilities';
import {
  Alert, Badge, Card, CardBody, CardHeader, CardTitle, EmptyState, PageHeader,
} from '@/components/ui';
import { PlatformChip, SupportPill } from '@/components/ui/platform';
import { formatDateTime, truncate } from '@/lib/utils';
import type { Content } from '@/types/models';

export const metadata: Metadata = { title: 'Video Studio' };
export const dynamic = 'force-dynamic';

const FORMATS = [
  { label: 'Instagram Reels', platform: 'INSTAGRAM' as const, format: 'REEL' as const, ratio: '9:16', seconds: '3 a 90 s' },
  { label: 'Instagram Stories', platform: 'INSTAGRAM' as const, format: 'STORY' as const, ratio: '9:16', seconds: 'ate 60 s' },
  { label: 'Facebook Reels', platform: 'FACEBOOK' as const, format: 'REEL' as const, ratio: '9:16', seconds: '3 a 90 s' },
  { label: 'TikTok', platform: 'TIKTOK' as const, format: 'VIDEO' as const, ratio: '9:16', seconds: 'ate 10 min' },
  { label: 'YouTube Shorts', platform: 'YOUTUBE' as const, format: 'SHORT' as const, ratio: '9:16', seconds: 'ate 60 s' },
];

export default async function VideoStudioPage() {
  const session = await requireStaff('acesso ao Video Studio');
  const db = createAdminSupabase();
  const ids = await accessibleClientIds(session);
  const fallback = ['00000000-0000-0000-0000-000000000000'];

  let query = db.from('content').select('*')
    .in('format', ['REEL', 'VIDEO', 'SHORT', 'STORY'])
    .order('created_at', { ascending: false }).limit(40);
  if (ids !== null) query = query.in('client_id', ids.length ? ids : fallback);

  const { data } = await query;
  const videos = (data ?? []) as Content[];
  const provider = videoProvider();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Video Studio"
        description="Guioes, cenas e textos prontos para producao. A renderizacao acontece quando um servico de render estiver ligado."
      />

      <Alert tone="warning" title="Renderizacao ainda nao ligada nesta instalacao">
        O NojAds prepara o video por completo — guiao, cenas, texto no ecra, narracao, duracao e
        assets. Transformar isso num ficheiro MP4 precisa de um servico de renderizacao
        (Shotstack, Creatomate, Remotion Lambda, ou ffmpeg no seu proprio worker). Faltam:{' '}
        <span className="font-mono">{provider.missingConfiguration().join(', ')}</span>.
        Ate la, nenhum video e dado como renderizado — porque nao foi.
        Consulte <span className="font-mono">docs/video.md</span> para ligar um provider.
      </Alert>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Formatos e o que cada plataforma aceita</CardTitle>
            <p className="mt-1 text-xs text-muted">
              Limites das APIs oficiais. Um video fora destes limites e recusado pela plataforma.
            </p>
          </div>
        </CardHeader>
        <CardBody className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FORMATS.map((entry) => {
            const support = capabilitiesFor(entry.platform).social.publish[entry.format];
            return (
              <div key={entry.label} className="rounded-lg border border-line p-3">
                <div className="flex items-start justify-between gap-2">
                  <PlatformChip platform={entry.platform} />
                  {support ? <SupportPill support={support} /> : null}
                </div>
                <p className="mt-2 text-xs font-medium">{entry.label}</p>
                <p className="mt-0.5 text-[11px] text-muted">
                  Proporcao {entry.ratio} · {entry.seconds}
                </p>
              </div>
            );
          })}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div><CardTitle>Guioes prontos para producao</CardTitle></div>
          <Badge tone="neutral">{String(videos.length)}</Badge>
        </CardHeader>
        {videos.length === 0 ? (
          <EmptyState
            icon={Video}
            title="Sem videos"
            description="Crie uma tarefa do tipo Reels ou video. A IA escreve o guiao cena a cena e coloca-o aqui."
          />
        ) : (
          <ul className="divide-y divide-line">
            {videos.map((video) => {
              const meta = video.ai_metadata as Record<string, unknown>;
              const scenes = meta?.videoScript as { seconds: number }[] | undefined;
              const totalSeconds = scenes?.reduce((sum, s) => sum + Number(s.seconds ?? 0), 0);
              return (
                <li key={video.id} className="flex items-start gap-3 px-5 py-3">
                  <Film className="mt-0.5 h-4 w-4 shrink-0 text-faint" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <Link href={`/conteudo/${video.id}`} className="block truncate text-sm text-ink hover:text-brand">
                      {truncate(video.title ?? video.body, 70)}
                    </Link>
                    <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted">
                      <PlatformChip platform={video.platform} />
                      <span>{video.format}</span>
                      {scenes?.length ? <span>{scenes.length} cena(s)</span> : null}
                      {totalSeconds ? <span>{totalSeconds}s</span> : null}
                      <span>{formatDateTime(video.created_at)}</span>
                    </p>
                    {!scenes?.length ? (
                      <p className="mt-1 text-[11px] text-warn">
                        Sem guiao por cenas. Este conteudo foi criado sem o formato de video.
                      </p>
                    ) : null}
                  </div>
                  <Badge tone="warn">Por renderizar</Badge>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
