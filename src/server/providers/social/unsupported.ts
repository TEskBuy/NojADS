import 'server-only';
/**
 * Placeholder providers for platforms NojAds has not built yet.
 *
 * Every method throws NotImplementedError. That is deliberate: a stub that
 * quietly returned `{ ok: true }` would let the UI claim a post was published
 * when nothing left the building.
 */
import { capabilitiesFor } from '@/server/platform/capabilities';
import { NotImplementedError } from '@/lib/errors';
import type {
  AccountInsights, DiscoveredAccount, OAuthStartResult, OAuthTokenSet, PostInsights,
  ProviderContext, PublishInput, PublishResult, SocialProvider,
} from '@/server/providers/types';
import type { Platform } from '@/types/models';

export class ScaffoldedSocialProvider implements SocialProvider {
  constructor(
    readonly platform: Platform,
    private readonly label: string,
    private readonly envKeys: string[],
  ) {}

  get capabilities() { return capabilitiesFor(this.platform); }

  isConfigured() { return false; }
  missingConfiguration() { return this.envKeys; }

  private fail(operation: string): never {
    throw new NotImplementedError({ operation, provider: this.label });
  }

  buildAuthorizationUrl(): OAuthStartResult { this.fail('ligacao de conta'); }
  exchangeCode(): Promise<OAuthTokenSet> { this.fail('troca de codigo OAuth'); }
  refreshToken(): Promise<OAuthTokenSet> { this.fail('renovacao de token'); }
  revoke(): Promise<void> { this.fail('revogacao de acesso'); }
  discoverAccounts(): Promise<DiscoveredAccount[]> { this.fail('descoberta de contas'); }
  verifyConnection(): Promise<{ healthy: boolean; reason?: string; scopes: string[] }> {
    return Promise.resolve({
      healthy: false,
      reason: `O conector ${this.label} ainda nao foi implementado no NojAds.`,
      scopes: [],
    });
  }
  publish(_ctx: ProviderContext, _input: PublishInput): Promise<PublishResult> { this.fail('publicacao'); }
  deletePost(): Promise<void> { this.fail('remocao de publicacao'); }
  getAccountInsights(): Promise<AccountInsights[]> { this.fail('leitura de metricas da conta'); }
  getPostInsights(): Promise<PostInsights[]> { this.fail('leitura de metricas de publicacao'); }
}
