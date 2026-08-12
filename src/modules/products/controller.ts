import type { RequestContext } from '../../shared/types/controller.js';
import type { ProductVariant } from '../../shared/db/schema/tenant.js';
import {
  createCategory,
  listCategories,
  createProduct,
  listProducts,
  getProduct,
  updateProduct,
  createVariant,
  updateVariant,
} from './service.js';

function sanitizeVariant(v: ProductVariant, hideMargin: boolean): Omit<ProductVariant, 'costKobo'> | ProductVariant {
  if (!hideMargin) return v;
  const { costKobo: _cost, ...safe } = v;
  return safe;
}

export async function createCategoryHandler(
  ctx: RequestContext,
  input: { name: string; parentId?: string },
): Promise<unknown> {
  const result = await createCategory(ctx.schema, input);
  return result;
}

export async function listCategoriesHandler(ctx: RequestContext): Promise<unknown> {
  const result = await listCategories(ctx.schema);
  return result;
}

export async function createProductHandler(
  ctx: RequestContext,
  input: {
    name: string;
    description?: string;
    categoryId?: string;
    imageUrl?: string;
  },
): Promise<unknown> {
  const result = await createProduct(ctx.schema, input);
  return result;
}

export async function listProductsHandler(
  ctx: RequestContext,
  query: {
    page?: string;
    limit?: string;
    categoryId?: string;
    isActive?: string;
    search?: string;
  },
): Promise<unknown> {
  const result = await listProducts(ctx.schema, {
    ...(query.page && { page: parseInt(query.page) }),
    ...(query.limit && { limit: parseInt(query.limit) }),
    ...(query.categoryId && { categoryId: query.categoryId }),
    ...(query.isActive !== undefined && { isActive: query.isActive === 'true' }),
    ...(query.search && { search: query.search }),
  });
  return result;
}

export async function getProductHandler(ctx: RequestContext, id: string): Promise<unknown> {
  const product = await getProduct(ctx.schema, id);
  const hideMargin = ctx.role === 'staff';
  return {
    ...product,
    variants: product.variants.map((v) => sanitizeVariant(v, hideMargin)),
  };
}

export async function updateProductHandler(
  ctx: RequestContext,
  id: string,
  input: Partial<{
    name: string;
    description: string | null;
    categoryId: string | null;
    imageUrl: string | null;
    isActive: boolean;
  }>,
): Promise<unknown> {
  const result = await updateProduct(ctx.schema, id, input);
  return result;
}

export async function createVariantHandler(
  ctx: RequestContext,
  productId: string,
  input: {
    sku: string;
    name: string;
    priceKobo: number;
    costKobo?: number;
    taxRateBps?: number;
    attributes?: string;
  },
): Promise<unknown> {
  const result = await createVariant(ctx.schema, productId, input);
  return result;
}

export async function updateVariantHandler(
  ctx: RequestContext,
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
): Promise<unknown> {
  const result = await updateVariant(ctx.schema, productId, variantId, input);
  return result;
}
