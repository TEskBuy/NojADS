import 'server-only';
/**
 * Facebook Pages + Instagram Business publishing.
 *
 * Facebook posts go to a Page (the API cannot post to a personal profile).
 * Instagram uses the two-step container flow: create a media container, then
 * publish it. Neither call is reported as successful until Meta returns an id.
 */
import { graph, graphPaged, metaConfig, requireMetaConfig } from '@/server/providers/meta/client';
import { capabilitiesFor } from '@/server/platform/capabilities';
import { NotSupportedError, ProviderError, ValidationError } from '@/lib/errors';
import type {
  AccountInsights, DiscoveredAccount, OAuthStartResult, OAuthTokenSet, PostInsights,
  ProviderContext, PublishInput, PublishResult, SocialProvider,
} from '@/server/providers/types';
import type { Platform } from '@/types/models';

interface MetaPage {
  id: string;
  name: string;
  access_token: string;
  category?: string;
  link?: string;
  picture?: { data?: { url?: string } };
  instagram_business_account?: { id: string; username?: string; profile_picture_url?: string; name?: string };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

abstract class MetaSocialBase implements SocialProvider {
  abstract readonly platform: Platform;
  get capabilities() { return capabilitiesFor(this.platform); }

  isConfigured() { return metaConfig().isConfigured; }
  missingConfiguration() { return metaConfig().missing; }

  buildAuthorizationUrl(args: { state: string; redirectUri: string }): OAuthStartResult {
    const config = requireMetaConfig('ligacao de conta Meta');
    const url = new URL(`https://www.facebook.com/${config.apiVersion}/dialog/oauth`);
    url.searchParams.set('client_id', config.appId!);
    url.searchParams.set('redirect_uri', args.redirectUri);
    url.searchParams.set('state', args.state);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', config.scopes.join(','));
    return { authorizationUrl: url.toString(), state: args.state };
  }

