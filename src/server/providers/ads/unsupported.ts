import 'server-only';
/** Ads connectors NojAds has not built. Every call throws, loudly and clearly. */
import { capabilitiesFor } from '@/server/platform/capabilities';
import { NotImplementedError } from '@/lib/errors';
import type {
  AdsProvider, CampaignMetrics, ExternalRef, RemoteAdAccount, RemoteCampaign,
} from '@/server/providers/types';
import type { Platform } from '@/types/models';

export class ScaffoldedAdsProvider implements AdsProvider {
  constructor(
    readonly platform: Platform,
    private readonly label: string,
    private readonly envKeys: string[],
  ) {}

  get capabilities() { return capabilitiesFor(this.platform); }
  isConfigured() { return false; }
  missingConfiguration() { return this.envKeys; }

  private fail(operation: string): never {
    throw new NotImplementedError({ operation, provider: `${this.label} Ads` });
  }

  getAdAccounts(): Promise<RemoteAdAccount[]> { this.fail('listagem de contas publicitarias'); }
  getAdAccount(): Promise<RemoteAdAccount> { this.fail('leitura de conta publicitaria'); }
  getCampaigns(): Promise<RemoteCampaign[]> { this.fail('listagem de campanhas'); }
  getCampaign(): Promise<RemoteCampaign> { this.fail('leitura de campanha'); }
  createCampaign(): Promise<ExternalRef> { this.fail('criacao de campanha'); }
  createAdSet(): Promise<ExternalRef> { this.fail('criacao de conjunto de anuncios'); }
  createCreative(): Promise<ExternalRef> { this.fail('criacao de criativo'); }
  createAd(): Promise<ExternalRef> { this.fail('criacao de anuncio'); }
  pauseCampaign(): Promise<void> { this.fail('pausa de campanha'); }
  resumeCampaign(): Promise<void> { this.fail('retoma de campanha'); }
  updateCampaign(): Promise<void> { this.fail('atualizacao de campanha'); }
  deleteCampaign(): Promise<void> { this.fail('eliminacao de campanha'); }
  getCampaignMetrics(): Promise<CampaignMetrics[]> { this.fail('leitura de metricas de campanha'); }
}
