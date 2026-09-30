import { sql, and, desc, eq } from 'drizzle-orm';
import { withTenantSchema } from '../../shared/db/tenant.js';
import {
  ledgerAccounts,
  journalEntries,
  journalLines,
  orders,
  orderItems,
  productVariants,
  products,
  users,
  inventory,
  locations,
} from '../../shared/db/schema/tenant.js';

// ─── P&L report ───────────────────────────────────────────────────────────────

export interface PLReport {
  from: string;
  to: string;
  revenueKobo: number;
  cogsKobo: number;
  grossProfitKobo: number;
  operatingExpensesKobo: number;
  paymentFeesKobo: number;
  refundsKobo: number;
  netProfitKobo: number;
}

export async function getPLReport(schemaName: string, from: string, to: string): Promise<PLReport> {
  return withTenantSchema(schemaName, async (db) => {
    // Get account IDs for all relevant accounts by code
    const accountRows = await db
      .select({ id: ledgerAccounts.id, code: ledgerAccounts.code })
      .from(ledgerAccounts)
      .where(sql`${ledgerAccounts.code} IN ('4000', '5000', '5100', '5200', '5300')`);

    const codeToId = new Map(accountRows.map((a) => [a.code, a.id]));

    async function sumAccount(code: string, lineType: 'debit' | 'credit'): Promise<number> {
      const accountId = codeToId.get(code);
      if (!accountId) return 0;

      const [row] = await db
        .select({ total: sql<string>`coalesce(sum(${journalLines.amountKobo}), 0)` })
        .from(journalLines)
        .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
        .where(
          and(
            eq(journalLines.accountId, accountId),
            eq(journalLines.type, lineType),
            sql`${journalEntries.postedAt} >= ${from}`,
            sql`${journalEntries.postedAt} <= ${to}`,
          ),
        );

      return parseInt(row?.total ?? '0');
    }

    const revenueKobo = await sumAccount('4000', 'credit');
    const cogsKobo = await sumAccount('5000', 'debit');
    const operatingExpensesKobo = await sumAccount('5200', 'debit');
    const paymentFeesKobo = await sumAccount('5100', 'debit');
    const refundsKobo = await sumAccount('5300', 'debit');

    const grossProfitKobo = revenueKobo - cogsKobo;
    const netProfitKobo = grossProfitKobo - operatingExpensesKobo - paymentFeesKobo - refundsKobo;

    return {
      from,
      to,
      revenueKobo,
      cogsKobo,
      grossProfitKobo,
      operatingExpensesKobo,
      paymentFeesKobo,
      refundsKobo,
      netProfitKobo,
    };
  });
}

// ─── Best-selling products ────────────────────────────────────────────────────

export interface BestSellerRow {
  productId: string;
  productName: string;
  variantId: string;
  variantName: string;
  sku: string;
  totalQuantity: number;
  totalRevenueKobo: number;
}

