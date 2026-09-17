import 'server-only';
/** Job type -> handler. Anything not listed here fails the job explicitly. */
import { handleGenerateContent, handleGenerateIdeas } from './content';
import { handlePublishContent, handlePublishScheduled } from './publishing';
import { handleGenerateReport, handleSyncAnalytics } from './analytics';
import { handleAutoCampaign, handleOptimizeCampaigns, handlePublishCampaign } from './ads';
import { handleProcessBillingEvent, handleSyncBilling } from './billing';
import { handleFanoutNotification } from './notifications';
import type { JobContext } from './context';

export type JobHandler = (ctx: JobContext) => Promise<Record<string, unknown>>;

export const HANDLERS: Record<string, JobHandler> = {
  // Scheduled task executions.
  'task:GENERATE_POSTS': handleGenerateContent,
  'task:GENERATE_REELS': handleGenerateContent,
  'task:GENERATE_STORIES': handleGenerateContent,
  'task:GENERATE_FLYERS': handleGenerateContent,
  'task:GENERATE_IDEAS': handleGenerateIdeas,
  'task:PUBLISH_SCHEDULED': handlePublishScheduled,
  'task:SYNC_ANALYTICS': handleSyncAnalytics,
  'task:WEEKLY_REPORT': handleGenerateReport,
  'task:OPTIMIZE_CAMPAIGNS': handleOptimizeCampaigns,
  'task:AUTO_CAMPAIGN': handleAutoCampaign,

  // Direct jobs enqueued by the interface or by webhooks.
  'content:publish': handlePublishContent,
  'campaign:publish': handlePublishCampaign,
  'billing:process_event': handleProcessBillingEvent,
  'billing:sync': handleSyncBilling,
  'notifications:fanout': handleFanoutNotification,
  'analytics:sync': handleSyncAnalytics,
};

export function handlerFor(type: string): JobHandler | undefined {
  return HANDLERS[type];
}
