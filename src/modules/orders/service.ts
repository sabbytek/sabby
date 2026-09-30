import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { withTenantSchema, type TenantDb } from '../../shared/db/tenant.js';
import {
  orders,
  orderItems,
  inventory,
  stockMovements,
  productVariants,
  shippingMethods,
} from '../../shared/db/schema/tenant.js';
import type { Order } from '../../shared/db/schema/tenant.js';
import { NotFoundError, ValidationError } from '../../shared/errors/types.js';
import type { PaginatedResult } from '../../shared/types/index.js';
import { assertTransition } from './state-machine.js';
import { checkAndEnqueueLowStockAlerts } from '../inventory/service.js';
import { notificationsQueue } from '../../shared/queue/client.js';
export { calculateOrderTotals } from './calculations.js';
export type { LineInput, OrderTotals } from './calculations.js';
import { calculateOrderTotals } from './calculations.js';

// ─── Order Number Generation ─────────────────────────────────────────────────

/**
 * Generates the next order number atomically using a PostgreSQL sequence.
 * Self-healing: creates and seeds the sequence on first use for tenant schemas
 * that were provisioned before the sequence was added.
 *
 * The DO block uses entirely static SQL (no user input interpolated), so sql.raw() is safe.
 */
async function getNextOrderNumber(db: TenantDb): Promise<string> {
  await db.execute(
    sql.raw(`
    DO $$ BEGIN
      CREATE SEQUENCE order_number_seq;
      PERFORM setval('order_number_seq',
        COALESCE((SELECT MAX(CAST(SPLIT_PART(order_number, '-', 2) AS INTEGER)) FROM orders), 0)
      );
    EXCEPTION WHEN duplicate_table THEN
      NULL;
    END $$
  `),
  );

  const result = await db.execute(sql`SELECT nextval('order_number_seq') AS num`);
  const rows = result.rows;
  const nextNum = Number(rows[0]?.['num'] ?? 1);
  return `ORD-${String(nextNum).padStart(6, '0')}`;
}

// ─── Create ──────────────────────────────────────────────────────────────────

export interface CreateOrderInput {
  customerId?: string;
  locationId?: string;
  assignedTo?: string;
  channel?: string;
  items: {
    variantId: string;
    quantity: number;
    unitPriceKobo: number;
    discountKobo?: number;
    taxKobo?: number;
  }[];
  discountKobo?: number;
  taxKobo?: number;
  note?: string;
  // Shipping
  shippingMethodId?: string;
  pickupLocationId?: string;
  deliveryAddress?: string;
  destinationState?: string;
  deliveryFeeKobo?: number;
  // Auto-populated from shippingMethods.merchantCostKobo when a free method is used.
  // Caller may also override explicitly (e.g. from a live provider quote at dispatch).
  merchantShippingCostKobo?: number;
}

export async function createOrder(schemaName: string, _userId: string, input: CreateOrderInput) {
  if (input.items.length === 0) {
    throw new ValidationError('Order must have at least one item');
  }

  return withTenantSchema(schemaName, async (db) => {
    // Atomic order number via PostgreSQL sequence — no race under concurrency
    const orderNumber = await getNextOrderNumber(db);

    // Auto-compute taxKobo from variant's taxRateBps when not explicitly provided.
    // taxRateBps is stored as basis points (10000 = 100%), so 7.5% VAT = 750.
    const variantIds = input.items.map((i) => i.variantId);
    const variantRows = await db
      .select({ id: productVariants.id, taxRateBps: productVariants.taxRateBps })
      .from(productVariants)
      .where(inArray(productVariants.id, variantIds));
    const taxRateMap = new Map(variantRows.map((v) => [v.id, v.taxRateBps ?? 0]));

    const itemsWithTax = input.items.map((item) => ({
      ...item,
      taxKobo:
        item.taxKobo ??
        Math.floor(
          (item.quantity * item.unitPriceKobo * (taxRateMap.get(item.variantId) ?? 0)) / 10000,
        ),
    }));

    const { subtotalKobo, totalKobo, lineTotalsKobo } = calculateOrderTotals(
      itemsWithTax,
      input.discountKobo,
      input.taxKobo,
      input.deliveryFeeKobo,
    );

    // When a free shipping method is used, the customer pays ₦0 but the merchant
    // still owes the courier. Resolve that cost from the method record if not overridden.
    let merchantShippingCostKobo = input.merchantShippingCostKobo ?? 0;
    if (!merchantShippingCostKobo && input.shippingMethodId) {
      const [method] = await db
        .select({ type: shippingMethods.type, merchantCostKobo: shippingMethods.merchantCostKobo })
        .from(shippingMethods)
        .where(eq(shippingMethods.id, input.shippingMethodId))
        .limit(1);
      if (method?.type === 'free' && method.merchantCostKobo) {
        merchantShippingCostKobo = method.merchantCostKobo;
      }
    }

    const orderId = uuidv4();

    await db.insert(orders).values({
      id: orderId,
      orderNumber,
      customerId: input.customerId ?? null,
      locationId: input.locationId ?? null,
      assignedTo: input.assignedTo ?? null,
      channel: input.channel ?? 'manual',
      subtotalKobo,
      discountKobo: input.discountKobo ?? 0,
      taxKobo: input.taxKobo ?? 0,
      totalKobo,
      note: input.note ?? null,
      shippingMethodId: input.shippingMethodId ?? null,
      pickupLocationId: input.pickupLocationId ?? null,
      deliveryAddress: input.deliveryAddress ?? null,
      destinationState: input.destinationState ?? null,
      deliveryFeeKobo: input.deliveryFeeKobo ?? 0,
      merchantShippingCostKobo,
    });

    await db.insert(orderItems).values(
      itemsWithTax.map((item, i) => ({
        id: uuidv4(),
        orderId,
        variantId: item.variantId,
        quantity: item.quantity,
        unitPriceKobo: item.unitPriceKobo,
        discountKobo: item.discountKobo ?? 0,
        taxKobo: item.taxKobo,
        lineTotalKobo: lineTotalsKobo[i] ?? 0,
      })),
    );

    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));

    return { ...order!, items };
  });
}

