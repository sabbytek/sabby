import { createWorker, QUEUES } from '../client.js';
import { db } from '../../db/client.js';
import { tenants } from '../../db/schema/public.js';
import { eq } from 'drizzle-orm';
import { withTenantSchema } from '../../db/tenant.js';
import { orders, customers } from '../../db/schema/tenant.js';
import { sendSMS } from '../../sms/index.js';

interface DispatchedJobData {
  tenantId: string;
  schemaName: string;
  orderId: string;
  trackingNumber: string;
  providerName: string;
}

interface DeliveredJobData {
  tenantId: string;
  schemaName: string;
  orderId: string;
  eventType: string;
  trackingNumber: string;
}

interface FailedJobData {
  tenantId: string;
  schemaName: string;
  orderId: string;
  eventType: string;
  trackingNumber: string;
}

type LogisticsJobData = DispatchedJobData | DeliveredJobData | FailedJobData;

async function getCustomerPhone(schemaName: string, orderId: string): Promise<string | null> {
  return withTenantSchema(schemaName, async (tenantDb) => {
    const [order] = await tenantDb
      .select({ customerId: orders.customerId })
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);

    if (!order?.customerId) return null;

    const [customer] = await tenantDb
      .select({ phone: customers.phone })
      .from(customers)
      .where(eq(customers.id, order.customerId))
      .limit(1);

    return customer?.phone ?? null;
  });
}

async function getTenantPhone(tenantId: string): Promise<string | null> {
  const [tenant] = await db
    .select({ businessPhone: tenants.businessPhone })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  return tenant?.businessPhone ?? null;
}

export const logisticsWorker = createWorker<LogisticsJobData>(
  QUEUES.LOGISTICS,
  async (job) => {
    const { name, data } = job;

    switch (name) {
      case 'notify-customer-dispatched': {
        const d = data as DispatchedJobData;
        void job.log(
          JSON.stringify({
            event: 'customer_dispatch_notification',
            tenantId: d.tenantId,
            orderId: d.orderId,
            trackingNumber: d.trackingNumber,
            provider: d.providerName,
          }),
        );

        const phone = await getCustomerPhone(d.schemaName, d.orderId);
        if (phone) {
          const message = `[BPOS] Your order has been dispatched via ${d.providerName}. Tracking: ${d.trackingNumber}`;
          await sendSMS(phone, message);
        }
        break;
      }

      case 'notify-customer-delivered': {
        const d = data as DeliveredJobData;
        void job.log(
          JSON.stringify({
            event: 'customer_delivery_notification',
            tenantId: d.tenantId,
            orderId: d.orderId,
            trackingNumber: d.trackingNumber,
          }),
        );

        const phone = await getCustomerPhone(d.schemaName, d.orderId);
        if (phone) {
          const message = `[BPOS] Your order has been delivered. Tracking: ${d.trackingNumber}`;
          await sendSMS(phone, message);
        }
        break;
      }

      case 'notify-merchant-failed': {
        const d = data as FailedJobData;
        void job.log(
          JSON.stringify({
            event: 'merchant_dispatch_failure_alert',
            tenantId: d.tenantId,
            orderId: d.orderId,
            trackingNumber: d.trackingNumber,
            eventType: d.eventType,
          }),
        );

        const phone = await getTenantPhone(d.tenantId);
        if (phone) {
          const message = `[BPOS] Dispatch alert: order ${d.orderId} event "${d.eventType}" failed. Tracking: ${d.trackingNumber}. Please check your dashboard.`;
          await sendSMS(phone, message);
        }
        break;
      }

      default:
        void job.log(`Unknown logistics job: ${name}`);
    }
  },
);