  async exchangeCode(args: { code: string; redirectUri: string }): Promise<OAuthTokenSet> {
    const config = requireMetaConfig('troca de codigo OAuth');
    const short = await graph<{ access_token: string; token_type?: string; expires_in?: number }>({
      path: '/oauth/access_token',
      accessToken: '',
      operation: 'ligacao de conta Meta',
      step: 'troca do codigo por token',
      params: {
        client_id: config.appId!,
        client_secret: config.appSecret!,
        redirect_uri: args.redirectUri,
        code: args.code,
      },
      maxRetries: 1,
    }).catch(async () => {
      // The token endpoint takes no appsecret_proof; call it plainly.
      const url = new URL(`https://graph.facebook.com/${config.apiVersion}/oauth/access_token`);
      url.searchParams.set('client_id', config.appId!);
      url.searchParams.set('client_secret', config.appSecret!);
      url.searchParams.set('redirect_uri', args.redirectUri);
      url.searchParams.set('code', args.code);
      const res = await fetch(url.toString(), { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) {
        throw new ProviderError({
          operation: 'ligacao de conta Meta',
          step: 'troca do codigo por token',
          provider: 'Meta',
          platformCode: json?.error?.code,
          platformMessage: json?.error?.message,
          hint: 'Confirme que o Redirect URI no NojAds e exatamente o mesmo configurado na app da Meta.',
        });
      }
      return json;
    });

    // Short-lived tokens last ~1h. Exchange for the ~60 day long-lived one.
    const longUrl = new URL(`https://graph.facebook.com/${config.apiVersion}/oauth/access_token`);
    longUrl.searchParams.set('grant_type', 'fb_exchange_token');
    longUrl.searchParams.set('client_id', config.appId!);
    longUrl.searchParams.set('client_secret', config.appSecret!);
    longUrl.searchParams.set('fb_exchange_token', short.access_token);
    const longRes = await fetch(longUrl.toString(), { cache: 'no-store' });
    const longJson = await longRes.json();
    if (!longRes.ok) {
      throw new ProviderError({
        operation: 'ligacao de conta Meta',
        step: 'obtencao de token de longa duracao',
        provider: 'Meta',
        platformCode: longJson?.error?.code,
        platformMessage: longJson?.error?.message,
      });
    }

    const expiresIn = Number(longJson.expires_in ?? 0);
    const scopes = await this.readGrantedScopes(longJson.access_token);
    return {
      accessToken: longJson.access_token,
      tokenType: longJson.token_type ?? 'bearer',
      expiresAt: expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : undefined,
      scopes,
    };
  }

  /**
   * Meta long-lived user tokens are not refreshed with a refresh token: they
   * are re-exchanged. Saying so plainly beats pretending a refresh happened.
   */
  async refreshToken(): Promise<OAuthTokenSet> {
    throw new NotSupportedError({
      operation: 'renovacao automatica de token',
      platform: 'Meta',
      reason:
        'A Meta nao emite refresh tokens para tokens de utilizador. Um token de longa duracao ' +
        'dura cerca de 60 dias e tem de ser renovado reconectando a conta.',
      docsUrl: 'https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived',
    });
  }

  async revoke(ctx: ProviderContext): Promise<void> {
    const externalId = ctx.account?.external_id;
    if (!externalId) {
      throw new ValidationError({
        operation: 'revogacao de acesso',
        message: 'Conta social sem identificador externo.',
      });
    }
    await graph({
      path: `/${externalId}/permissions`,
      method: 'DELETE',
      accessToken: ctx.accessToken,
      operation: 'revogacao de acesso',
      step: 'remocao das permissoes na Meta',
    });
  }

  protected async readGrantedScopes(accessToken: string): Promise<string[]> {
    try {
      const res = await graph<{ data?: { permission: string; status: string }[] }>({
        path: '/me/permissions',
        accessToken,
        operation: 'ligacao de conta Meta',
        step: 'leitura das permissoes concedidas',
      });
      return (res.data ?? []).filter((p) => p.status === 'granted').map((p) => p.permission);
    } catch {
      return [];
    }
  }

  protected async listPages(accessToken: string): Promise<MetaPage[]> {
    return graphPaged<MetaPage>({
      path: '/me/accounts',
      accessToken,
      operation: 'descoberta de contas',
      step: 'listagem de Paginas do Facebook',
      params: {
        fields: 'id,name,access_token,category,link,picture{url},instagram_business_account{id,username,name,profile_picture_url}',
      },
    });
  }

  abstract discoverAccounts(accessToken: string): Promise<DiscoveredAccount[]>;
  abstract publish(ctx: ProviderContext, input: PublishInput): Promise<PublishResult>;
  abstract deletePost(ctx: ProviderContext, externalId: string): Promise<void>;
  abstract getAccountInsights(ctx: ProviderContext, args: { since: string; until: string }): Promise<AccountInsights[]>;
  abstract getPostInsights(ctx: ProviderContext, externalIds: string[]): Promise<PostInsights[]>;

  async verifyConnection(ctx: ProviderContext) {
    const scopes = await this.readGrantedScopes(ctx.accessToken);
    const required = this.capabilities.social.requiredScopes;
    const missing = required.filter((s) => !scopes.includes(s));
    return {
      healthy: missing.length === 0,
      reason: missing.length
        ? `Permissoes em falta na Meta: ${missing.join(', ')}. Reconecte a conta e aceite todas as permissoes pedidas.`
        : undefined,
      scopes,
    };
  }
}

// ------------------------------------------------------------- Facebook

export class MetaFacebookProvider extends MetaSocialBase {
  readonly platform = 'FACEBOOK' as const;

  async discoverAccounts(accessToken: string): Promise<DiscoveredAccount[]> {
    const pages = await this.listPages(accessToken);
    return pages.map((page) => ({
      externalId: page.id,
      displayName: page.name,
      username: page.name,
      avatarUrl: page.picture?.data?.url,
      profileUrl: page.link ?? `https://facebook.com/${page.id}`,
      accountType: page.category ?? 'PAGE',
      platform: 'FACEBOOK' as const,
      // The Page access token is what actually publishes; it is encrypted
      // alongside the user token by the OAuth callback.
      metadata: { pageAccessToken: page.access_token, category: page.category },
    }));
  }