export async function getBestSellers(
  schemaName: string,
  query: { from?: string; to?: string; limit?: number },
): Promise<BestSellerRow[]> {
  const limit = Math.min(query.limit ?? 20, 100);

  return withTenantSchema(schemaName, async (db) => {
    const conditions = [sql`${orders.status} != 'cancelled'`];
    if (query.from) conditions.push(sql`${orders.createdAt} >= ${query.from}`);
    if (query.to) conditions.push(sql`${orders.createdAt} <= ${query.to}`);

    const rows = await db
      .select({
        productId: products.id,
        productName: products.name,
        variantId: productVariants.id,
        variantName: productVariants.name,
        sku: productVariants.sku,
        totalQuantity: sql<string>`sum(${orderItems.quantity})`,
        totalRevenueKobo: sql<string>`sum(${orderItems.lineTotalKobo})`,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .innerJoin(productVariants, eq(orderItems.variantId, productVariants.id))
      .innerJoin(products, eq(productVariants.productId, products.id))
      .where(and(...conditions))
      .groupBy(
        products.id,
        products.name,
        productVariants.id,
        productVariants.name,
        productVariants.sku,
      )
      .orderBy(desc(sql`sum(${orderItems.quantity})`))
      .limit(limit);

    return rows.map((r) => ({
      ...r,
      totalQuantity: parseInt(r.totalQuantity ?? '0'),
      totalRevenueKobo: parseInt(r.totalRevenueKobo ?? '0'),
    }));
  });
}

// ─── Revenue by location ──────────────────────────────────────────────────────

export interface RevenueByLocation {
  locationId: string | null;
  locationName: string | null;
  orderCount: number;
  totalRevenueKobo: number;
}

export async function getRevenueByLocation(
  schemaName: string,
  query: { from?: string; to?: string },
): Promise<RevenueByLocation[]> {
  return withTenantSchema(schemaName, async (db) => {
    const { locations } = await import('../../shared/db/schema/tenant.js');

    const conditions = [sql`${orders.status} NOT IN ('cancelled', 'draft')`];
    if (query.from) conditions.push(sql`${orders.createdAt} >= ${query.from}`);
    if (query.to) conditions.push(sql`${orders.createdAt} <= ${query.to}`);

    const rows = await db
      .select({
        locationId: orders.locationId,
        locationName: locations.name,
        orderCount: sql<string>`count(${orders.id})`,
        totalRevenueKobo: sql<string>`sum(${orders.totalKobo})`,
      })
      .from(orders)
      .leftJoin(locations, eq(orders.locationId, locations.id))
      .where(and(...conditions))
      .groupBy(orders.locationId, locations.name)
      .orderBy(desc(sql`sum(${orders.totalKobo})`));

    return rows.map((r) => ({
      locationId: r.locationId,
      locationName: r.locationName ?? null,
      orderCount: parseInt(r.orderCount ?? '0'),
      totalRevenueKobo: parseInt(r.totalRevenueKobo ?? '0'),
    }));
  });
}

// ─── Staff sales report ────────────────────────────────────────────────────────

export interface StaffSalesRow {
  staffId: string;
  firstName: string;
  lastName: string;
  orderCount: number;
  totalRevenueKobo: number;
}

export async function getStaffSalesReport(
  schemaName: string,
  query: { from?: string; to?: string },
): Promise<StaffSalesRow[]> {
  return withTenantSchema(schemaName, async (db) => {
    const conditions = [
      sql`${orders.assignedTo} IS NOT NULL`,
      sql`${orders.status} NOT IN ('cancelled', 'draft')`,
    ];
    if (query.from) conditions.push(sql`${orders.createdAt} >= ${query.from}`);
    if (query.to) conditions.push(sql`${orders.createdAt} <= ${query.to}`);

    const rows = await db
      .select({
        staffId: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        orderCount: sql<string>`count(${orders.id})`,
        totalRevenueKobo: sql<string>`sum(${orders.totalKobo})`,
      })
      .from(orders)
      .innerJoin(users, eq(orders.assignedTo, users.id))
      .where(and(...conditions))
      .groupBy(users.id, users.firstName, users.lastName)
      .orderBy(desc(sql`sum(${orders.totalKobo})`));

    return rows.map((r) => ({
      staffId: r.staffId,
      firstName: r.firstName,
      lastName: r.lastName,
      orderCount: parseInt(r.orderCount ?? '0'),
      totalRevenueKobo: parseInt(r.totalRevenueKobo ?? '0'),
    }));
  });
}

// ─── Inventory valuation ──────────────────────────────────────────────────────

export interface InventoryValuationRow {
  variantId: string;
  sku: string;
  productName: string;
  variantName: string;
  locationId: string;
  locationName: string | null;
  quantityOnHand: number;
  unitCostKobo: number;
  totalValueKobo: number;
}

export async function getInventoryValuation(schemaName: string): Promise<InventoryValuationRow[]> {
  return withTenantSchema(schemaName, async (db) => {
    const rows = await db
      .select({
        variantId: productVariants.id,
        sku: productVariants.sku,
        productName: products.name,
        variantName: productVariants.name,
        locationId: inventory.locationId,
        locationName: locations.name,
        quantityOnHand: inventory.quantityOnHand,
        unitCostKobo: productVariants.costKobo,
      })
      .from(inventory)
      .innerJoin(productVariants, eq(inventory.variantId, productVariants.id))
      .innerJoin(products, eq(productVariants.productId, products.id))
      .leftJoin(locations, eq(inventory.locationId, locations.id))
      .orderBy(products.name, productVariants.name, locations.name);

    return rows.map((r) => ({
      ...r,
      locationName: r.locationName ?? null,
      totalValueKobo: r.quantityOnHand * r.unitCostKobo,
    }));
  });
}
