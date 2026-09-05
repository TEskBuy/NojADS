/** Status → colour/label mapping, so a state reads the same on every screen. */
import { Badge, type BadgeTone } from './index';
import type {
  CampaignStatus, ConnectionStatus, ContentStatus, JobStatus,
  RunStatus, TaskStatus, TransactionStatus,
} from '@/types/models';

const TASK: Record<TaskStatus, { label: string; tone: BadgeTone }> = {
  ACTIVE: { label: 'Ativa', tone: 'ok' },
  PAUSED: { label: 'Pausada', tone: 'neutral' },
  DISABLED: { label: 'Desativada', tone: 'neutral' },
  REMOVED: { label: 'Removida', tone: 'neutral' },
  ERROR: { label: 'Com erro', tone: 'danger' },
};

const CONTENT: Record<ContentStatus, { label: string; tone: BadgeTone }> = {
  DRAFT: { label: 'Rascunho', tone: 'neutral' },
  GENERATING: { label: 'A gerar', tone: 'info' },
  READY: { label: 'Pronto', tone: 'brand' },
  PENDING_APPROVAL: { label: 'Aguarda aprovacao', tone: 'warn' },
  SCHEDULED: { label: 'Agendado', tone: 'info' },
  PUBLISHING: { label: 'A publicar', tone: 'info' },
  PUBLISHED: { label: 'Publicado', tone: 'ok' },
  FAILED: { label: 'Falhou', tone: 'danger' },
  CANCELLED: { label: 'Cancelado', tone: 'neutral' },
};

const CAMPAIGN: Record<CampaignStatus, { label: string; tone: BadgeTone }> = {
  DRAFT: { label: 'Rascunho', tone: 'neutral' },
  PENDING_APPROVAL: { label: 'Aguarda aprovacao', tone: 'warn' },
  PENDING_PAYMENT: { label: 'Aguarda pagamento', tone: 'warn' },
  PUBLISHING: { label: 'A publicar', tone: 'info' },
  ACTIVE: { label: 'Ativa', tone: 'ok' },
  PAUSED: { label: 'Em pausa', tone: 'neutral' },
  COMPLETED: { label: 'Concluida', tone: 'info' },
  FAILED: { label: 'Falhou', tone: 'danger' },
  ARCHIVED: { label: 'Arquivada', tone: 'neutral' },
};

const CONNECTION: Record<ConnectionStatus, { label: string; tone: BadgeTone }> = {
  CONNECTED: { label: 'Conectada', tone: 'ok' },
  EXPIRED: { label: 'Token expirado', tone: 'warn' },
  REVOKED: { label: 'Acesso revogado', tone: 'danger' },
  ERROR: { label: 'Com erro', tone: 'danger' },
  DISCONNECTED: { label: 'Desconectada', tone: 'neutral' },
};

const RUN: Record<RunStatus, { label: string; tone: BadgeTone }> = {
  QUEUED: { label: 'Na fila', tone: 'neutral' },
  RUNNING: { label: 'A executar', tone: 'info' },
  SUCCEEDED: { label: 'Concluida', tone: 'ok' },
  FAILED: { label: 'Falhou', tone: 'danger' },
  CANCELLED: { label: 'Cancelada', tone: 'neutral' },
  SKIPPED: { label: 'Ignorada', tone: 'neutral' },
};

const JOB: Record<JobStatus, { label: string; tone: BadgeTone }> = {
  PENDING: { label: 'Pendente', tone: 'neutral' },
  RESERVED: { label: 'Reservado', tone: 'info' },
  RUNNING: { label: 'A executar', tone: 'info' },
  SUCCEEDED: { label: 'Concluido', tone: 'ok' },
  FAILED: { label: 'Falhou', tone: 'danger' },
  DEAD: { label: 'Sem tentativas', tone: 'danger' },
  CANCELLED: { label: 'Cancelado', tone: 'neutral' },
};

const TRANSACTION: Record<TransactionStatus, { label: string; tone: BadgeTone }> = {
  PENDING: { label: 'Pendente', tone: 'neutral' },
  PROCESSING: { label: 'Em processamento', tone: 'info' },
  SUCCEEDED: { label: 'Concluida', tone: 'ok' },
  FAILED: { label: 'Falhou', tone: 'danger' },
  CANCELLED: { label: 'Cancelada', tone: 'neutral' },
  REFUNDED: { label: 'Reembolsada', tone: 'info' },
  PARTIALLY_REFUNDED: { label: 'Parcialmente reembolsada', tone: 'info' },
};

function render(entry: { label: string; tone: BadgeTone } | undefined, fallback: string) {
  const value = entry ?? { label: fallback, tone: 'neutral' as BadgeTone };
  return <Badge tone={value.tone}>{value.label}</Badge>;
}

export const TaskStatusBadge = ({ status }: { status: TaskStatus }) => render(TASK[status], status);
export const ContentStatusBadge = ({ status }: { status: ContentStatus }) => render(CONTENT[status], status);
export const CampaignStatusBadge = ({ status }: { status: CampaignStatus }) => render(CAMPAIGN[status], status);
export const ConnectionStatusBadge = ({ status }: { status: ConnectionStatus }) => render(CONNECTION[status], status);
export const RunStatusBadge = ({ status }: { status: RunStatus }) => render(RUN[status], status);
export const JobStatusBadge = ({ status }: { status: JobStatus }) => render(JOB[status], status);
export const TransactionStatusBadge = ({ status }: { status: TransactionStatus }) => render(TRANSACTION[status], status);
