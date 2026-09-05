/** Media upload. Authorises, checks the type and size, then stores under the client's prefix. */
import { type NextRequest } from 'next/server';
import { requireClientAccess } from '@/server/auth/session';
import { uploadObject, publicUrl, type StorageArea } from '@/server/services/storage';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { fail, ok } from '@/lib/api';
import { ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const LIMITS: Record<StorageArea, number> = {
  logos: 10 * 1024 * 1024,
  content: 100 * 1024 * 1024,
  ads: 100 * 1024 * 1024,
  videos: 500 * 1024 * 1024,
};

export async function POST(request: NextRequest) {
  const operation = 'envio de ficheiro';
  try {
    const form = await request.formData();
    const clientId = String(form.get('client_id') ?? '');
    const area = String(form.get('area') ?? 'content') as StorageArea;
    const file = form.get('file');

    if (!(file instanceof File)) {
      throw new ValidationError({ operation, message: 'Nenhum ficheiro foi enviado.' });
    }
    if (!LIMITS[area]) {
      throw new ValidationError({
        operation, message: `Destino invalido: ${area}.`,
        hint: 'Use logos, content, ads ou videos.',
      });
    }
    if (file.size > LIMITS[area]) {
      throw new ValidationError({
        operation,
        step: 'validacao do tamanho',
        message: `O ficheiro tem ${(file.size / 1024 / 1024).toFixed(1)} MB e o limite para "${area}" e ${LIMITS[area] / 1024 / 1024} MB.`,
        hint: 'Comprima o ficheiro ou escolha outro destino.',
      });
    }

    const { session } = await requireClientAccess(clientId, operation, { write: true });

    const isVideo = file.type.startsWith('video/');
    const stored = await uploadObject({
      clientId,
      area: isVideo ? 'videos' : area,
      filename: file.name,
      body: await file.arrayBuffer(),
      contentType: file.type || 'application/octet-stream',
    });

    const db = createAdminSupabase();
    const { data } = await db.from('content_assets').insert({
      client_id: clientId,
      kind: isVideo ? 'VIDEO' : area === 'logos' ? 'LOGO' : 'IMAGE',
      storage_path: stored.path,
      public_url: stored.bucket === 'client-logos' ? publicUrl(stored.bucket, stored.path) : null,
      mime_type: file.type || null,
      bytes: file.size,
      source: 'UPLOAD',
    }).select('id').single();

    await logger.info({
      channel: 'ADMIN', action: 'asset.uploaded',
      message: `${file.name} (${(file.size / 1024).toFixed(0)} KB) para ${stored.bucket}.`,
      clientId, userId: session.userId,
    });

    return ok({ assetId: data?.id, bucket: stored.bucket, path: stored.path });
  } catch (err) {
    return fail(err, operation);
  }
}
