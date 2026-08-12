/**
 * Invoicing controller — orchestrates HTTP concerns, delegates business logic to service.
 */

import type { RequestContext } from '../../shared/types/controller.js';
import { generateInvoice, getInvoice, listInvoices } from './service.js';

export interface InvoiceListQuery {
  orderId?: string;
}

export async function create(ctx: RequestContext, body: { orderId: string }): Promise<unknown> {
  const result = await generateInvoice(ctx.schema, ctx.tenantId, body.orderId);
  return result;
}

export async function list(ctx: RequestContext, query: InvoiceListQuery): Promise<unknown> {
  const result = await listInvoices(ctx.schema, query.orderId);
  return result;
}

export async function get(ctx: RequestContext, invoiceId: string): Promise<unknown> {
  const result = await getInvoice(ctx.schema, invoiceId);
  return result;
}
