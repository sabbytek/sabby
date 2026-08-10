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
) {
  return createCategory(ctx.schema, input);
}

export async function listCategoriesHandler(ctx: RequestContext) {
  return listCategories(ctx.schema);
}

export async function createProductHandler(
  ctx: RequestContext,
  input: {
    name: string;
    description?: string;
    categoryId?: string;
    imageUrl?: string;
  },
) {
  return createProduct(ctx.schema, input);
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
) {
  return listProducts(ctx.schema, {
    ...(query.page && { page: parseInt(query.page) }),
    ...(query.limit && { limit: parseInt(query.limit) }),
    ...(query.categoryId && { categoryId: query.categoryId }),
    ...(query.isActive !== undefined && { isActive: query.isActive === 'true' }),
    ...(query.search && { search: query.search }),
  });
}

export async function getProductHandler(ctx: RequestContext, id: string) {
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
) {
  return updateProduct(ctx.schema, id, input);
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
) {
  return createVariant(ctx.schema, productId, input);
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
) {
  return updateVariant(ctx.schema, productId, variantId, input);
}
