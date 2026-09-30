import type { RequestContext } from '../../shared/types/controller.js';
import { ValidationError } from '../../shared/errors/types.js';
import { toCsv } from '../../shared/utils/csv.js';
import * as service from './service.js';

export async function getPL(ctx: RequestContext, from: string, to: string) {
  if (new Date(from) > new Date(to)) {
    throw new ValidationError("'from' must be before 'to'");
  }
  return service.getPLReport(ctx.schema, from, to);
}

export async function getBestSellers(
  ctx: RequestContext,
  query: { from?: string; to?: string; limit?: string },
) {
  return service.getBestSellers(ctx.schema, {
    ...(query.from && { from: query.from }),
    ...(query.to && { to: query.to }),
    ...(query.limit && { limit: parseInt(query.limit) }),
  });
}

export async function getRevenueByLocation(
  ctx: RequestContext,
  query: { from?: string; to?: string },
) {
  return service.getRevenueByLocation(ctx.schema, {
    ...(query.from && { from: query.from }),
    ...(query.to && { to: query.to }),
  });
}

export async function getStaffSales(ctx: RequestContext, query: { from?: string; to?: string }) {
  return service.getStaffSalesReport(ctx.schema, {
    ...(query.from && { from: query.from }),
    ...(query.to && { to: query.to }),
  });
}

export async function exportPL(ctx: RequestContext, from: string, to: string) {
  if (new Date(from) > new Date(to)) {
    throw new ValidationError("'from' must be before 'to'");
  }

  const r = await service.getPLReport(ctx.schema, from, to);
  const naira = (k: number) => (k / 100).toFixed(2);

  return toCsv([
    ['Profit & Loss Report'],
    [`Period: ${from} to ${to}`],
    [],
    ['Category', 'Amount (NGN)'],
    ['Revenue', naira(r.revenueKobo)],
    ['Cost of Goods Sold', naira(r.cogsKobo)],
    ['Gross Profit', naira(r.grossProfitKobo)],
    ['Operating Expenses', naira(r.operatingExpensesKobo)],
    ['Payment Fees', naira(r.paymentFeesKobo)],
    ['Refunds', naira(r.refundsKobo)],
    ['Net Profit', naira(r.netProfitKobo)],
  ]);
}

export async function exportStaffSales(ctx: RequestContext, query: { from?: string; to?: string }) {
  const rows = await service.getStaffSalesReport(ctx.schema, {
    ...(query.from && { from: query.from }),
    ...(query.to && { to: query.to }),
  });

  const naira = (k: number) => (k / 100).toFixed(2);
  return toCsv([
    ['Staff Name', 'Order Count', 'Revenue (NGN)'],
    ...rows.map((r) => [
      `${r.firstName} ${r.lastName}`,
      String(r.orderCount),
      naira(r.totalRevenueKobo),
    ]),
  ]);
}

export async function getInventoryValuation(ctx: RequestContext) {
  return service.getInventoryValuation(ctx.schema);
}

export async function exportInventoryValuation(ctx: RequestContext) {
  const rows = await service.getInventoryValuation(ctx.schema);

  const naira = (k: number) => (k / 100).toFixed(2);
  const totalValue = rows.reduce((s, r) => s + r.totalValueKobo, 0);

  return toCsv([
    ['SKU', 'Product', 'Variant', 'Location', 'Quantity', 'Unit Cost (NGN)', 'Total Value (NGN)'],
    ...rows.map((r) => [
      r.sku,
      r.productName,
      r.variantName,
      r.locationName ?? 'Unassigned',
      String(r.quantityOnHand),
      naira(r.unitCostKobo),
      naira(r.totalValueKobo),
    ]),
    [],
    ['', '', '', 'TOTAL', '', '', naira(totalValue)],
  ]);
}
