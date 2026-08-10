import { eq, and, like, desc, sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { withTenantSchema } from '../../shared/db/tenant.js';
import {
  categories,
  products,
  productVariants,
  inventory,
  locations,
} from '../../shared/db/schema/tenant.js';
import type { Product } from '../../shared/db/schema/tenant.js';
import { NotFoundError, ConflictError } from '../../shared/errors/types.js';
import type { PaginatedResult } from '../../shared/types/index.js';

// ─── Categories ──────────────────────────────────────────────────────────────

export async function createCategory(
  schemaName: string,
  input: { name: string; parentId?: string },
) {
  return withTenantSchema(schemaName, async (db) => {
    const id = uuidv4();
    await db.insert(categories).values({
      id,
      name: input.name,
      parentId: input.parentId ?? null,
    });
    const [cat] = await db.select().from(categories).where(eq(categories.id, id));
    return cat!;
  });
}

export async function listCategories(schemaName: string) {
  return withTenantSchema(schemaName, (db) =>
    db.select().from(categories).orderBy(categories.name),
  );
}

// ─── Products ────────────────────────────────────────────────────────────────

export async function createProduct(
  schemaName: string,
  input: {
    name: string;
    description?: string;
    categoryId?: string;
    imageUrl?: string;
  },
) {
  return withTenantSchema(schemaName, async (db) => {
    const id = uuidv4();
    await db.insert(products).values({
      id,
      name: input.name,
      description: input.description ?? null,
      categoryId: input.categoryId ?? null,
      imageUrl: input.imageUrl ?? null,
    });
    const [product] = await db.select().from(products).where(eq(products.id, id));
    return product!;
  });
}

export interface ListProductsQuery {
  page?: number;
  limit?: number;
  categoryId?: string;
  isActive?: boolean;
  search?: string;
}

export async function listProducts(
  schemaName: string,
  query: ListProductsQuery,
): Promise<PaginatedResult<Product>> {
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(query.limit ?? 20, 100);
  const offset = (page - 1) * limit;

  return withTenantSchema(schemaName, async (db) => {
    const conditions = [];
    if (query.categoryId !== undefined) {
      conditions.push(eq(products.categoryId, query.categoryId));
    }
    if (query.isActive !== undefined) {
      conditions.push(eq(products.isActive, query.isActive));
    }
    if (query.search) {
      conditions.push(like(products.name, `%${query.search}%`));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [countRow] = await db
      .select({ count: sql<string>`count(*)` })
      .from(products)
      .where(where);

    const items = await db
      .select()
      .from(products)
      .where(where)
      .orderBy(desc(products.createdAt))
      .limit(limit)
      .offset(offset);

    const total = parseInt(countRow?.count ?? '0');
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  });
}

export async function getProduct(schemaName: string, productId: string) {
  return withTenantSchema(schemaName, async (db) => {
    const [product] = await db
      .select()
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);
    if (!product) throw new NotFoundError('Product', productId);

    const variants = await db
      .select()
      .from(productVariants)
      .where(eq(productVariants.productId, productId))
      .orderBy(productVariants.name);

    return { ...product, variants };
  });
}

export async function updateProduct(
  schemaName: string,
  productId: string,
  input: Partial<{
    name: string;
    description: string | null;
    categoryId: string | null;
    imageUrl: string | null;
    isActive: boolean;
  }>,
) {
  return withTenantSchema(schemaName, async (db) => {
    const [existing] = await db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);
    if (!existing) throw new NotFoundError('Product', productId);

    await db
      .update(products)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(products.id, productId));

    const [updated] = await db.select().from(products).where(eq(products.id, productId));
    return updated!;
  });
}

// ─── Variants ────────────────────────────────────────────────────────────────

export async function createVariant(
  schemaName: string,
  productId: string,
  input: {
    sku: string;
    name: string;
    priceKobo: number;
    costKobo?: number;
    taxRateBps?: number;
    attributes?: string;
  },
) {
  return withTenantSchema(schemaName, async (db) => {
    const [product] = await db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);
    if (!product) throw new NotFoundError('Product', productId);

    const [existingSku] = await db
      .select({ id: productVariants.id })
      .from(productVariants)
      .where(eq(productVariants.sku, input.sku))
      .limit(1);
    if (existingSku) throw new ConflictError(`SKU '${input.sku}' already exists`);

    const variantId = uuidv4();
    await db.insert(productVariants).values({
      id: variantId,
      productId,
      sku: input.sku,
      name: input.name,
      priceKobo: input.priceKobo,
      costKobo: input.costKobo ?? 0,
      ...(input.taxRateBps !== undefined && { taxRateBps: input.taxRateBps }),
      attributes: input.attributes ?? null,
    });

    // Initialise inventory row for every active location
    const activeLocations = await db
      .select({ id: locations.id })
      .from(locations)
      .where(eq(locations.isActive, true));

    if (activeLocations.length > 0) {
      await db.insert(inventory).values(
        activeLocations.map((loc) => ({
          id: uuidv4(),
          variantId,
          locationId: loc.id,
          quantityOnHand: 0,
          lowStockThreshold: 5,
        })),
      );
    }

    // Mark the parent product as having variants
    await db
      .update(products)
      .set({ hasVariants: true, updatedAt: new Date() })
      .where(eq(products.id, productId));

    const [variant] = await db
      .select()
      .from(productVariants)
      .where(eq(productVariants.id, variantId));
    return variant!;
  });
}

export async function updateVariant(
  schemaName: string,
  productId: string,
  variantId: string,
  input: Partial<{
    name: string;
    priceKobo: number;
    costKobo: number;
    taxRateBps: number | null;
    attributes: string | null;
    isActive: boolean;
  }>,
) {
  return withTenantSchema(schemaName, async (db) => {
    const [existing] = await db
      .select({ id: productVariants.id })
      .from(productVariants)
      .where(
        and(eq(productVariants.id, variantId), eq(productVariants.productId, productId)),
      )
      .limit(1);
    if (!existing) throw new NotFoundError('Variant', variantId);

    await db
      .update(productVariants)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(productVariants.id, variantId));

    const [updated] = await db
      .select()
      .from(productVariants)
      .where(eq(productVariants.id, variantId));
    return updated!;
  });
}
