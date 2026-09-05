/**
 * Starts an OAuth flow and redirects to the platform's own consent screen.
 * NojAds never renders a login form for another network.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { requireClientAccess } from '@/server/auth/session';
import { platformFromSlug, startOAuth } from '@/server/oauth/flow';
import { serverEnv } from '@/lib/env';
import { fail } from '@/lib/api';
import { ValidationError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

function redirectUriFor(platform: string, request: NextRequest): string {
  const env = serverEnv();
  if (platform === 'FACEBOOK' || platform === 'INSTAGRAM') {
    if (env.metaRedirectUri) return env.metaRedirectUri;
  }
  if (platform === 'TIKTOK' && env.tiktokRedirectUri) return env.tiktokRedirectUri;
  if ((platform === 'YOUTUBE' || platform === 'GOOGLE') && env.googleRedirectUri) return env.googleRedirectUri;
  if (platform === 'LINKEDIN' && env.linkedinRedirectUri) return env.linkedinRedirectUri;
  if (platform === 'X' && env.xRedirectUri) return env.xRedirectUri;

  const slug = platform === 'INSTAGRAM' ? 'meta' : platform.toLowerCase();
  return new URL(`/api/oauth/${slug}/callback`, request.nextUrl.origin).toString();
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ platform: string }> },
) {
  try {
    const { platform: slug } = await context.params;
    const platform = platformFromSlug(slug);
    const clientId = request.nextUrl.searchParams.get('client');

    if (!clientId) {
      throw new ValidationError({
        operation: 'ligacao de conta social',
        message: 'Falta o identificador do cliente.',
        hint: 'Inicie a ligacao a partir da pagina Redes Sociais, escolhendo o cliente.',
      });
    }

    const { session } = await requireClientAccess(clientId, 'ligacao de conta social', { write: true });

    const { authorizationUrl } = await startOAuth({
      platform,
      clientId,
      userId: session.userId,
      redirectUri: redirectUriFor(platform, request),
      returnTo: request.nextUrl.searchParams.get('return') ?? '/redes-sociais',
    });

    return NextResponse.redirect(authorizationUrl);
  } catch (err) {
    return fail(err, 'ligacao de conta social');
  }
}
