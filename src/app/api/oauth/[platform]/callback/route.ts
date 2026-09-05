/**
 * OAuth callback.
 *
 * Redirects back into the app with a readable message either way — a failed
 * connection tells the operator which step failed and what to do about it.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { completeOAuth, platformFromSlug } from '@/server/oauth/flow';
import { serverEnv } from '@/lib/env';
import { normalizeError } from '@/lib/errors';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ platform: string }> },
) {
  const origin = request.nextUrl.origin;
  const params = request.nextUrl.searchParams;

  try {
    const { platform: slug } = await context.params;
    const platform = platformFromSlug(slug);

    // The user declined on the platform's screen.
    const error = params.get('error') ?? params.get('error_code');
    if (error) {
      const description = params.get('error_description') ?? params.get('error_message') ?? error;
      const url = new URL('/redes-sociais', origin);
      url.searchParams.set('erro',
        `A autorizacao foi cancelada na ${platform}. Motivo indicado: ${description}. ` +
        'Nenhuma conta foi ligada. Pode tentar novamente.');
      return NextResponse.redirect(url);
    }

    const code = params.get('code');
    const state = params.get('state');
    if (!code || !state) {
      const url = new URL('/redes-sociais', origin);
      url.searchParams.set('erro',
        'A plataforma respondeu sem o codigo de autorizacao. Recomece a ligacao.');
      return NextResponse.redirect(url);
    }

    const env = serverEnv();
    const redirectUri = (platform === 'FACEBOOK' || platform === 'INSTAGRAM') && env.metaRedirectUri
      ? env.metaRedirectUri
      : new URL(request.nextUrl.pathname, origin).toString();

    const result = await completeOAuth({ platform, code, state, redirectUri });

    const url = new URL(result.redirectTo, origin);
    url.searchParams.set('sucesso',
      `${result.connected.length} conta(s) ligada(s)` +
      (result.adAccounts > 0 ? ` e ${result.adAccounts} conta(s) publicitaria(s) detetada(s).` : '.'));
    return NextResponse.redirect(url);
  } catch (err) {
    const appError = normalizeError(err, 'ligacao de conta social');
    await logger.error({
      channel: 'AUTH', action: 'oauth.callback_failed',
      message: appError.toDisplay(), error: appError,
    });
    const url = new URL('/redes-sociais', origin);
    url.searchParams.set('erro', appError.toDisplay());
    return NextResponse.redirect(url);
  }
}
