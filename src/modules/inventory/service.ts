import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { withTenantSchema } from '../../shared/db/tenant.js';
import {
  inventory,
  stockMovements,
  productVariants,
  locations,
} from '../../shared/db/schema/tenant.js';
import type { StockMovement } from '../../shared/db/schema/tenant.js';
import { NotFoundError, ValidationError } from '../../shared/errors/types.js';
import type { PaginatedResult } from '../../shared/types/index.js';
export { isLowStock } from './utils.js';

export async function listInventory(
  schemaName: string,
  query: { locationId?: string; variantId?: string },
) {
  return withTenantSchema(schemaName, async (db) => {
    const conditions = [];
    if (query.locationId) conditions.push(eq(inventory.locationId, query.locationId));
    if (query.variantId) conditions.push(eq(inventory.variantId, query.variantId));
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    return db
      .select({
        id: inventory.id,
        variantId: inventory.variantId,
        locationId: inventory.locationId,
        quantityOnHand: inventory.quantityOnHand,
        lowStockThreshold: inventory.lowStockThreshold,
        updatedAt: inventory.updatedAt,
        variantSku: productVariants.sku,
        variantName: productVariants.name,
        locationName: locations.name,
      })
      .from(inventory)
      .leftJoin(productVariants, eq(inventory.variantId, productVariants.id))
      .leftJoin(locations, eq(inventory.locationId, locations.id))
      .where(where);
  });
}

export async function receiveStock(
  schemaName: string,
  userId: string,
  input: {
    variantId: string;
    locationId: string;
    quantity: number;
    note?: string;
  },
) {
  if (input.quantity <= 0) {
    throw new ValidationError('Receive quantity must be greater than zero');
  }

  return withTenantSchema(schemaName, async (db) => {
    const [inv] = await db
      .select({ id: inventory.id })
      .from(inventory)
      .where(
        and(
          eq(inventory.variantId, input.variantId),
          eq(inventory.locationId, input.locationId),
        ),
      )
      .limit(1);

    if (!inv) {
      throw new NotFoundError(
        'Inventory record',
        `variant ${input.variantId} at location ${input.locationId}`,
      );
    }

    await db
      .update(inventory)
      .set({
        quantityOnHand: sql`${inventory.quantityOnHand} + ${input.quantity}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(inventory.variantId, input.variantId),
          eq(inventory.locationId, input.locationId),
        ),
      );

    const movementId = uuidv4();
    await db.insert(stockMovements).values({
      id: movementId,
      variantId: input.variantId,
      locationId: input.locationId,
      type: 'receive',
      quantity: input.quantity,
      note: input.note ?? null,
      createdBy: userId,
    });

    const [updated] = await db
      .select()
      .from(inventory)
      .where(
        and(
          eq(inventory.variantId, input.variantId),
          eq(inventory.locationId, input.locationId),
        ),
      );
    return updated!;
  });
}

export async function adjustStock(
  schemaName: string,
  userId: string,
  input: {
    variantId: string;
    locationId: string;
    quantity: number; // positive = add, negative = remove
    note?: string;
  },
) {
  return withTenantSchema(schemaName, async (db) => {
    const [inv] = await db
      .select()
      .from(inventory)
      .where(
        and(
          eq(inventory.variantId, input.variantId),
          eq(inventory.locationId, input.locationId),
        ),
      )
      .limit(1);

    if (!inv) {
      throw new NotFoundError(
        'Inventory record',
        `variant ${input.variantId} at location ${input.locationId}`,
      );
    }

    const newQty = inv.quantityOnHand + input.quantity;
    if (newQty < 0) {
      throw new ValidationError(
        `Adjustment would result in negative stock (current: ${inv.quantityOnHand}, adjustment: ${input.quantity})`,
      );
    }

    await db
      .update(inventory)
      .set({
        quantityOnHand: sql`${inventory.quantityOnHand} + ${input.quantity}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(inventory.variantId, input.variantId),
          eq(inventory.locationId, input.locationId),
        ),
      );

    const movementId = uuidv4();
    await db.insert(stockMovements).values({
      id: movementId,
      variantId: input.variantId,
      locationId: input.locationId,
      type: 'adjustment',
      quantity: input.quantity,
      note: input.note ?? null,
      createdBy: userId,
    });

    const [updated] = await db
      .select()
      .from(inventory)
      .where(
        and(
          eq(inventory.variantId, input.variantId),
          eq(inventory.locationId, input.locationId),
        ),
      );
    return updated!;
  });
}

export async function listMovements(
  schemaName: string,
  query: {
    variantId?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  },
): Promise<PaginatedResult<StockMovement>> {
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(query.limit ?? 20, 100);
  const offset = (page - 1) * limit;

  return withTenantSchema(schemaName, async (db) => {
    const conditions = [];
    if (query.variantId) conditions.push(eq(stockMovements.variantId, query.variantId));
    if (query.from) conditions.push(sql`${stockMovements.createdAt} >= ${query.from}`);
    if (query.to) conditions.push(sql`${stockMovements.createdAt} <= ${query.to}`);

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [countRow] = await db
      .select({ count: sql<string>`count(*)` })
      .from(stockMovements)
      .where(where);

    const items = await db
      .select()
      .from(stockMovements)
      .where(where)
      .orderBy(desc(stockMovements.createdAt))
      .limit(limit)
      .offset(offset);

    const total = parseInt(countRow?.count ?? '0');
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  });
}

export async function getLowStock(schemaName: string, locationId?: string) {
  return withTenantSchema(schemaName, async (db) => {
    const conditions = [
      sql`${inventory.quantityOnHand} <= ${inventory.lowStockThreshold}`,
    ];
    if (locationId) conditions.push(eq(inventory.locationId, locationId));

    return db
      .select({
        id: inventory.id,
        variantId: inventory.variantId,
        locationId: inventory.locationId,
        quantityOnHand: inventory.quantityOnHand,
        lowStockThreshold: inventory.lowStockThreshold,
        variantSku: productVariants.sku,
        variantName: productVariants.name,
        locationName: locations.name,
      })
      .from(inventory)
      .leftJoin(productVariants, eq(inventory.variantId, productVariants.id))
      .leftJoin(locations, eq(inventory.locationId, locations.id))
      .where(and(...conditions));
  });
}

// Used internally by the orders service after stock deduction
export async function checkAndEnqueueLowStockAlerts(
  schemaName: string,
  tenantId: string,
  variantIds: string[],
  locationId: string,
  notificationsQueue: { add: (name: string, data: unknown) => Promise<unknown> },
) {
  if (variantIds.length === 0) return;

  const updatedLevels = await withTenantSchema(schemaName, async (db) =>
    db
      .select({
        variantId: inventory.variantId,
        quantityOnHand: inventory.quantityOnHand,
        lowStockThreshold: inventory.lowStockThreshold,
        variantName: productVariants.name,
        sku: productVariants.sku,
      })
      .from(inventory)
      .leftJoin(productVariants, eq(inventory.variantId, productVariants.id))
      .where(
        and(inArray(inventory.variantId, variantIds), eq(inventory.locationId, locationId)),
      ),
  );

  for (const level of updatedLevels) {
    if (level.quantityOnHand <= level.lowStockThreshold) {
      await notificationsQueue.add('low-stock-alert', {
        tenantId,
        schemaName,
        variantId: level.variantId,
        variantName: level.variantName ?? 'Unknown',
        sku: level.sku ?? 'Unknown',
        quantityOnHand: level.quantityOnHand,
        threshold: level.lowStockThreshold,
        locationId,
      });
    }
  }
}
