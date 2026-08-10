import { v4 as uuidv4 } from 'uuid';
import { eq, and } from 'drizzle-orm';
import { withTenantSchema } from '../../shared/db/tenant.js';
import {
  payments,
  orders,
} from '../../shared/db/schema/tenant.js';
import { NotFoundError, ValidationError } from '../../shared/errors/types.js';
import { getGateway } from '../../shared/payments/index.js';
import { postJournalEntry } from '../ledger/service.js';
import {
  orderPaidTemplate,
  paymentFeeTemplate,
  orderRefundedTemplate,
} from '../ledger/templates.js';
import { env } from '../../config/env.js';

// ─── Initiate payment ─────────────────────────────────────────────────────────

export async function initiatePayment(
  schemaName: string,
  orderId: string,
  userId: string,
  customerEmail: string,
) {
  const order = await withTenantSchema(schemaName, async (db) => {
    const [o] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);
    if (!o) throw new NotFoundError('Order', orderId);
    if (o.paymentStatus === 'paid') {
      throw new ValidationError('Order has already been paid');
    }
    return o;
  });

  const reference = `bpos-${uuidv4()}`;
  const callbackUrl = `${env.PLATFORM_BASE_URL}/v1/payments/verify/${reference}`;

  const result = await getGateway().initiatePayment({
    email: customerEmail,
    amountKobo: order.totalKobo,
    reference,
    callbackUrl,
    metadata: { orderId, schemaName },
  });

  await withTenantSchema(schemaName, async (db) => {
    await db.insert(payments).values({
      id: uuidv4(),
      orderId,
      gateway: getGateway().name as 'paystack' | 'flutterwave' | 'manual',
      gatewayReference: reference,
      amountKobo: order.totalKobo,
      status: 'initiated',
    });

    await db.update(orders)
      .set({ paymentStatus: 'initiated', updatedAt: new Date() })
      .where(eq(orders.id, orderId));
  });

  return { authorizationUrl: result.authorizationUrl, reference };
}

// ─── Handle Paystack webhook event ───────────────────────────────────────────

export type PaystackEventType =
  | 'charge.success'
  | 'charge.failed'
  | 'refund.processed'
  | string;

export interface PaystackWebhookData {
  id: string | number;     // Paystack event ID
  reference?: string;
  amount?: number;
  fees?: number;
  status?: string;
  customer?: { email?: string };
  metadata?: { orderId?: string; schemaName?: string };
}

export async function handlePaystackWebhook(
  schemaName: string,
  eventType: PaystackEventType,
  data: PaystackWebhookData,
) {
  const gatewayEventId = String(data.id);
  const reference = data.reference ?? '';

  // Check idempotency: if this event was already processed, silently skip
  const alreadyProcessed = await withTenantSchema(schemaName, async (db) => {
    const [existing] = await db
      .select({ id: payments.id })
      .from(payments)
      .where(eq(payments.gatewayEventId, gatewayEventId))
      .limit(1);
    return !!existing;
  });

  if (alreadyProcessed) return { processed: false, reason: 'duplicate' };

  if (eventType === 'charge.success') {
    const amountKobo = data.amount ?? 0;
    const feeKobo = data.fees ?? 0;

    await withTenantSchema(schemaName, async (db) => {
      const [payment] = await db
        .select()
        .from(payments)
        .where(eq(payments.gatewayReference, reference))
        .limit(1);

      if (!payment) return; // Orphan event — skip

      // Mark payment as paid
      await db.update(payments)
        .set({
          status: 'paid',
          gatewayEventId,
          feeKobo,
          paidAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(payments.id, payment.id));

      // Update order payment status
      await db.update(orders)
        .set({ paymentStatus: 'paid', updatedAt: new Date() })
        .where(eq(orders.id, payment.orderId));

      // Post journal entries (non-blocking on failure — payment is already recorded)
      await postJournalEntry(schemaName, orderPaidTemplate(payment.id, payment.orderId, amountKobo))
        .catch(() => {}); // Journal failure must never roll back the payment

      if (feeKobo > 0) {
        await postJournalEntry(schemaName, paymentFeeTemplate(payment.id, feeKobo))
          .catch(() => {});
      }
    });
  }

  if (eventType === 'charge.failed') {
    await withTenantSchema(schemaName, async (db) => {
      await db.update(payments)
        .set({ status: 'failed', gatewayEventId, updatedAt: new Date() })
        .where(and(eq(payments.gatewayReference, reference), eq(payments.status, 'initiated')));
    });
  }

  if (eventType === 'refund.processed') {
    const amountKobo = data.amount ?? 0;

    await withTenantSchema(schemaName, async (db) => {
      const [payment] = await db
        .select()
        .from(payments)
        .where(eq(payments.gatewayReference, reference))
        .limit(1);

      if (!payment) return;

      await db.update(payments)
        .set({ status: 'refunded', gatewayEventId, updatedAt: new Date() })
        .where(eq(payments.id, payment.id));

      await db.update(orders)
        .set({ paymentStatus: 'refunded', updatedAt: new Date() })
        .where(eq(orders.id, payment.orderId));

      await postJournalEntry(schemaName, orderRefundedTemplate(payment.id, amountKobo))
        .catch(() => {});
    });
  }

  return { processed: true };
}
