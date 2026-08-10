import type { Job } from 'bullmq';
import { createWorker, QUEUES } from '../client.js';
import { lapseSubscription, startGracePeriod } from '../../../modules/subscriptions/service.js';

interface SubscriptionJobData {
  tenantId: string;
  schemaName: string;
}

type SubscriptionJobName = 'grace-expire' | 'billing-retry';

// 'grace-expire'  — fire when a grace period expires; moves status to lapsed
// 'billing-retry' — fire after a failed recurring charge; enters grace if retries exhausted
createWorker<SubscriptionJobData>(QUEUES.SUBSCRIPTIONS, async (job: Job<SubscriptionJobData>) => {
  const { tenantId, schemaName } = job.data;
  const name = job.name as SubscriptionJobName;

  if (name === 'grace-expire') {
    await lapseSubscription(schemaName, tenantId);
  }

  if (name === 'billing-retry') {
    await startGracePeriod(schemaName, tenantId).catch((_err: unknown) => undefined);
  }
});
