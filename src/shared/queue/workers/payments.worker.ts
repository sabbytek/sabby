import { createWorker, QUEUES } from '../client.js';
import { db } from '../../db/client.js';
import { tenants } from '../../db/schema/public.js';
import { eq } from 'drizzle-orm';
import { sendSMS } from '../../sms/index.js';
import { sendAutomatedReceipt } from '../../../modules/orders/receipt.service.js';

export interface FailedWebhookJobData {
  tenantId: string;
  schemaName: string;
  eventId: string;
  eventType: string;
  rawPayload: string;
  error: string;
  failedAt: string;
}

export interface ReceiptJobData {
  tenantId: string;
  schemaName: string;
  orderId: string;
  businessName: string;
}

type JobData = FailedWebhookJobData | ReceiptJobData;

export const paymentsWorker = createWorker<JobData>(
  QUEUES.PAYMENTS,
  async (job) => {
    if (job.name === 'send-receipt') {
      const { tenantId, schemaName, orderId, businessName } = job.data as ReceiptJobData;
      await job.log(`[payments.worker] sending automated receipt for order ${orderId}`);
      await sendAutomatedReceipt(tenantId, schemaName, orderId, businessName);
      return;
    }

    // DLQ: failed webhook alert
    const { tenantId, eventType, eventId, error, failedAt } = job.data as FailedWebhookJobData;
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
  },
);
