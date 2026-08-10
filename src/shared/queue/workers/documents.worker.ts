import { eq } from 'drizzle-orm';
import { createWorker, QUEUES } from '../client.js';
import type { GenerateInvoiceJobData } from '../../../modules/invoicing/service.js';
import { updateInvoicePdf } from '../../../modules/invoicing/service.js';
import { withTenantSchema } from '../../db/tenant.js';
import { db } from '../../db/client.js';
import { tenants } from '../../db/schema/public.js';
import { orders, orderItems, productVariants, customers, invoices } from '../../db/schema/tenant.js';
import { renderInvoicePdf } from '../../pdf/invoice.js';
import { uploadToR2 } from '../../storage/r2.js';
import { sendInvoiceEmail } from '../../email/resend.js';

createWorker<GenerateInvoiceJobData>(QUEUES.DOCUMENTS, async (job) => {
  if (job.name !== 'generate-invoice-pdf') return;

  const { tenantId, schemaName, invoiceId, orderId } = job.data;

  await job.log(`[documents.worker] generating PDF for invoice ${invoiceId}`);

  // ── 1. Fetch tenant info (business name + email) from public schema ──────────
  const [tenant] = await db
    .select({ name: tenants.name, email: tenants.businessEmail, phone: tenants.businessPhone })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!tenant) throw new Error(`Tenant ${tenantId} not found`);

  // ── 2. Fetch order + line items + customer from tenant schema ─────────────────
  const invoiceData = await withTenantSchema(schemaName, async (tdb) => {
    const [invoice] = await tdb
      .select()
      .from(invoices)
      .where(eq(invoices.id, invoiceId))
      .limit(1);

    if (!invoice) throw new Error(`Invoice ${invoiceId} not found`);

    const [order] = await tdb
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);

    if (!order) throw new Error(`Order ${orderId} not found`);

    const items = await tdb
      .select({
        variantName: productVariants.name,
        sku: productVariants.sku,
        quantity: orderItems.quantity,
        unitPriceKobo: orderItems.unitPriceKobo,
        discountKobo: orderItems.discountKobo,
        taxKobo: orderItems.taxKobo,
        lineTotalKobo: orderItems.lineTotalKobo,
      })
      .from(orderItems)
      .innerJoin(productVariants, eq(orderItems.variantId, productVariants.id))
      .where(eq(orderItems.orderId, orderId));

    let customer: { firstName: string; lastName: string | null; email: string | null; phone: string | null; address: string | null } | null = null;
    if (order.customerId) {
      const [c] = await tdb
        .select({
          firstName: customers.firstName,
          lastName: customers.lastName,
          email: customers.email,
          phone: customers.phone,
          address: customers.address,
        })
        .from(customers)
        .where(eq(customers.id, order.customerId))
        .limit(1);
      customer = c ?? null;
    }

    return { invoice, order, items, customer };
  });

  const { invoice, order, items, customer } = invoiceData;

  const customerName = customer
    ? [customer.firstName, customer.lastName].filter(Boolean).join(' ')
    : 'Guest';

  // ── 3. Render PDF ─────────────────────────────────────────────────────────────
  const pdfBuffer = await renderInvoicePdf({
    invoiceNumber: invoice.invoiceNumber,
    issuedAt: invoice.issuedAt,
    dueAt: invoice.dueAt,
    businessName: tenant.name,
    businessEmail: tenant.email,
    businessPhone: tenant.phone,
    customerName,
    customerEmail: customer?.email ?? null,
    customerPhone: customer?.phone ?? null,
    customerAddress: customer?.address ?? null,
    items,
    subtotalKobo: order.subtotalKobo,
    discountKobo: order.discountKobo,
    taxKobo: order.taxKobo,
    deliveryFeeKobo: order.deliveryFeeKobo,
    totalKobo: order.totalKobo,
    paymentStatus: order.paymentStatus,
    orderChannel: order.channel,
  });

  // ── 4. Upload to R2 ───────────────────────────────────────────────────────────
  const r2Key = `invoices/${tenantId}/${invoiceId}.pdf`;
  const pdfUrl = await uploadToR2({ key: r2Key, body: pdfBuffer, contentType: 'application/pdf' });

  // ── 5. Update invoice record ──────────────────────────────────────────────────
  await updateInvoicePdf(schemaName, invoiceId, pdfUrl);
  await job.log(`[documents.worker] PDF uploaded to ${pdfUrl}`);

  // ── 6. Email customer (if they have an email on file) ─────────────────────────
  if (customer?.email) {
    await sendInvoiceEmail({
      to: customer.email,
      businessName: tenant.name,
      invoiceNumber: invoice.invoiceNumber,
      totalNaira: `NGN ${(order.totalKobo / 100).toFixed(2)}`,
      pdfBuffer,
    });
    await job.log(`[documents.worker] invoice emailed to ${customer.email}`);
  }
});
