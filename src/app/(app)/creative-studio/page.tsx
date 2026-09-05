import type { Metadata } from 'next';
import { Palette, Upload, Image as ImageIcon } from 'lucide-react';
import { requireStaff, accessibleClientIds } from '@/server/auth/session';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { AssetUploader } from '@/components/forms/asset-uploader';
import {
  Alert, Badge, Card, CardBody, CardHeader, CardTitle, EmptyState, PageHeader,
} from '@/components/ui';
import { formatDateTime } from '@/lib/utils';
import type { BrandSettings, Client, ContentAsset } from '@/types/models';

export const metadata: Metadata = { title: 'Creative Studio' };
export const dynamic = 'force-dynamic';

export default async function CreativeStudioPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  const session = await requireStaff('acesso ao Creative Studio');
  const params = await searchParams;
  const db = createAdminSupabase();
  const ids = await accessibleClientIds(session);
  const fallback = ['00000000-0000-0000-0000-000000000000'];

  const clientsQuery = ids === null
    ? db.from('clients').select('*').neq('status', 'ARCHIVED').order('name')
    : db.from('clients').select('*').in('id', ids.length ? ids : fallback).order('name');
  const { data: clientRows } = await clientsQuery;
  const clients = (clientRows ?? []) as Client[];
  const selected = params.client ?? clients[0]?.id;

  const [{ data: assetRows }, { data: brandRow }] = await Promise.all([
    selected
      ? db.from('content_assets').select('*').eq('client_id', selected)
          .order('created_at', { ascending: false }).limit(48)
      : Promise.resolve({ data: [] }),
    selected
      ? db.from('brand_settings').select('*').eq('client_id', selected).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const assets = (assetRows ?? []) as ContentAsset[];
  const brand = brandRow as BrandSettings | null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Creative Studio"
        description="Biblioteca de media do cliente: logotipos, imagens, ficheiros para flyers e criativos de anuncios."
      />

      <Alert tone="info" title="O que este modulo faz — e o que ainda nao faz">
        O Creative Studio guarda e organiza a media de cada cliente, com a identidade visual
        sempre a vista, e alimenta as publicacoes e os anuncios. A composicao grafica automatica
        e a geracao de imagens por IA exigem um provider de imagem configurado; enquanto nao
        existir, o NojAds mostra o briefing visual que a IA escreveu e deixa a producao consigo,
        em vez de inventar um ficheiro que nao criou.
      </Alert>

      {clients.length === 0 ? (
        <Card>
          <EmptyState icon={Palette} title="Crie um cliente primeiro"
            description="A media pertence sempre a um cliente e fica organizada em clients/{cliente}/…" />
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader><div><CardTitle>Cliente</CardTitle></div></CardHeader>
            <CardBody>
              <form method="get" className="flex flex-wrap gap-2">
                <select name="client" defaultValue={selected}
                  className="h-9 min-w-[220px] flex-1 rounded-lg border border-line bg-surface px-3 text-sm"
                  aria-label="Cliente">
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}{c.is_demo ? ' (DEMO)' : ''}</option>
                  ))}
                </select>
                <button type="submit" className="h-9 rounded-lg border border-line px-4 text-sm hover:bg-raised">
                  Selecionar
                </button>
              </form>
            </CardBody>
          </Card>

          {brand ? (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Identidade visual em uso</CardTitle>
                  <p className="mt-1 text-xs text-muted">
                    Estas sao as regras que qualquer peca deste cliente deve respeitar.
                  </p>
                </div>
              </CardHeader>
              <CardBody className="space-y-3">
                {brand.primary_colors.length || brand.secondary_colors.length ? (
                  <div className="flex flex-wrap gap-2">
                    {[...brand.primary_colors, ...brand.secondary_colors].map((color) => (
                      <span key={color} className="flex items-center gap-1.5 rounded-lg border border-line px-2 py-1 text-[11px]">
                        <span className="h-4 w-4 rounded border border-line" style={{ background: color }} aria-hidden />
                        <span className="font-mono">{color}</span>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted">
                    Sem cores definidas. Preencha a identidade da marca na ficha do cliente.
                  </p>
                )}
                {brand.tone_of_voice ? (
                  <p className="text-xs text-muted"><strong>Tom:</strong> {brand.tone_of_voice}</p>
                ) : null}
                {brand.visual_style ? (
                  <p className="text-xs text-muted"><strong>Estilo:</strong> {brand.visual_style}</p>
                ) : null}
                {brand.forbidden_words.length ? (
                  <p className="text-xs text-warn">
                    <strong>Nunca usar:</strong> {brand.forbidden_words.join(', ')}
                  </p>
                ) : null}
              </CardBody>
            </Card>
          ) : null}

          {selected ? (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle className="flex items-center gap-1.5">
                    <Upload className="h-4 w-4" aria-hidden /> Enviar media
                  </CardTitle>
                  <p className="mt-1 text-xs text-muted">
                    Imagens ate 100 MB, videos ate 500 MB. Ficam em clients/{'{cliente}'}/content.
                  </p>
                </div>
              </CardHeader>
              <CardBody>
                <AssetUploader clientId={selected} />
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <div><CardTitle>Biblioteca</CardTitle></div>
              <Badge tone="neutral">{String(assets.length)}</Badge>
            </CardHeader>
            {assets.length === 0 ? (
              <EmptyState icon={ImageIcon} title="Sem media"
                description="Envie imagens e videos para os usar em publicacoes e anuncios." />
            ) : (
              <CardBody className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {assets.map((asset) => (
                  <div key={asset.id} className="overflow-hidden rounded-lg border border-line">
                    <div className="flex aspect-square items-center justify-center bg-raised">
                      <ImageIcon className="h-6 w-6 text-faint" aria-hidden />
                    </div>
                    <div className="p-2">
                      <p className="flex items-center gap-1.5">
                        <Badge tone="neutral">{asset.kind}</Badge>
                        {asset.is_demo ? <Badge tone="warn">DEMO</Badge> : null}
                      </p>
                      <p className="mt-1 truncate font-mono text-[10px] text-faint">
                        {asset.storage_path?.split('/').pop() ?? asset.external_url ?? '—'}
                      </p>
                      <p className="text-[10px] text-faint">{formatDateTime(asset.created_at)}</p>
                    </div>
                  </div>
                ))}
              </CardBody>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
