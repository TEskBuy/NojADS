import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, Check, X, Send, Ban, ExternalLink } from 'lucide-react';
import { requireClientAccess } from '@/server/auth/session';
import { createAdminSupabase } from '@/lib/supabase/admin';
import {
  approveContentAction, cancelContentAction, publishNowAction,
  rejectContentAction, updateContentAction,
} from '@/server/actions/content';
import { ContentForm } from '@/components/forms/content-form';
import {
  Alert, Badge, Card, CardBody, CardHeader, CardTitle, DemoBadge, PageHeader,
} from '@/components/ui';
import { ActionButton } from '@/components/ui/action-button';
import { ContentStatusBadge } from '@/components/ui/status';
import { PlatformChip } from '@/components/ui/platform';
import { formatDateTime, relativeTime } from '@/lib/utils';
import type { AppErrorShape } from '@/lib/errors';
import type { Content, ContentAsset, SocialAccount } from '@/types/models';

export const metadata: Metadata = { title: 'Conteudo' };
export const dynamic = 'force-dynamic';

export default async function ContentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = createAdminSupabase();
  const { data: row } = await db.from('content').select('*').eq('id', id).maybeSingle();
  if (!row) notFound();
  const content = row as Content;

  await requireClientAccess(content.client_id, 'consulta de conteudo');

  const [{ data: versionRows }, { data: assetRows }, { data: accountRows }, { data: attemptRows }] =
    await Promise.all([
      db.from('content_versions').select('*').eq('content_id', id).order('version', { ascending: false }),
      db.from('content_assets').select('*').eq('content_id', id).order('position'),
      db.from('social_accounts').select('*').eq('client_id', content.client_id).eq('status', 'CONNECTED'),
      db.from('publishing_jobs').select('*').eq('content_id', id).order('created_at', { ascending: false }),
    ]);

  const assets = (assetRows ?? []) as ContentAsset[];
  const accounts = (accountRows ?? []) as SocialAccount[];
  const error = content.last_error as AppErrorShape | null;
  const aiMeta = content.ai_metadata as Record<string, unknown>;
  const videoScript = aiMeta?.videoScript as { scene: string; onScreenText: string; voiceover: string; seconds: number }[] | undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        title={content.title ?? 'Conteudo'}
        breadcrumb={
          <Link href="/conteudo" className="mb-1 inline-flex items-center gap-1 text-xs text-muted hover:text-brand">
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> Conteudo
          </Link>
        }
        actions={
          <>
            {content.is_demo ? <DemoBadge /> : null}
            <ContentStatusBadge status={content.status} />
            {content.status === 'PENDING_APPROVAL' ? (
              <>
                <ActionButton variant="primary" icon={Check} action={approveContentAction.bind(null, id)}>
                  Aprovar
                </ActionButton>
                <ActionButton variant="danger" icon={X}
                  confirm="Rejeitar este conteudo?" action={rejectContentAction.bind(null, id)}>
                  Rejeitar
                </ActionButton>
              </>
            ) : null}
            {['READY', 'SCHEDULED', 'FAILED'].includes(content.status) ? (
              <ActionButton icon={Send}
                confirm={`Publicar em ${content.platform} agora?`}
                action={publishNowAction.bind(null, id)}>
                Publicar agora
              </ActionButton>
            ) : null}
            {!['PUBLISHED', 'CANCELLED'].includes(content.status) ? (
              <ActionButton variant="ghost" icon={Ban}
                confirm="Cancelar este conteudo? Continua no historico."
                action={cancelContentAction.bind(null, id)}>
                Cancelar
              </ActionButton>
            ) : null}
          </>
        }
      />

      {error ? (
        <Alert tone="error" title="Ultima falha de publicacao">
          <p><strong>{error.operation}</strong> — {error.step}: {error.message}</p>
          {error.hint ? <p className="mt-1">Solucao: {error.hint}</p> : null}
          <p className="mt-1 font-mono text-[10px] opacity-70">Codigo: {error.code}</p>
        </Alert>
      ) : null}

      {content.status === 'PUBLISHED' ? (
        <Alert tone="success" title="Publicado">
          Confirmado pela plataforma em {formatDateTime(content.published_at, content.timezone)}.
          Identificador externo: <span className="font-mono">{content.external_id}</span>.
          {content.external_url ? (
            <a href={content.external_url} target="_blank" rel="noreferrer"
              className="ml-1 inline-flex items-center gap-1 font-medium underline">
              Abrir <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          ) : null}
        </Alert>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <ContentForm
            action={updateContentAction}
            content={content}
            accounts={accounts}
            readOnly={content.status === 'PUBLISHED'}
          />
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader><div><CardTitle>Detalhes</CardTitle></div></CardHeader>
            <CardBody className="space-y-2 text-xs">
              <Row label="Plataforma"><PlatformChip platform={content.platform} /></Row>
              <Row label="Formato">{content.format}</Row>
              <Row label="Versao">v{content.version}</Row>
              <Row label="Fuso">{content.timezone}</Row>
              <Row label="Criado">{relativeTime(content.created_at)}</Row>
              {content.ai_model ? <Row label="Modelo IA">{content.ai_model}</Row> : null}
              {content.attempts > 0 ? <Row label="Tentativas">{String(content.attempts)}</Row> : null}
            </CardBody>
          </Card>

          {aiMeta?.imageBrief ? (
            <Card>
              <CardHeader><div><CardTitle>Briefing visual da IA</CardTitle></div></CardHeader>
              <CardBody>
                <p className="text-xs leading-relaxed text-muted">{String(aiMeta.imageBrief)}</p>
                <p className="mt-2 text-[10px] text-faint">
                  Este e o briefing para produzir a imagem no Creative Studio. Nenhuma imagem foi gerada
                  automaticamente — o NojAds nao inventa media que nao existe.
                </p>
              </CardBody>
            </Card>
          ) : null}

          {videoScript?.length ? (
            <Card>
              <CardHeader><div><CardTitle>Guiao do video</CardTitle></div></CardHeader>
              <CardBody className="space-y-3">
                {videoScript.map((scene, i) => (
                  <div key={i} className="rounded-lg border border-line p-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-faint">
                      Cena {i + 1} · {scene.seconds}s
                    </p>
                    <p className="mt-1 text-xs text-ink">{scene.scene}</p>
                    {scene.onScreenText ? (
                      <p className="mt-1 text-[11px] text-muted">Texto no ecra: {scene.onScreenText}</p>
                    ) : null}
                    {scene.voiceover ? (
                      <p className="mt-0.5 text-[11px] text-muted">Narracao: {scene.voiceover}</p>
                    ) : null}
                  </div>
                ))}
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <div><CardTitle>Media</CardTitle></div>
              <Badge tone="neutral">{String(assets.length)}</Badge>
            </CardHeader>
            <CardBody>
              {assets.length === 0 ? (
                <p className="text-xs leading-relaxed text-muted">
                  Sem media. O Instagram exige pelo menos uma imagem ou video — sem media, a
                  publicacao sera recusada pela plataforma.
                </p>
              ) : (
                <ul className="space-y-2">
                  {assets.map((asset) => (
                    <li key={asset.id} className="flex items-center gap-2 text-xs">
                      <Badge tone="neutral">{asset.kind}</Badge>
                      <span className="truncate text-muted">
                        {asset.storage_path ?? asset.external_url ?? '—'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          {(attemptRows ?? []).length > 0 ? (
            <Card>
              <CardHeader><div><CardTitle>Tentativas de publicacao</CardTitle></div></CardHeader>
              <CardBody className="space-y-2">
                {(attemptRows ?? []).map((attempt: Record<string, unknown>) => (
                  <div key={String(attempt.id)} className="text-[11px]">
                    <span className="font-medium">Tentativa {String(attempt.attempt)}</span>
                    {' · '}
                    <span className={attempt.status === 'SUCCEEDED' ? 'text-ok' : 'text-danger'}>
                      {String(attempt.status)}
                    </span>
                    {' · '}
                    <span className="text-faint">{formatDateTime(String(attempt.created_at))}</span>
                  </div>
                ))}
              </CardBody>
            </Card>
          ) : null}

          {(versionRows ?? []).length > 0 ? (
            <Card>
              <CardHeader><div><CardTitle>Historico de versoes</CardTitle></div></CardHeader>
              <CardBody className="space-y-2">
                {(versionRows ?? []).map((version: Record<string, unknown>) => (
                  <details key={String(version.id)} className="rounded-lg border border-line p-2">
                    <summary className="cursor-pointer text-[11px] font-medium">
                      v{String(version.version)} · {String(version.reason ?? '')} · {relativeTime(String(version.created_at))}
                    </summary>
                    <pre className="mt-2 overflow-x-auto text-[10px] leading-relaxed text-muted">
                      {JSON.stringify(version.snapshot, null, 2)}
                    </pre>
                  </details>
                ))}
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line pb-2 last:border-0 last:pb-0">
      <span className="text-faint">{label}</span>
      <span className="text-ink">{children}</span>
    </div>
  );
}
