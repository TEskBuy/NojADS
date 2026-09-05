/**
 * Task type registry.
 *
 * A task type declares which queue runs it, which platform capability it
 * needs, and which config fields the editor should show. Adding a new kind of
 * recurring work means adding an entry here plus a handler in the worker.
 */
import type { ContentFormat, Platform } from '@/types/models';

export type TaskTypeId =
  | 'GENERATE_POSTS'
  | 'GENERATE_REELS'
  | 'GENERATE_STORIES'
  | 'GENERATE_FLYERS'
  | 'PUBLISH_SCHEDULED'
  | 'SYNC_ANALYTICS'
  | 'GENERATE_IDEAS'
  | 'WEEKLY_REPORT'
  | 'OPTIMIZE_CAMPAIGNS'
  | 'AUTO_CAMPAIGN';

export interface TaskTypeDefinition {
  id: TaskTypeId;
  label: string;
  description: string;
  queue: 'content' | 'publishing' | 'analytics' | 'ads' | 'billing' | 'notifications';
  /** Content format produced, when the task produces content. */
  produces?: ContentFormat;
  requiresSocialAccount: boolean;
  requiresAdAccount: boolean;
  requiresAI: boolean;
  /** Task types that can move real money need an approval gate by default. */
  touchesMoney: boolean;
  defaultQuantity: number;
  maxQuantity: number;
  timeoutSeconds: number;
}

export const TASK_TYPES: Record<TaskTypeId, TaskTypeDefinition> = {
  GENERATE_POSTS: {
    id: 'GENERATE_POSTS',
    label: 'Criar publicacoes',
    description: 'Gera publicacoes com IA a partir da identidade da marca e agenda-as.',
    queue: 'content', produces: 'POST',
    requiresSocialAccount: true, requiresAdAccount: false, requiresAI: true,
    touchesMoney: false, defaultQuantity: 3, maxQuantity: 20, timeoutSeconds: 600,
  },
  GENERATE_REELS: {
    id: 'GENERATE_REELS',
    label: 'Criar Reels',
    description: 'Gera guioes e conteudo para Reels. A renderizacao depende do Video Studio.',
    queue: 'content', produces: 'REEL',
    requiresSocialAccount: true, requiresAdAccount: false, requiresAI: true,
    touchesMoney: false, defaultQuantity: 3, maxQuantity: 10, timeoutSeconds: 900,
  },
  GENERATE_STORIES: {
    id: 'GENERATE_STORIES',
    label: 'Criar Stories',
    description: 'Gera Stories diarios alinhados com a marca.',
    queue: 'content', produces: 'STORY',
    requiresSocialAccount: true, requiresAdAccount: false, requiresAI: true,
    touchesMoney: false, defaultQuantity: 2, maxQuantity: 10, timeoutSeconds: 600,
  },
  GENERATE_FLYERS: {
    id: 'GENERATE_FLYERS',
    label: 'Criar flyers',
    description: 'Gera o texto e o briefing visual de flyers para o Creative Studio.',
    queue: 'content', produces: 'FLYER',
    requiresSocialAccount: false, requiresAdAccount: false, requiresAI: true,
    touchesMoney: false, defaultQuantity: 2, maxQuantity: 10, timeoutSeconds: 600,
  },
  PUBLISH_SCHEDULED: {
    id: 'PUBLISH_SCHEDULED',
    label: 'Publicar conteudo agendado',
    description: 'Publica na rede social todo o conteudo cuja hora chegou.',
    queue: 'publishing',
    requiresSocialAccount: true, requiresAdAccount: false, requiresAI: false,
    touchesMoney: false, defaultQuantity: 1, maxQuantity: 1, timeoutSeconds: 900,
  },
  SYNC_ANALYTICS: {
    id: 'SYNC_ANALYTICS',
    label: 'Sincronizar metricas',
    description: 'Le metricas de contas, publicacoes e campanhas e guarda-as.',
    queue: 'analytics',
    requiresSocialAccount: true, requiresAdAccount: false, requiresAI: false,
    touchesMoney: false, defaultQuantity: 1, maxQuantity: 1, timeoutSeconds: 600,
  },
  GENERATE_IDEAS: {
    id: 'GENERATE_IDEAS',
    label: 'Gerar sugestoes de conteudo',
    description: 'Produz ideias especificas para o cliente, sem publicar nada.',
    queue: 'content',
    requiresSocialAccount: false, requiresAdAccount: false, requiresAI: true,
    touchesMoney: false, defaultQuantity: 10, maxQuantity: 30, timeoutSeconds: 300,
  },
  WEEKLY_REPORT: {
    id: 'WEEKLY_REPORT',
    label: 'Gerar relatorio',
    description: 'Compila desempenho, gastos e recomendacoes do periodo.',
    queue: 'analytics',
    requiresSocialAccount: false, requiresAdAccount: false, requiresAI: false,
    touchesMoney: false, defaultQuantity: 1, maxQuantity: 1, timeoutSeconds: 600,
  },
  OPTIMIZE_CAMPAIGNS: {
    id: 'OPTIMIZE_CAMPAIGNS',
    label: 'Analisar e otimizar campanhas',
    description: 'Analisa desempenho e propoe alteracoes. Alteracoes de orcamento exigem aprovacao.',
    queue: 'ads',
    requiresSocialAccount: false, requiresAdAccount: true, requiresAI: true,
    touchesMoney: true, defaultQuantity: 1, maxQuantity: 1, timeoutSeconds: 900,
  },
  AUTO_CAMPAIGN: {
    id: 'AUTO_CAMPAIGN',
    label: 'Criar campanha automatica',
    description: 'Prepara uma campanha completa e submete-a para aprovacao antes de publicar.',
    queue: 'ads',
    requiresSocialAccount: true, requiresAdAccount: true, requiresAI: true,
    touchesMoney: true, defaultQuantity: 1, maxQuantity: 1, timeoutSeconds: 900,
  },
};

export const TASK_TYPE_IDS = Object.keys(TASK_TYPES) as TaskTypeId[];

export function taskTypeDefinition(id: string): TaskTypeDefinition | undefined {
  return TASK_TYPES[id as TaskTypeId];
}

/** Task types this platform can actually run, given its capabilities. */
export function taskTypesForPlatform(platform: Platform | null): TaskTypeDefinition[] {
  const all = Object.values(TASK_TYPES);
  if (!platform) return all.filter((t) => !t.requiresSocialAccount && !t.requiresAdAccount);
  return all;
}