  async publish(ctx: ProviderContext, input: PublishInput): Promise<PublishResult> {
    const pageId = ctx.account?.external_id;
    if (!pageId) {
      throw new ValidationError({
        operation: 'publicacao no Facebook',
        message: 'Conta do Facebook sem identificador de Pagina.',
        hint: 'Reconecte a Pagina em Redes Sociais.',
      });
    }

    const images = input.media.filter((m) => m.kind === 'IMAGE');
    const videos = input.media.filter((m) => m.kind === 'VIDEO');
    const message = [input.body, (input.hashtags ?? []).join(' ')].filter(Boolean).join('\n\n');

    // Native scheduling: Meta accepts 10 minutes to 6 months ahead.
    const scheduleParams: Record<string, string | number | boolean> = {};
    if (input.scheduledFor) {
      const when = Math.floor(new Date(input.scheduledFor).getTime() / 1000);
      const minimum = Math.floor(Date.now() / 1000) + 600;
      if (when > minimum) {
        scheduleParams.published = false;
        scheduleParams.scheduled_publish_time = when;
      }
    }

    let result: { id?: string; post_id?: string };

    if (videos.length > 0) {
      result = await graph({
        path: `/${pageId}/videos`,
        method: 'POST',
        accessToken: ctx.accessToken,
        operation: 'publicacao no Facebook',
        step: 'envio do video para a Pagina',
        idempotencyKey: input.idempotencyKey,
        params: {
          file_url: videos[0].url,
          description: message,
          title: input.title,
          ...scheduleParams,
        },
      });
    } else if (images.length === 1) {
      result = await graph({
        path: `/${pageId}/photos`,
        method: 'POST',
        accessToken: ctx.accessToken,
        operation: 'publicacao no Facebook',
        step: 'envio da imagem para a Pagina',
        idempotencyKey: input.idempotencyKey,
        params: { url: images[0].url, caption: message, ...scheduleParams },
      });
    } else if (images.length > 1) {
      // Multi-photo post: upload each unpublished, then attach to a feed post.
      const mediaFbids: { media_fbid: string }[] = [];
      for (const image of images.slice(0, 10)) {
        const photo = await graph<{ id: string }>({
          path: `/${pageId}/photos`,
          method: 'POST',
          accessToken: ctx.accessToken,
          operation: 'publicacao no Facebook',
          step: 'envio de imagem do carrossel',
          params: { url: image.url, published: false },
        });
        mediaFbids.push({ media_fbid: photo.id });
      }
      result = await graph({
        path: `/${pageId}/feed`,
        method: 'POST',
        accessToken: ctx.accessToken,
        operation: 'publicacao no Facebook',
        step: 'criacao da publicacao com varias imagens',
        idempotencyKey: input.idempotencyKey,
        body: { message, attached_media: mediaFbids, ...scheduleParams },
      });
    } else {
      result = await graph({
        path: `/${pageId}/feed`,
        method: 'POST',
        accessToken: ctx.accessToken,
        operation: 'publicacao no Facebook',
        step: 'criacao da publicacao de texto',
        idempotencyKey: input.idempotencyKey,
        params: { message, link: input.linkUrl, ...scheduleParams },
      });
    }

    const externalId = result.post_id ?? result.id;
    if (!externalId) {
      throw new ProviderError({
        operation: 'publicacao no Facebook',
        step: 'confirmacao da resposta da Meta',
        provider: 'Meta',
        platformMessage: 'A Meta respondeu sem devolver o identificador da publicacao.',
        hint: 'Verifique na Pagina se a publicacao existe antes de tentar novamente.',
      });
    }

    return {
      externalId,
      externalUrl: `https://facebook.com/${externalId}`,
      publishedAt: new Date().toISOString(),
      raw: result as Record<string, unknown>,
    };
  }

  async deletePost(ctx: ProviderContext, externalId: string): Promise<void> {
    await graph({
      path: `/${externalId}`,
      method: 'DELETE',
      accessToken: ctx.accessToken,
      operation: 'remocao de publicacao',
      step: 'eliminacao na Meta',
    });
  }