// ─── List ────────────────────────────────────────────────────────────────────

export async function listOrders(
  schemaName: string,
  query: {
    page?: number;
    limit?: number;
    status?: string;
    channel?: string;
    from?: string;
    to?: string;
  },
): Promise<PaginatedResult<Order>> {
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(query.limit ?? 20, 100);
  const offset = (page - 1) * limit;

  return withTenantSchema(schemaName, async (db) => {
    const conditions = [];
    if (query.status) conditions.push(sql`${orders.status} = ${query.status}`);
    if (query.channel) conditions.push(eq(orders.channel, query.channel));
    if (query.from) conditions.push(sql`${orders.createdAt} >= ${query.from}`);
    if (query.to) conditions.push(sql`${orders.createdAt} <= ${query.to}`);

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [countRow] = await db
      .select({ count: sql<string>`count(*)` })
      .from(orders)
      .where(where);

    const items = await db
      .select()
      .from(orders)
      .where(where)
      .orderBy(desc(orders.createdAt))
      .limit(limit)
      .offset(offset);

    const total = parseInt(countRow?.count ?? '0');
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  });
}

// ─── Get single ──────────────────────────────────────────────────────────────

export async function getOrder(schemaName: string, orderId: string) {
  return withTenantSchema(schemaName, async (db) => {
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order) throw new NotFoundError('Order', orderId);

    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));

    return { ...order, items };
  });
}

// ─── State transitions ───────────────────────────────────────────────────────

