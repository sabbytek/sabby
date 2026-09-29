import { createWorker, QUEUES } from '../client.js';
import { lapseSubscription, startGracePeriod } from '../../../modules/subscriptions/service.js';

interface GraceExpireJobData {
  tenantId: string;
  schemaName: string;
}

interface BillingRetryJobData {
  tenantId: string;
  schemaName: string;
}

type SubscriptionJobData = GraceExpireJobData | BillingRetryJobData;

// 'grace-expire'  — fire when a grace period expires; moves status to lapsed
// 'billing-retry' — fire after a failed recurring charge; enters grace if retries exhausted
createWorker<SubscriptionJobData>(QUEUES.SUBSCRIPTIONS, async (job) => {
  const { tenantId, schemaName } = job.data;

  if (job.name === 'grace-expire') {
    await lapseSubscription(schemaName, tenantId);
  }

  if (job.name === 'billing-retry') {
    await startGracePeriod(schemaName, tenantId).catch(() => {
      /* non-fatal: secondary failure intentionally ignored */
    });
  }
});