  async getAccountInsights(ctx: ProviderContext, args: { since: string; until: string }): Promise<AccountInsights[]> {
    const pageId = ctx.account?.external_id;
    if (!pageId) return [];
    const res = await graph<{ data?: { name: string; values: { value: number; end_time: string }[] }[] }>({
      path: `/${pageId}/insights`,
      accessToken: ctx.accessToken,
      operation: 'sincronizacao de metricas',
      step: 'leitura de insights da Pagina',
      params: {
        metric: 'page_impressions,page_impressions_unique,page_fans,page_views_total',
        period: 'day',
        since: args.since,
        until: args.until,
      },
    });

    const byDate = new Map<string, AccountInsights>();
    for (const metric of res.data ?? []) {
      for (const point of metric.values ?? []) {
        const date = point.end_time.slice(0, 10);
        const row = byDate.get(date) ?? { externalId: pageId, date, raw: {} };
        if (metric.name === 'page_impressions') row.impressions = point.value;
        if (metric.name === 'page_impressions_unique') row.reach = point.value;
        if (metric.name === 'page_fans') row.followers = point.value;
        if (metric.name === 'page_views_total') row.profileViews = point.value;
        (row.raw as Record<string, unknown>)[metric.name] = point.value;
        byDate.set(date, row);
      }
    }
    return [...byDate.values()];
  }

  async getPostInsights(ctx: ProviderContext, externalIds: string[]): Promise<PostInsights[]> {
    const out: PostInsights[] = [];
    for (const id of externalIds.slice(0, 50)) {
      try {
        const res = await graph<{ data?: { name: string; values: { value: number }[] }[] }>({
          path: `/${id}/insights`,
          accessToken: ctx.accessToken,
          operation: 'sincronizacao de metricas',
          step: 'leitura de insights da publicacao',
          params: { metric: 'post_impressions,post_impressions_unique,post_reactions_by_type_total,post_clicks' },
        });
        const row: PostInsights = { externalId: id, raw: {} };
        for (const metric of res.data ?? []) {
          const value = metric.values?.[0]?.value;
          if (metric.name === 'post_impressions') row.impressions = Number(value ?? 0);
          if (metric.name === 'post_impressions_unique') row.reach = Number(value ?? 0);
          if (metric.name === 'post_reactions_by_type_total' && value && typeof value === 'object') {
            row.likes = Object.values(value as Record<string, number>).reduce((a, b) => a + b, 0);
          }
          (row.raw as Record<string, unknown>)[metric.name] = value;
        }
        out.push(row);
      } catch {
        // One unreadable post must not abandon the whole sync.
      }
    }
    return out;
  }
}

// ------------------------------------------------------------ Instagram

export class MetaInstagramProvider extends MetaSocialBase {
  readonly platform = 'INSTAGRAM' as const;

  async discoverAccounts(accessToken: string): Promise<DiscoveredAccount[]> {
    const pages = await this.listPages(accessToken);
    return pages
      .filter((page) => page.instagram_business_account?.id)
      .map((page) => {
        const ig = page.instagram_business_account!;
        return {
          externalId: ig.id,
          username: ig.username,
          displayName: ig.name ?? ig.username,
          avatarUrl: ig.profile_picture_url,
          profileUrl: ig.username ? `https://instagram.com/${ig.username}` : undefined,
          accountType: 'BUSINESS',
          parentExternalId: page.id,
          platform: 'INSTAGRAM' as const,
          metadata: { pageId: page.id, pageName: page.name, pageAccessToken: page.access_token },
        };
      });
  }