export async function confirmOrder(
  schemaName: string,
  tenantId: string,
  orderId: string,
  userId: string,
) {
  // All validation, stock deduction, and status update happen in a single session
  // to prevent the race where stock is validated in one session and deducted in another.
  // NOTE: The Neon HTTP driver is stateless per-query, so this is not a true DB
  // transaction. For full ACID guarantees, migrate to the Neon WebSocket driver
  // with drizzle's db.transaction(). The single-session approach still eliminates
  // the inter-session race that existed with separate withTenantSchema calls.
  const { updatedOrder, variantIds, locationId } = await withTenantSchema(
    schemaName,
    async (db) => {
      // 1. Load and validate order
      const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
      if (!order) throw new NotFoundError('Order', orderId);

      assertTransition(order.status, 'confirmed');

      const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
      if (items.length === 0) throw new ValidationError('Order has no items');

      const loc = order.locationId;
      if (!loc) throw new ValidationError('Order must have a location to confirm');

      // 2. Validate stock and deduct immediately per item
      for (const item of items) {
        const [inv] = await db
          .select({ quantityOnHand: inventory.quantityOnHand })
          .from(inventory)
          .where(and(eq(inventory.variantId, item.variantId), eq(inventory.locationId, loc)))
          .limit(1);

        if (!inv || inv.quantityOnHand < item.quantity) {
          const [variant] = await db
            .select({ name: productVariants.name, sku: productVariants.sku })
            .from(productVariants)
            .where(eq(productVariants.id, item.variantId))
            .limit(1);
          throw new ValidationError(
            `Insufficient stock for '${variant?.name ?? item.variantId}' (SKU: ${variant?.sku ?? '?'})`,
          );
        }

        await db
          .update(inventory)
          .set({
            quantityOnHand: sql`${inventory.quantityOnHand} - ${item.quantity}`,
            updatedAt: new Date(),
          })
          .where(and(eq(inventory.variantId, item.variantId), eq(inventory.locationId, loc)));

        await db.insert(stockMovements).values({
          id: uuidv4(),
          variantId: item.variantId,
          locationId: loc,
          type: 'sale',
          quantity: item.quantity,
          referenceId: orderId,
          referenceType: 'order',
          createdBy: userId,
        });
      }

      // 3. Update order status
      await db
        .update(orders)
        .set({ status: 'confirmed', updatedAt: new Date() })
        .where(eq(orders.id, orderId));

      // 4. Re-read and return the updated order
      const [updated] = await db.select().from(orders).where(eq(orders.id, orderId));
      if (!updated) throw new NotFoundError('Order', orderId);

      return {
        updatedOrder: updated,
        variantIds: items.map((i) => i.variantId),
        locationId: loc,
      };
    },
  );

  // Enqueue low-stock alerts asynchronously (non-blocking on failure)
  await checkAndEnqueueLowStockAlerts(
    schemaName,
    tenantId,
    variantIds,
    locationId,
    notificationsQueue,
  ).catch(() => {
    // Alert failure must not roll back the confirmation
  });

  return updatedOrder;
}

export async function processOrder(schemaName: string, orderId: string) {
  return withTenantSchema(schemaName, async (db) => {
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order) throw new NotFoundError('Order', orderId);

    assertTransition(order.status, 'processing');

    await db
      .update(orders)
      .set({ status: 'processing', updatedAt: new Date() })
      .where(eq(orders.id, orderId));

    const [updated] = await db.select().from(orders).where(eq(orders.id, orderId));
    if (!updated) throw new NotFoundError('Order', orderId);
    return updated;
  });
}

export async function fulfillOrder(schemaName: string, orderId: string) {
  return withTenantSchema(schemaName, async (db) => {
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order) throw new NotFoundError('Order', orderId);

    assertTransition(order.status, 'fulfilled');

    await db
      .update(orders)
      .set({ status: 'fulfilled', fulfilledAt: new Date(), updatedAt: new Date() })
      .where(eq(orders.id, orderId));

    const [updated] = await db.select().from(orders).where(eq(orders.id, orderId));
    if (!updated) throw new NotFoundError('Order', orderId);
    return updated;
  });
}

export async function cancelOrder(schemaName: string, orderId: string, userId: string) {
  // All validation, stock restoration, and status update happen in a single session.
  // See confirmOrder for notes on Neon HTTP driver and transactional guarantees.
  return withTenantSchema(schemaName, async (db) => {
    // 1. Load and validate
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order) throw new NotFoundError('Order', orderId);

    assertTransition(order.status, 'cancelled');

    const priorStatus = order.status;

    // 2. Restore stock if order was already confirmed or processing
    if (order.locationId && (priorStatus === 'confirmed' || priorStatus === 'processing')) {
      const saleMovements = await db
        .select()
        .from(stockMovements)
        .where(
          and(
            eq(stockMovements.referenceId, orderId),
            eq(stockMovements.referenceType, 'order'),
            eq(stockMovements.type, 'sale'),
          ),
        );

      for (const movement of saleMovements) {
        await db
          .update(inventory)
          .set({
            quantityOnHand: sql`${inventory.quantityOnHand} + ${movement.quantity}`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(inventory.variantId, movement.variantId),
              eq(inventory.locationId, movement.locationId),
            ),
          );

        await db.insert(stockMovements).values({
          id: uuidv4(),
          variantId: movement.variantId,
          locationId: movement.locationId,
          type: 'return',
          quantity: movement.quantity,
          referenceId: orderId,
          referenceType: 'order',
          createdBy: userId,
        });
      }
    }

    // 3. Mark order as cancelled
    await db
      .update(orders)
      .set({ status: 'cancelled', cancelledAt: new Date(), updatedAt: new Date() })
      .where(eq(orders.id, orderId));

    const [updated] = await db.select().from(orders).where(eq(orders.id, orderId));
    if (!updated) throw new NotFoundError('Order', orderId);

    return updated;
  });
}
