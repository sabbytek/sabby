import { z } from 'zod';

// ── Shipping Zones ──────────────────────────────────────────────────────────

export const createZoneBodySchema = z
  .object({
    name: z.string(),
    states: z.array(z.string()).min(1),
  })
  .strict();

export const updateZoneBodySchema = z
  .object({
    name: z.string().optional(),
    states: z.array(z.string()).optional(),
  })
  .strict();

export const idParamsSchema = z.object({
  id: z.string(),
});

// ── Shipping Methods ────────────────────────────────────────────────────────

export const createMethodBodySchema = z
  .object({
    name: z.string(),
    type: z.enum([
      'flat_rate',
      'zone_rate',
      'value_rate',
      'weight_rate',
      'automated',
      'free',
      'pick_up',
    ]),
    description: z.string().optional(),
    estimatedDaysMin: z.number().int().min(0).optional(),
    estimatedDaysMax: z.number().int().min(0).optional(),
    flatRateKobo: z.number().int().min(0).optional(),
    isFreeAlways: z.boolean().optional(),
    merchantCostKobo: z.number().int().min(0).optional(),
  })
  .strict();

export const updateMethodBodySchema = z
  .object({
    name: z.string().optional(),
    description: z.string().optional(),
    estimatedDaysMin: z.number().int().optional(),
    estimatedDaysMax: z.number().int().optional(),
    flatRateKobo: z.number().int().min(0).optional(),
    isFreeAlways: z.boolean().optional(),
    merchantCostKobo: z.number().int().min(0).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

// ── Shipping Rates ──────────────────────────────────────────────────────────

export const addRateBodySchema = z
  .object({
    feeKobo: z.number().int().min(0),
    zoneId: z.string().optional(),
    minOrderValueKobo: z.number().int().min(0).optional(),
    maxOrderValueKobo: z.number().int().min(0).optional(),
    minWeightKg: z.number().min(0).optional(),
    maxWeightKg: z.number().min(0).optional(),
  })
  .strict();

export const rateParamsSchema = z.object({
  id: z.string(),
  rateId: z.string(),
});

// ── Free Shipping Conditions ────────────────────────────────────────────────

export const addConditionBodySchema = z
  .object({
    conditionType: z.enum(['always', 'min_order_value', 'product', 'category', 'promo_code']),
    thresholdKobo: z.number().int().min(0).optional(),
    productId: z.string().optional(),
    categoryId: z.string().optional(),
    promoCode: z.string().optional(),
  })
  .strict();

export const conditionParamsSchema = z.object({
  id: z.string(),
  conditionId: z.string(),
});

// ── Pick-up Locations ───────────────────────────────────────────────────────

export const createPickupBodySchema = z
  .object({
    name: z.string(),
    locationType: z.enum(['merchant_branch', 'third_party']),
    locationId: z.string().optional(),
    providerName: z.string().optional(),
    address: z.string(),
    state: z.string().optional(),
    phone: z.string().optional(),
    operatingHours: z.string().optional(),
  })
  .strict();

export const updatePickupBodySchema = z
  .object({
    name: z.string().optional(),
    address: z.string().optional(),
    state: z.string().optional(),
    phone: z.string().optional(),
    operatingHours: z.string().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export const pickupListQuerySchema = z.object({
  state: z.string().optional(),
});

// ── Checkout Calculator ─────────────────────────────────────────────────────

export const availableQuerySchema = z.object({
  orderValueKobo: z.string(),
  destinationState: z.string().optional(),
  totalWeightKg: z.string().optional(),
  promoCode: z.string().optional(),
  itemProductIds: z.string().optional(),
  itemCategoryIds: z.string().optional(),
});

export type CreateZoneBody = z.infer<typeof createZoneBodySchema>;
export type UpdateZoneBody = z.infer<typeof updateZoneBodySchema>;
export type CreateMethodBody = z.infer<typeof createMethodBodySchema>;
export type UpdateMethodBody = z.infer<typeof updateMethodBodySchema>;
export type AddRateBody = z.infer<typeof addRateBodySchema>;
export type AddConditionBody = z.infer<typeof addConditionBodySchema>;
export type CreatePickupBody = z.infer<typeof createPickupBodySchema>;
export type UpdatePickupBody = z.infer<typeof updatePickupBodySchema>;
export type PickupListQuery = z.infer<typeof pickupListQuerySchema>;
export type AvailableQuery = z.infer<typeof availableQuerySchema>;