  async publish(ctx: ProviderContext, input: PublishInput): Promise<PublishResult> {
    const igId = ctx.account?.external_id;
    if (!igId) {
      throw new ValidationError({
        operation: 'publicacao no Instagram',
        message: 'Conta do Instagram sem identificador.',
        hint: 'Reconecte a conta em Redes Sociais.',
      });
    }
    if (input.media.length === 0) {
      throw new ValidationError({
        operation: 'publicacao no Instagram',
        message: 'O Instagram exige pelo menos uma imagem ou video.',
        hint: 'Adicione media ao conteudo antes de publicar.',
      });
    }

    const caption = [input.body, (input.hashtags ?? []).join(' ')].filter(Boolean).join('\n\n');
    const operation = 'publicacao no Instagram';
    let containerId: string;

    if (input.format === 'CAROUSEL' && input.media.length > 1) {
      const children: string[] = [];
      for (const item of input.media.slice(0, 10)) {
        const child = await graph<{ id: string }>({
          path: `/${igId}/media`,
          method: 'POST',
          accessToken: ctx.accessToken,
          operation,
          step: 'criacao do item do carrossel',
          params: item.kind === 'VIDEO'
            ? { video_url: item.url, media_type: 'VIDEO', is_carousel_item: true }
            : { image_url: item.url, is_carousel_item: true },
        });
        children.push(child.id);
      }
      const container = await graph<{ id: string }>({
        path: `/${igId}/media`,
        method: 'POST',
        accessToken: ctx.accessToken,
        operation,
        step: 'criacao do contentor do carrossel',
        idempotencyKey: input.idempotencyKey,
        params: { media_type: 'CAROUSEL', children: children.join(','), caption },
      });
      containerId = container.id;
    } else {
      const media = input.media[0];
      const params: Record<string, string | boolean> = { caption };
      if (input.format === 'STORY') {
        params.media_type = 'STORIES';
        if (media.kind === 'VIDEO') params.video_url = media.url; else params.image_url = media.url;
        delete params.caption; // Stories take no caption.
      } else if (input.format === 'REEL' || media.kind === 'VIDEO') {
        params.media_type = 'REELS';
        params.video_url = media.url;
        if (media.thumbnailUrl) params.cover_url = media.thumbnailUrl;
      } else {
        params.image_url = media.url;
      }
      const container = await graph<{ id: string }>({
        path: `/${igId}/media`,
        method: 'POST',
        accessToken: ctx.accessToken,
        operation,
        step: 'criacao do contentor de media',
        idempotencyKey: input.idempotencyKey,
        params,
      });
      containerId = container.id;
    }

    // Video containers need time to transcode; publishing early fails.
    await this.waitForContainer(ctx, containerId, operation);

    const published = await graph<{ id: string }>({
      path: `/${igId}/media_publish`,
      method: 'POST',
      accessToken: ctx.accessToken,
      operation,
      step: 'publicacao do contentor',
      idempotencyKey: `${input.idempotencyKey}_publish`,
      params: { creation_id: containerId },
    });

    if (!published.id) {
      throw new ProviderError({
        operation,
        step: 'confirmacao da resposta da Meta',
        provider: 'Meta',
        platformMessage: 'A Meta nao devolveu o identificador da publicacao.',
        hint: 'Verifique no Instagram se a publicacao existe antes de tentar novamente.',
      });
    }

    let permalink: string | undefined;
    try {
      const detail = await graph<{ permalink?: string }>({
        path: `/${published.id}`,
        accessToken: ctx.accessToken,
        operation,
        step: 'leitura do link da publicacao',
        params: { fields: 'permalink' },
      });
      permalink = detail.permalink;
    } catch { /* the post exists; the link is a nicety */ }

    return {
      externalId: published.id,
      externalUrl: permalink,
      publishedAt: new Date().toISOString(),
      raw: { containerId, published },
    };
  }

