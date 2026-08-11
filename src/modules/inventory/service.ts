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

/**
 * Check stock availability across all locations for a given SKU or variant.
 * Returns stock levels at each branch so staff can see where to source from.
 */
export async function getAvailability(
  schemaName: string,
  query: { sku?: string; variantId?: string },
) {
  return withTenantSchema(schemaName, async (db) => {
    const conditions = [];
    if (query.variantId) {
      conditions.push(eq(inventory.variantId, query.variantId));
    }
    if (query.sku) {
      conditions.push(eq(productVariants.sku, query.sku));
    }

    const results = await db
      .select({
        variantId: inventory.variantId,
        variantName: productVariants.name,
        sku: productVariants.sku,
        locationId: inventory.locationId,
        locationName: locations.name,
        quantityOnHand: inventory.quantityOnHand,
        lowStockThreshold: inventory.lowStockThreshold,
      })
      .from(inventory)
      .innerJoin(productVariants, eq(inventory.variantId, productVariants.id))
      .innerJoin(locations, eq(inventory.locationId, locations.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    const totalStock = results.reduce((sum, r) => sum + r.quantityOnHand, 0);
    const locationsWithStock = results.filter((r) => r.quantityOnHand > 0);

    return {
      sku: results[0]?.sku ?? query.sku,
      variantId: results[0]?.variantId ?? query.variantId,
      variantName: results[0]?.variantName ?? null,
      totalStock,
      availableAt: locationsWithStock.length,
      locations: results.map((r) => ({
        locationId: r.locationId,
        locationName: r.locationName,
        quantityOnHand: r.quantityOnHand,
        lowStockThreshold: r.lowStockThreshold,
        isLowStock: r.quantityOnHand <= r.lowStockThreshold,
      })),
    };
  });
}

/**
 * Transfer stock between two locations within the same tenant.
 * Creates paired stock movements for audit trail.
 */
export async function transferStock(
  schemaName: string,
  userId: string,
  input: {
    variantId: string;
    fromLocationId: string;
    toLocationId: string;
    quantity: number;
    note?: string;
  },
) {
  if (input.quantity <= 0) {
    throw new ValidationError('Transfer quantity must be greater than zero');
  }

  if (input.fromLocationId === input.toLocationId) {
    throw new ValidationError('Cannot transfer to the same location');
  }

  return withTenantSchema(schemaName, async (db) => {
    // Check source inventory
    const [sourceInv] = await db
      .select()
      .from(inventory)
      .where(
        and(
          eq(inventory.variantId, input.variantId),
          eq(inventory.locationId, input.fromLocationId),
        ),
      )
      .limit(1);

    if (!sourceInv) {
      throw new NotFoundError(
        'Inventory record',
        `variant ${input.variantId} at source location ${input.fromLocationId}`,
      );
    }

    if (sourceInv.quantityOnHand < input.quantity) {
      throw new ValidationError(
        `Insufficient stock at source location (available: ${sourceInv.quantityOnHand}, requested: ${input.quantity})`,
      );
    }

    // Check/create destination inventory
    const [destInv] = await db
      .select()
      .from(inventory)
      .where(
        and(
          eq(inventory.variantId, input.variantId),
          eq(inventory.locationId, input.toLocationId),
        ),
      )
      .limit(1);

    if (!destInv) {
      // Create inventory record at destination if it doesn't exist
      await db.insert(inventory).values({
        id: uuidv4(),
        variantId: input.variantId,
        locationId: input.toLocationId,
        quantityOnHand: 0,
        lowStockThreshold: sourceInv.lowStockThreshold,
      });
    }

    const transferId = uuidv4();
    const transferNote = input.note ?? `Transfer ${transferId}`;

    // Deduct from source
    await db
      .update(inventory)
      .set({
        quantityOnHand: sql`${inventory.quantityOnHand} - ${input.quantity}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(inventory.variantId, input.variantId),
          eq(inventory.locationId, input.fromLocationId),
        ),
      );

    // Add to destination
    await db
      .update(inventory)
      .set({
        quantityOnHand: sql`${inventory.quantityOnHand} + ${input.quantity}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(inventory.variantId, input.variantId),
          eq(inventory.locationId, input.toLocationId),
        ),
      );

    // Record outbound movement
    await db.insert(stockMovements).values({
      id: uuidv4(),
      variantId: input.variantId,
      locationId: input.fromLocationId,
      type: 'transfer',
      quantity: -input.quantity,
      referenceId: transferId,
      referenceType: 'transfer',
      note: `OUT: ${transferNote}`,
      createdBy: userId,
    });

    // Record inbound movement
    await db.insert(stockMovements).values({
      id: uuidv4(),
      variantId: input.variantId,
      locationId: input.toLocationId,
      type: 'transfer',
      quantity: input.quantity,
      referenceId: transferId,
      referenceType: 'transfer',
      note: `IN: ${transferNote}`,
      createdBy: userId,
    });

    // Fetch updated inventory at both locations
    const [updatedSource] = await db
      .select({
        locationId: inventory.locationId,
        locationName: locations.name,
        quantityOnHand: inventory.quantityOnHand,
      })
      .from(inventory)
      .innerJoin(locations, eq(inventory.locationId, locations.id))
      .where(
        and(
          eq(inventory.variantId, input.variantId),
          eq(inventory.locationId, input.fromLocationId),
        ),
      );

    const [updatedDest] = await db
      .select({
        locationId: inventory.locationId,
        locationName: locations.name,
        quantityOnHand: inventory.quantityOnHand,
      })
      .from(inventory)
      .innerJoin(locations, eq(inventory.locationId, locations.id))
      .where(
        and(
          eq(inventory.variantId, input.variantId),
          eq(inventory.locationId, input.toLocationId),
        ),
      );

    return {
      transferId,
      variantId: input.variantId,
      quantity: input.quantity,
      from: updatedSource,
      to: updatedDest,
    };
  });
}
