import type { RequestContext } from '../../shared/types/controller.js';
import type { ProductVariant } from '../../shared/db/schema/tenant.js';
import { auditUserAction } from '../../shared/audit/tenant-audit.js';
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

function sanitizeVariant(
  v: ProductVariant,
  hideMargin: boolean,
): Omit<ProductVariant, 'costKobo'> | ProductVariant {
  if (!hideMargin) return v;
  const { costKobo: _cost, ...safe } = v;
  return safe;
}

export async function createCategoryHandler(
  ctx: RequestContext,
  input: { name: string; parentId?: string },
) {
  const category = await createCategory(ctx.schema, input);
  await auditUserAction(ctx, {
    action: 'category.created',
    targetType: 'category',
    targetId: category.id,
    metadata: { name: input.name },
  });
  return category;
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
  const product = await createProduct(ctx.schema, input);
  await auditUserAction(ctx, {
    action: 'product.created',
    targetType: 'product',
    targetId: product.id,
    metadata: { name: input.name },
  });
  return product;
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
  const product = await updateProduct(ctx.schema, id, input);
  await auditUserAction(ctx, {
    action: 'product.updated',
    targetType: 'product',
    targetId: id,
    metadata: { fields: Object.keys(input) },
  });
  return product;
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
  const variant = await createVariant(ctx.schema, productId, input);
  await auditUserAction(ctx, {
    action: 'product.variant_created',
    targetType: 'product_variant',
    targetId: variant.id,
    metadata: { productId, sku: input.sku, priceKobo: input.priceKobo },
  });
  return variant;
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
  const variant = await updateVariant(ctx.schema, productId, variantId, input);
  await auditUserAction(ctx, {
    action: 'product.variant_updated',
    targetType: 'product_variant',
    targetId: variantId,
    metadata: {
      productId,
      fields: Object.keys(input),
      ...(input.priceKobo !== undefined && { priceKobo: input.priceKobo }),
    },
  });
  return variant;
}