  private async waitForContainer(ctx: ProviderContext, containerId: string, operation: string): Promise<void> {
    const deadline = Date.now() + 120_000;
    let delay = 2000;
    while (Date.now() < deadline) {
      const status = await graph<{ status_code?: string; status?: string }>({
        path: `/${containerId}`,
        accessToken: ctx.accessToken,
        operation,
        step: 'verificacao do processamento da media',
        params: { fields: 'status_code,status' },
      });
      if (status.status_code === 'FINISHED') return;
      if (status.status_code === 'ERROR') {
        throw new ProviderError({
          operation,
          step: 'processamento da media pelo Instagram',
          provider: 'Meta',
          platformCode: 'CONTAINER_ERROR',
          platformMessage: status.status ?? 'O Instagram rejeitou a media enviada.',
          hint: 'Verifique o formato: Reels aceitam MP4/MOV, 3 a 90 segundos, proporcao entre 0.01:1 e 10:1.',
        });
      }
      await sleep(delay);
      delay = Math.min(delay * 1.5, 10_000);
    }
    throw new ProviderError({
      operation,
      step: 'processamento da media pelo Instagram',
      provider: 'Meta',
      platformCode: 'CONTAINER_TIMEOUT',
      platformMessage: 'O Instagram nao terminou o processamento da media em 2 minutos.',
      hint: 'O video pode ser demasiado grande. Reduza a duracao ou a resolucao e tente novamente.',
      retryable: true,
    });
  }

  async deletePost(): Promise<void> {
    throw new NotSupportedError({
      operation: 'remocao de publicacao no Instagram',
      platform: 'Instagram',
      reason: 'A API do Instagram nao expoe eliminacao de publicacoes.',
      docsUrl: 'https://developers.facebook.com/docs/instagram-platform/content-publishing',
    });
  }

  async getAccountInsights(ctx: ProviderContext, args: { since: string; until: string }): Promise<AccountInsights[]> {
    const igId = ctx.account?.external_id;
    if (!igId) return [];
    const res = await graph<{ data?: { name: string; values: { value: number; end_time: string }[] }[] }>({
      path: `/${igId}/insights`,
      accessToken: ctx.accessToken,
      operation: 'sincronizacao de metricas',
      step: 'leitura de insights da conta Instagram',
      params: {
        metric: 'impressions,reach,profile_views',
        period: 'day',
        since: args.since,
        until: args.until,
      },
    });

    const byDate = new Map<string, AccountInsights>();
    for (const metric of res.data ?? []) {
      for (const point of metric.values ?? []) {
        const date = point.end_time.slice(0, 10);
        const row = byDate.get(date) ?? { externalId: igId, date, raw: {} };
        if (metric.name === 'impressions') row.impressions = point.value;
        if (metric.name === 'reach') row.reach = point.value;
        if (metric.name === 'profile_views') row.profileViews = point.value;
        (row.raw as Record<string, unknown>)[metric.name] = point.value;
        byDate.set(date, row);
      }
    }

    try {
      const profile = await graph<{ followers_count?: number }>({
        path: `/${igId}`,
        accessToken: ctx.accessToken,
        operation: 'sincronizacao de metricas',
        step: 'leitura do numero de seguidores',
        params: { fields: 'followers_count' },
      });
      const today = new Date().toISOString().slice(0, 10);
      const row = byDate.get(today) ?? { externalId: igId, date: today, raw: {} };
      row.followers = profile.followers_count;
      byDate.set(today, row);
    } catch { /* insights still useful without the follower count */ }

    return [...byDate.values()];
  }

  async getPostInsights(ctx: ProviderContext, externalIds: string[]): Promise<PostInsights[]> {
    const out: PostInsights[] = [];
    for (const id of externalIds.slice(0, 50)) {
      try {
        const res = await graph<{ data?: { name: string; values: { value: number }[] }[] }>({
          path: `/${id}/insights`,
          accessToken: ctx.accessToken,
          operation: 'sincronizacao de metricas',
          step: 'leitura de insights da publicacao Instagram',
          params: { metric: 'impressions,reach,likes,comments,saved,shares' },
        });
        const row: PostInsights = { externalId: id, raw: {} };
        for (const metric of res.data ?? []) {
          const value = Number(metric.values?.[0]?.value ?? 0);
          if (metric.name === 'impressions') row.impressions = value;
          if (metric.name === 'reach') row.reach = value;
          if (metric.name === 'likes') row.likes = value;
          if (metric.name === 'comments') row.comments = value;
          if (metric.name === 'saved') row.saves = value;
          if (metric.name === 'shares') row.shares = value;
          (row.raw as Record<string, unknown>)[metric.name] = value;
        }
        out.push(row);
      } catch { /* skip unreadable posts */ }
    }
    return out;
  }
}
