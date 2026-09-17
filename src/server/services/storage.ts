import 'server-only';
/**
 * Storage helpers.
 *
 * Object paths are always clients/{clientId}/{area}/{file}, because the RLS
 * policies on storage.objects read the client id out of the second segment.
 *
 * Platforms fetch media themselves, so a private object needs a temporary
 * signed URL at publish time — that is what signedMediaUrls produces.
 */
import { createAdminSupabase } from '@/lib/supabase/admin';
import { AppError } from '@/lib/errors';
import type { ContentAsset } from '@/types/models';
import type { MediaInput } from '@/server/providers/types';

export type StorageArea = 'logos' | 'content' | 'videos' | 'ads';

const BUCKET_BY_AREA: Record<StorageArea, string> = {
  logos: 'client-logos',
  content: 'client-content',
  videos: 'client-videos',
  ads: 'client-ads',
};

export function bucketFor(area: StorageArea): string {
  return BUCKET_BY_AREA[area];
}

export function storagePath(clientId: string, area: StorageArea, filename: string): string {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120);
  return `clients/${clientId}/${area}/${Date.now()}_${safe}`;
}

export async function uploadObject(args: {
  clientId: string;
  area: StorageArea;
  filename: string;
  body: ArrayBuffer | Buffer | Uint8Array;
  contentType: string;
}): Promise<{ bucket: string; path: string }> {
  const db = createAdminSupabase();
  const bucket = bucketFor(args.area);
  const path = storagePath(args.clientId, args.area, args.filename);

  const { error } = await db.storage.from(bucket).upload(path, args.body, {
    contentType: args.contentType,
    upsert: false,
  });

  if (error) {
    throw new AppError({
      code: 'STORAGE_UPLOAD_FAILED',
      operation: 'envio de ficheiro',
      step: `escrita no bucket ${bucket}`,
      message: error.message,
      hint: 'Verifique o tamanho e o tipo do ficheiro. Os limites estao em supabase/migrations/0009_storage.sql.',
      status: 500,
    });
  }

  return { bucket, path };
}

/** Signed URL. Default 2h: long enough for a video to transcode on the platform. */
export async function signedUrl(bucket: string, path: string, expiresInSeconds = 7200): Promise<string> {
  const db = createAdminSupabase();
  const { data, error } = await db.storage.from(bucket).createSignedUrl(path, expiresInSeconds);
  if (error || !data?.signedUrl) {
    throw new AppError({
      code: 'STORAGE_SIGN_FAILED',
      operation: 'geracao de URL temporario',
      step: `assinatura em ${bucket}`,
      message: error?.message ?? 'Nao foi possivel assinar o URL.',
      hint: 'Confirme que o ficheiro ainda existe no Storage.',
      status: 500,
    });
  }
  return data.signedUrl;
}

export function publicUrl(bucket: string, path: string): string {
  const db = createAdminSupabase();
  return db.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

/**
 * Turns stored assets into media the platform can fetch. Assets that already
 * carry an external URL are passed through untouched.
 */
export async function signedMediaUrls(assets: ContentAsset[]): Promise<MediaInput[]> {
  const media: MediaInput[] = [];

  for (const asset of assets) {
    if (asset.kind !== 'IMAGE' && asset.kind !== 'VIDEO') continue;

    let url = asset.external_url ?? asset.public_url ?? undefined;
    if (!url && asset.storage_path) {
      const bucket = asset.kind === 'VIDEO' ? 'client-videos' : 'client-content';
      url = await signedUrl(bucket, asset.storage_path);
    }
    if (!url) continue;

    media.push({
      url,
      kind: asset.kind,
      mimeType: asset.mime_type ?? undefined,
      width: asset.width ?? undefined,
      height: asset.height ?? undefined,
      durationMs: asset.duration_ms ?? undefined,
      thumbnailUrl: (asset.metadata as Record<string, unknown>)?.thumbnailUrl as string | undefined,
      caption: (asset.metadata as Record<string, unknown>)?.caption as string | undefined,
    });
  }

  return media;
}
