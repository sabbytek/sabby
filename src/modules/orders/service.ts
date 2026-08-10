import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { withTenantSchema } from '../../shared/db/tenant.js';
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
import { assertTransition, type OrderStatus } from './state-machine.js';
import { checkAndEnqueueLowStockAlerts } from '../inventory/service.js';
import { notificationsQueue } from '../../shared/queue/client.js';
export { calculateOrderTotals } from './calculations.js';
export type { LineInput, OrderTotals } from './calculations.js';
import { calculateOrderTotals } from './calculations.js';

// ─── Create ──────────────────────────────────────────────────────────────────

export interface CreateOrderInput {
  customerId?: string;
  locationId?: string;
  assignedTo?: string;
  channel?: string;
  items: Array<{
    variantId: string;
    quantity: number;
    unitPriceKobo: number;
    discountKobo?: number;
    taxKobo?: number;
  }>;
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

export async function createOrder(
  schemaName: string,
  _userId: string,
  input: CreateOrderInput,
) {
  if (input.items.length === 0) {
    throw new ValidationError('Order must have at least one item');
  }

  return withTenantSchema(schemaName, async (db) => {
    // Sequential order number: count existing orders + 1
    const [row] = await db.select({ count: sql<string>`count(*)` }).from(orders);
    const nextNum = parseInt(row?.count ?? '0') + 1;
    const orderNumber = `ORD-${String(nextNum).padStart(6, '0')}`;

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
      taxKobo: item.taxKobo ??
        Math.floor(item.quantity * item.unitPriceKobo * (taxRateMap.get(item.variantId) ?? 0) / 10000),
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
    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);
    if (!order) throw new NotFoundError('Order', orderId);

    const items = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId));

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
  // Step 1: validate and gather data
  const { order, items, locationId } = await withTenantSchema(schemaName, async (db) => {
    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);
    if (!order) throw new NotFoundError('Order', orderId);

    assertTransition(order.status as OrderStatus, 'confirmed');

    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
    if (items.length === 0) throw new ValidationError('Order has no items');

    if (!order.locationId) throw new ValidationError('Order must have a location to confirm');

    // Validate stock availability for all items before deducting any
    for (const item of items) {
      const [inv] = await db
        .select({ quantityOnHand: inventory.quantityOnHand })
        .from(inventory)
        .where(
          and(
            eq(inventory.variantId, item.variantId),
            eq(inventory.locationId, order.locationId),
          ),
        )
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
    }

    return { order, items, locationId: order.locationId };
  });

  // Step 2: deduct stock and update order status
  await withTenantSchema(schemaName, async (db) => {
    for (const item of items) {
      await db
        .update(inventory)
        .set({
          quantityOnHand: sql`${inventory.quantityOnHand} - ${item.quantity}`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(inventory.variantId, item.variantId),
            eq(inventory.locationId, locationId),
          ),
        );

      await db.insert(stockMovements).values({
        id: uuidv4(),
        variantId: item.variantId,
        locationId,
        type: 'sale',
        quantity: item.quantity,
        referenceId: orderId,
        referenceType: 'order',
        createdBy: userId,
      });
    }

    await db
      .update(orders)
      .set({ status: 'confirmed', updatedAt: new Date() })
      .where(eq(orders.id, orderId));
  });

  // Step 3: enqueue low-stock alerts asynchronously (non-blocking on failure)
  const variantIds = items.map((i) => i.variantId);
  await checkAndEnqueueLowStockAlerts(
    schemaName,
    tenantId,
    variantIds,
    locationId,
    notificationsQueue,
  ).catch(() => {
    // Alert failure must not roll back the confirmation
  });

  return withTenantSchema(schemaName, async (db) => {
    const [updated] = await db.select().from(orders).where(eq(orders.id, orderId));
    return updated!;
  });
}

export async function processOrder(schemaName: string, orderId: string) {
  return withTenantSchema(schemaName, async (db) => {
    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);
    if (!order) throw new NotFoundError('Order', orderId);

    assertTransition(order.status as OrderStatus, 'processing');

    await db
      .update(orders)
      .set({ status: 'processing', updatedAt: new Date() })
      .where(eq(orders.id, orderId));

    const [updated] = await db.select().from(orders).where(eq(orders.id, orderId));
    return updated!;
  });
}

export async function fulfillOrder(schemaName: string, orderId: string) {
  return withTenantSchema(schemaName, async (db) => {
    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);
    if (!order) throw new NotFoundError('Order', orderId);

    assertTransition(order.status as OrderStatus, 'fulfilled');

    await db
      .update(orders)
      .set({ status: 'fulfilled', fulfilledAt: new Date(), updatedAt: new Date() })
      .where(eq(orders.id, orderId));

    const [updated] = await db.select().from(orders).where(eq(orders.id, orderId));
    return updated!;
  });
}

export async function cancelOrder(
  schemaName: string,
  orderId: string,
  userId: string,
) {
  // Step 1: validate and check if stock restoration is needed
  const { order, priorStatus, locationId } = await withTenantSchema(schemaName, async (db) => {
    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);
    if (!order) throw new NotFoundError('Order', orderId);

    assertTransition(order.status as OrderStatus, 'cancelled');

    return {
      order,
      priorStatus: order.status as OrderStatus,
      locationId: order.locationId,
    };
  });

  // Step 2: restore stock if order was already confirmed or processing
  if (locationId && (priorStatus === 'confirmed' || priorStatus === 'processing')) {
    await withTenantSchema(schemaName, async (db) => {
      // Find all sale movements for this order
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
    });
  }

  // Step 3: mark order as cancelled
  return withTenantSchema(schemaName, async (db) => {
    await db
      .update(orders)
      .set({ status: 'cancelled', cancelledAt: new Date(), updatedAt: new Date() })
      .where(eq(orders.id, orderId));

    const [updated] = await db.select().from(orders).where(eq(orders.id, orderId));
    return updated!;
  });
}
