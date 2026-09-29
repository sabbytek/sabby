import { createWorker, QUEUES } from '../client.js';
import { db } from '../../db/client.js';
import { tenants } from '../../db/schema/public.js';
import { eq } from 'drizzle-orm';
import { sendSMS } from '../../sms/index.js';

export interface FailedWebhookJobData {
  tenantId: string;
  schemaName: string;
  eventId: string;
  eventType: string;
  rawPayload: string;
  error: string;
  failedAt: string;
}

export const paymentsWorker = createWorker<FailedWebhookJobData>(QUEUES.PAYMENTS, async (job) => {
  const { tenantId, eventType, eventId, error, failedAt } = job.data;
  void job.log(
    `[DLQ] Failed webhook event — tenant=${tenantId} type=${eventType} eventId=${eventId} error="${error}" failedAt=${failedAt}`,
  );

  // Send alert to tenant owner
  const [tenant] = await db
    .select({ businessPhone: tenants.businessPhone, name: tenants.name })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (tenant?.businessPhone) {
    const message = `[BPOS] Payment webhook failed: event "${eventType}" for tenant "${tenant.name}". Please check your dashboard.`;
    await sendSMS(tenant.businessPhone, message);
  }
});
