/**
 * Shipping fee calculator.
 * Resolves the delivery fee for a given shipping method given checkout context.
 * Returns null when the method is unavailable for the given context (e.g. a free
 * shipping method whose conditions aren't met, or a zone rate with no matching zone).
 */

import { eq, and } from 'drizzle-orm';
import { withTenantSchema } from '../../shared/db/tenant.js';
import {
  shippingMethods,
  shippingRates,
  shippingZones,
  freeShippingConditions,
} from '../../shared/db/schema/tenant.js';

export interface ShippingContext {
  orderValueKobo: number;
  destinationState?: string; // required for zone_rate methods
  totalWeightKg?: number; // required for weight_rate methods
  itemProductIds?: string[]; // for product-based free shipping
  itemCategoryIds?: string[]; // for category-based free shipping
  promoCode?: string; // for promo-code free shipping
}

export interface ShippingOption {
  methodId: string;
  name: string;
  type: string;
  description: string | null;
  estimatedDaysMin: number | null;
  estimatedDaysMax: number | null;
  feeKobo: number;
}

/**
 * Resolve the fee for a single method. Returns null if method is unavailable.
 */
export async function resolveMethodFee(
  schemaName: string,
  methodId: string,
  ctx: ShippingContext,
): Promise<number | null> {
  return withTenantSchema(schemaName, async (db) => {
    const [method] = await db
      .select()
      .from(shippingMethods)
      .where(and(eq(shippingMethods.id, methodId), eq(shippingMethods.isActive, true)))
      .limit(1);

    if (!method) return null;

    switch (method.type) {
      case 'flat_rate':
        return method.flatRateKobo ?? 0;

      case 'pick_up':
        return 0;

      case 'free': {
        if (method.isFreeAlways) return 0;

        const conditions = await db
          .select()
          .from(freeShippingConditions)
          .where(eq(freeShippingConditions.methodId, methodId));

        for (const c of conditions) {
          if (c.conditionType === 'always') return 0;
          if (
            c.conditionType === 'min_order_value' &&
            c.thresholdKobo !== null &&
            ctx.orderValueKobo >= c.thresholdKobo
          )
            return 0;
          if (
            c.conditionType === 'product' &&
            c.productId &&
            ctx.itemProductIds?.includes(c.productId)
          )
            return 0;
          if (
            c.conditionType === 'category' &&
            c.categoryId &&
            ctx.itemCategoryIds?.includes(c.categoryId)
          )
            return 0;
          if (
            c.conditionType === 'promo_code' &&
            c.promoCode &&
            c.promoCode.toLowerCase() === ctx.promoCode?.toLowerCase()
          )
            return 0;
        }
        return null; // no condition met — method unavailable
      }

      case 'zone_rate': {
        if (!ctx.destinationState) return null;

        // Find zones that contain the destination state
        const zones = await db.select().from(shippingZones);
        const matchingZoneIds = zones
          .filter((z) => {
            const states = z.states as string[];
            return states.includes(ctx.destinationState!);
          })
          .map((z) => z.id);

        const rates = await db
          .select()
          .from(shippingRates)
          .where(eq(shippingRates.methodId, methodId));

        // Try matched zone first, then fall back to catch-all (zoneId = null)
        const zoneRate = rates.find((r) => r.zoneId && matchingZoneIds.includes(r.zoneId));
        const fallbackRate = rates.find((r) => r.zoneId === null);
        const matched = zoneRate ?? fallbackRate;
        return matched?.feeKobo ?? null;
      }

      case 'value_rate': {
        const rates = await db
          .select()
          .from(shippingRates)
          .where(eq(shippingRates.methodId, methodId));

        const matched = rates.find((r) => {
          const aboveMin =
            r.minOrderValueKobo === null || ctx.orderValueKobo >= r.minOrderValueKobo;
          const belowMax = r.maxOrderValueKobo === null || ctx.orderValueKobo < r.maxOrderValueKobo;
          return aboveMin && belowMax;
        });
        return matched?.feeKobo ?? null;
      }

      case 'weight_rate': {
        if (ctx.totalWeightKg === undefined) return null;

        const rates = await db
          .select()
          .from(shippingRates)
          .where(eq(shippingRates.methodId, methodId));

        const matched = rates.find((r) => {
          const aboveMin = r.minWeightKg === null || ctx.totalWeightKg! >= r.minWeightKg;
          const belowMax = r.maxWeightKg === null || ctx.totalWeightKg! < r.maxWeightKg;
          return aboveMin && belowMax;
        });
        return matched?.feeKobo ?? null;
      }

      case 'automated':
        // Automated quotes are fetched separately via GET /shipping/quote
        // which calls the logistics provider API. We return null here so
        // the /shipping/available endpoint excludes automated methods —
        // the frontend should call /shipping/quote explicitly for those.
        return null;

      default:
        return null;
    }
  });
}

/**
 * Returns all available shipping options with resolved fees for a given checkout context.
 */
export async function getAvailableShippingOptions(
  schemaName: string,
  ctx: ShippingContext,
): Promise<ShippingOption[]> {
  return withTenantSchema(schemaName, async (db) => {
    const methods = await db
      .select()
      .from(shippingMethods)
      .where(eq(shippingMethods.isActive, true));

    const results: ShippingOption[] = [];

    for (const method of methods) {
      const feeKobo = await resolveMethodFee(schemaName, method.id, ctx);
      if (feeKobo === null) continue; // unavailable for this context

      results.push({
        methodId: method.id,
        name: method.name,
        type: method.type,
        description: method.description,
        estimatedDaysMin: method.estimatedDaysMin,
        estimatedDaysMax: method.estimatedDaysMax,
        feeKobo,
      });
    }

    return results.sort((a, b) => a.feeKobo - b.feeKobo);
  });
}
