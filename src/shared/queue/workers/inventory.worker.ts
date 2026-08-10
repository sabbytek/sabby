import { createWorker, QUEUES } from '../client.js';
import { db } from '../../db/client.js';
import { tenants } from '../../db/schema/public.js';
import { eq } from 'drizzle-orm';
import { sendSMS } from '../../sms/index.js';

export interface LowStockJobData {
  tenantId: string;
  schemaName: string;
  variantId: string;
  variantName: string;
  sku: string;
  quantityOnHand: number;
  threshold: number;
  locationId: string;
}

export const inventoryWorker = createWorker<LowStockJobData>(
  QUEUES.NOTIFICATIONS,
  async (job) => {
    const { tenantId, variantName, sku, quantityOnHand, threshold, locationId } = job.data;

    job.log(
      `Low stock alert: tenant=${tenantId} sku=${sku} name="${variantName}" ` +
        `qty=${quantityOnHand} threshold=${threshold} location=${locationId}`,
    );

    // Send SMS to tenant owner
    const [tenant] = await db
      .select({ businessPhone: tenants.businessPhone, name: tenants.name })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    if (tenant?.businessPhone) {
      const message = `[BPOS] Low stock alert: "${variantName}" (SKU: ${sku}) has ${quantityOnHand} units remaining (threshold: ${threshold}).`;
      await sendSMS(tenant.businessPhone, message);
    }
  },
);
