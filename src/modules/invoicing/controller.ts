/**
 * Invoicing controller — orchestrates HTTP concerns, delegates business logic to service.
 */

import type { RequestContext } from '../../shared/types/controller.js';
import { generateInvoice, getInvoice, listInvoices } from './service.js';

export interface InvoiceListQuery {
  orderId?: string;
}

export async function create(ctx: RequestContext, body: { orderId: string }) {
  return generateInvoice(ctx.schema, ctx.tenantId, body.orderId);
}

export async function list(ctx: RequestContext, query: InvoiceListQuery) {
  return listInvoices(ctx.schema, query.orderId);
}

export async function get(ctx: RequestContext, invoiceId: string) {
  return getInvoice(ctx.schema, invoiceId);
}
