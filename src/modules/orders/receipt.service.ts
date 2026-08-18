import { eq } from 'drizzle-orm';
import { db } from '../../shared/db/client.js';
import { tenants } from '../../shared/db/schema/public.js';
import { orders, orderItems, productVariants, customers } from '../../shared/db/schema/tenant.js';
import { withTenantSchema } from '../../shared/db/tenant.js';
import { renderReceiptPdf } from '../../shared/pdf/receipt.js';
import { uploadToR2 } from '../../shared/storage/r2.js';
import { sendReceiptEmail } from '../../shared/email/resend.js';
import { sendReceiptWhatsApp } from '../whatsapp/sender.js';
import { NotFoundError } from '../../shared/errors/types.js';
import { env } from '../../config/env.js';

export interface ReceiptResult {
  pdfUrl: string;
  orderNumber: string;
  totalKobo: number;
  customerEmail: string | null;
  customerPhone: string | null;
}

/**
 * Builds and uploads a receipt PDF for an order.
 * Returns the R2 URL and customer contact info so the caller can decide
 * how to deliver it (email, WhatsApp, print, or all three).
 */
export async function buildReceipt(
  tenantId: string,
  schemaName: string,
  orderId: string,
): Promise<ReceiptResult> {
  // ── 1. Tenant info ──────────────────────────────────────────────────────────
  const [tenant] = await db
    .select({ name: tenants.name, phone: tenants.businessPhone })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!tenant) throw new NotFoundError('Tenant', tenantId);

  // ── 2. Order + items + customer ─────────────────────────────────────────────
  const data = await withTenantSchema(schemaName, async (tdb) => {
    const [order] = await tdb
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);
    if (!order) throw new NotFoundError('Order', orderId);

    const items = await tdb
      .select({
        variantName: productVariants.name,
        sku: productVariants.sku,
        quantity: orderItems.quantity,
        unitPriceKobo: orderItems.unitPriceKobo,
        lineTotalKobo: orderItems.lineTotalKobo,
      })
      .from(orderItems)
      .innerJoin(productVariants, eq(orderItems.variantId, productVariants.id))
      .where(eq(orderItems.orderId, orderId));

    let customer: {
      firstName: string;
      lastName: string | null;
      email: string | null;
      phone: string | null;
    } | null = null;

    if (order.customerId) {
      const [c] = await tdb
        .select({
          firstName: customers.firstName,
          lastName: customers.lastName,
          email: customers.email,
          phone: customers.phone,
        })
        .from(customers)
        .where(eq(customers.id, order.customerId))
        .limit(1);
      customer = c ?? null;
    }

    return { order, items, customer };
  });

  const { order, items, customer } = data;
  const customerName = customer
    ? [customer.firstName, customer.lastName].filter(Boolean).join(' ')
    : null;

  // ── 3. Render PDF ───────────────────────────────────────────────────────────
  const pdfBuffer = await renderReceiptPdf({
    orderNumber: order.orderNumber,
    issuedAt: order.createdAt,
    businessName: tenant.name,
    businessPhone: tenant.phone,
    customerName,
    customerPhone: customer?.phone ?? null,
    items,
    subtotalKobo: order.subtotalKobo,
    discountKobo: order.discountKobo,
    taxKobo: order.taxKobo,
    deliveryFeeKobo: order.deliveryFeeKobo,
    totalKobo: order.totalKobo,
    paymentStatus: order.paymentStatus,
    channel: order.channel,
  });

  // ── 4. Upload to R2 ─────────────────────────────────────────────────────────
  const r2Key = `receipts/${tenantId}/${orderId}.pdf`;
  const pdfUrl = await uploadToR2({ key: r2Key, body: pdfBuffer, contentType: 'application/pdf' });

  return {
    pdfUrl,
    orderNumber: order.orderNumber,
    totalKobo: order.totalKobo,
    customerEmail: customer?.email ?? null,
    customerPhone: customer?.phone ?? null,
  };
}

/**
 * Automated receipt: generates PDF and emails it to the customer.
 * Called by the payments worker after charge.success.
 * Silently skips delivery if customer has no email.
 */
export async function sendAutomatedReceipt(
  tenantId: string,
  schemaName: string,
  orderId: string,
  businessName: string,
): Promise<void> {
  const receipt = await buildReceipt(tenantId, schemaName, orderId);

  if (receipt.customerEmail) {
    await sendReceiptEmail({
      to: receipt.customerEmail,
      businessName,
      orderNumber: receipt.orderNumber,
      totalNaira: `NGN ${(receipt.totalKobo / 100).toFixed(2)}`,
      pdfUrl: receipt.pdfUrl,
    });
  }
}

/**
 * POS manual receipt: generates PDF and delivers via the requested channel(s).
 * `channels` defaults to ['print'] which just returns the pdfUrl for the client to open.
 */
export async function sendPosReceipt(
  tenantId: string,
  schemaName: string,
  orderId: string,
  businessName: string,
  channels: Array<'print' | 'whatsapp' | 'email'>,
): Promise<{ pdfUrl: string }> {
  const receipt = await buildReceipt(tenantId, schemaName, orderId);

  const whatsappPhoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID;

  await Promise.allSettled([
    channels.includes('email') && receipt.customerEmail
      ? sendReceiptEmail({
          to: receipt.customerEmail,
          businessName,
          orderNumber: receipt.orderNumber,
          totalNaira: `NGN ${(receipt.totalKobo / 100).toFixed(2)}`,
          pdfUrl: receipt.pdfUrl,
        })
      : Promise.resolve(),

    channels.includes('whatsapp') && receipt.customerPhone && whatsappPhoneNumberId
      ? sendReceiptWhatsApp(
          whatsappPhoneNumberId,
          receipt.customerPhone,
          businessName,
          receipt.orderNumber,
          receipt.totalKobo,
          receipt.pdfUrl,
        )
      : Promise.resolve(),
  ]);

  return { pdfUrl: receipt.pdfUrl };
}
