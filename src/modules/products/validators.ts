import { z } from 'zod';

/**
 * Validates common barcode formats:
 * - EAN-13: 13 digits with checksum
 * - UPC-A: 12 digits with checksum
 * - Code 128: Variable length alphanumeric (no standard checksum validation)
 */
function isValidBarcode(value: string): boolean {
  // EAN-13: 13 digits
  if (/^\d{13}$/.test(value)) {
    return validateEan13Checksum(value);
  }
  // UPC-A: 12 digits
  if (/^\d{12}$/.test(value)) {
    return validateUpcAChecksum(value);
  }
  // Code 128: alphanumeric, variable length (typically 1-48 chars)
  if (/^[A-Za-z0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]{1,48}$/.test(value)) {
    return true;
  }
  return false;
}

function validateEan13Checksum(code: string): boolean {
  const digits = code.split('').map(Number);
  if (digits.length !== 13) return false;
  const checkDigit = digits[12] as number;
  const sum = digits.slice(0, 12).reduce((acc, digit, i) => {
    return acc + digit * (i % 2 === 0 ? 1 : 3);
  }, 0);
  const calculatedCheck = (10 - (sum % 10)) % 10;
  return calculatedCheck === checkDigit;
}

function validateUpcAChecksum(code: string): boolean {
  const digits = code.split('').map(Number);
  if (digits.length !== 12) return false;
  const checkDigit = digits[11] as number;
  const sum = digits.slice(0, 11).reduce((acc, digit, i) => {
    return acc + digit * (i % 2 === 0 ? 3 : 1);
  }, 0);
  const calculatedCheck = (10 - (sum % 10)) % 10;
  return calculatedCheck === checkDigit;
}

const barcodeSchema = z.string().refine(isValidBarcode, {
  message: 'Invalid barcode format. Supported: EAN-13 (13 digits), UPC-A (12 digits), Code 128 (alphanumeric)',
});

export const createCategoryBodySchema = z.object({
  name: z.string().min(1),
  parentId: z.string().optional(),
}).strict();

export const listProductsQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  categoryId: z.string().optional(),
  isActive: z.enum(['true', 'false']).optional(),
  search: z.string().optional(),
});

export const createProductBodySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  categoryId: z.string().optional(),
  imageUrl: z.string().optional(),
}).strict();

export const updateProductBodySchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
}).strict();

export const idParamsSchema = z.object({
  id: z.string(),
});

export const createVariantBodySchema = z.object({
  sku: z.string().min(1),
  barcode: barcodeSchema.optional(),
  name: z.string().min(1),
  priceKobo: z.number().int().min(0),
  costKobo: z.number().int().min(0).optional(),
  taxRateBps: z.number().int().min(0).max(10000).optional(),
  attributes: z.string().optional(),
}).strict();

export const variantParamsSchema = z.object({
  id: z.string(),
  vid: z.string(),
});

export const barcodeParamsSchema = z.object({
  barcode: z.string().min(1),
});

export const updateVariantBodySchema = z.object({
  barcode: barcodeSchema.nullable().optional(),
  name: z.string().min(1).optional(),
  priceKobo: z.number().int().min(0).optional(),
  costKobo: z.number().int().min(0).optional(),
  taxRateBps: z.number().int().min(0).max(10000).nullable().optional(),
  attributes: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
}).strict();

export type CreateCategoryBody = z.infer<typeof createCategoryBodySchema>;
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;
export type CreateProductBody = z.infer<typeof createProductBodySchema>;
export type UpdateProductBody = z.infer<typeof updateProductBodySchema>;
export type CreateVariantBody = z.infer<typeof createVariantBodySchema>;
export type UpdateVariantBody = z.infer<typeof updateVariantBodySchema>;
