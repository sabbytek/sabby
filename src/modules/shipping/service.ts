import { v4 as uuidv4 } from 'uuid';
import { eq, and } from 'drizzle-orm';
import { withTenantSchema } from '../../shared/db/tenant.js';
import {
  shippingZones,
  shippingMethods,
  shippingRates,
  freeShippingConditions,
  pickupLocations,
  locations,
} from '../../shared/db/schema/tenant.js';
import { NotFoundError, ValidationError } from '../../shared/errors/types.js';
import { isValidNgState } from './ng-states.js';

// ─── Shipping Zones ───────────────────────────────────────────────────────────

export async function createShippingZone(
  schemaName: string,
  input: { name: string; states: string[] },
) {
  const invalid = input.states.filter((s) => !isValidNgState(s));
  if (invalid.length > 0) throw new ValidationError(`Invalid Nigerian state(s): ${invalid.join(', ')}`);

  return withTenantSchema(schemaName, async (db) => {
    const id = uuidv4();
    await db.insert(shippingZones).values({ id, name: input.name, states: input.states });
    const [zone] = await db.select().from(shippingZones).where(eq(shippingZones.id, id));
    return zone!;
  });
}

export async function listShippingZones(schemaName: string) {
  return withTenantSchema(schemaName, (db) => db.select().from(shippingZones));
}

export async function updateShippingZone(
  schemaName: string,
  zoneId: string,
  input: { name?: string; states?: string[] },
) {
  if (input.states) {
    const invalid = input.states.filter((s) => !isValidNgState(s));
    if (invalid.length > 0) throw new ValidationError(`Invalid Nigerian state(s): ${invalid.join(', ')}`);
  }
  return withTenantSchema(schemaName, async (db) => {
    await db
      .update(shippingZones)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(shippingZones.id, zoneId));
  });
}

export async function deleteShippingZone(schemaName: string, zoneId: string) {
  return withTenantSchema(schemaName, (db) =>
    db.delete(shippingZones).where(eq(shippingZones.id, zoneId)),
  );
}

// ─── Shipping Methods ─────────────────────────────────────────────────────────

export type ShippingMethodType =
  | 'flat_rate'
  | 'zone_rate'
  | 'value_rate'
  | 'weight_rate'
  | 'automated'
  | 'free'
  | 'pick_up';

export interface CreateShippingMethodInput {
  name: string;
  type: ShippingMethodType;
  description?: string;
  estimatedDaysMin?: number;
  estimatedDaysMax?: number;
  flatRateKobo?: number;
  isFreeAlways?: boolean;
  /**
   * The courier cost the merchant pays per delivery when this method is used.
   * Only relevant for 'free' methods — this is NOT what the customer pays (always ₦0),
   * but what the merchant owes the shipping company.
   * Stored on the order as merchantShippingCostKobo for expense tracking.
   */
  merchantCostKobo?: number;
}

export async function createShippingMethod(
  schemaName: string,
  input: CreateShippingMethodInput,
) {
  if (input.type === 'flat_rate' && input.flatRateKobo === undefined) {
    throw new ValidationError('flatRateKobo is required for flat_rate methods');
  }
  return withTenantSchema(schemaName, async (db) => {
    const id = uuidv4();
    await db.insert(shippingMethods).values({
      id,
      name: input.name,
      type: input.type,
      description: input.description ?? null,
      estimatedDaysMin: input.estimatedDaysMin ?? null,
      estimatedDaysMax: input.estimatedDaysMax ?? null,
      flatRateKobo: input.flatRateKobo ?? null,
      isFreeAlways: input.isFreeAlways ?? false,
      merchantCostKobo: input.merchantCostKobo ?? null,
    });
    const [method] = await db.select().from(shippingMethods).where(eq(shippingMethods.id, id));
    return method!;
  });
}

export async function listShippingMethods(schemaName: string) {
  return withTenantSchema(schemaName, (db) => db.select().from(shippingMethods));
}

export async function updateShippingMethod(
  schemaName: string,
  methodId: string,
  input: Partial<CreateShippingMethodInput> & { isActive?: boolean },
) {
  return withTenantSchema(schemaName, (db) =>
    db
      .update(shippingMethods)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(shippingMethods.id, methodId)),
  );
}

// ─── Shipping Rates ───────────────────────────────────────────────────────────

export interface AddShippingRateInput {
  feeKobo: number;
  zoneId?: string;
  minOrderValueKobo?: number;
  maxOrderValueKobo?: number;
  minWeightKg?: number;
  maxWeightKg?: number;
}

export async function addShippingRate(
  schemaName: string,
  methodId: string,
  input: AddShippingRateInput,
) {
  return withTenantSchema(schemaName, async (db) => {
    const [method] = await db
      .select({ type: shippingMethods.type })
      .from(shippingMethods)
      .where(eq(shippingMethods.id, methodId))
      .limit(1);

    if (!method) throw new NotFoundError('ShippingMethod', methodId);

    if (method.type === 'zone_rate' && input.zoneId) {
      // validate zoneId exists
      const [zone] = await db
        .select({ id: shippingZones.id })
        .from(shippingZones)
        .where(eq(shippingZones.id, input.zoneId))
        .limit(1);
      if (!zone) throw new NotFoundError('ShippingZone', input.zoneId);
    }

    const id = uuidv4();
    await db.insert(shippingRates).values({
      id,
      methodId,
      zoneId: input.zoneId ?? null,
      minOrderValueKobo: input.minOrderValueKobo ?? null,
      maxOrderValueKobo: input.maxOrderValueKobo ?? null,
      minWeightKg: input.minWeightKg ?? null,
      maxWeightKg: input.maxWeightKg ?? null,
      feeKobo: input.feeKobo,
    });

    const [rate] = await db.select().from(shippingRates).where(eq(shippingRates.id, id));
    return rate!;
  });
}

export async function listShippingRates(schemaName: string, methodId: string) {
  return withTenantSchema(schemaName, (db) =>
    db.select().from(shippingRates).where(eq(shippingRates.methodId, methodId)),
  );
}

export async function deleteShippingRate(schemaName: string, rateId: string) {
  return withTenantSchema(schemaName, (db) =>
    db.delete(shippingRates).where(eq(shippingRates.id, rateId)),
  );
}

// ─── Free Shipping Conditions ─────────────────────────────────────────────────

export type FreeShippingConditionType =
  | 'always'
  | 'min_order_value'
  | 'product'
  | 'category'
  | 'promo_code';

export interface AddFreeShippingConditionInput {
  conditionType: FreeShippingConditionType;
  thresholdKobo?: number;
  productId?: string;
  categoryId?: string;
  promoCode?: string;
}

export async function addFreeShippingCondition(
  schemaName: string,
  methodId: string,
  input: AddFreeShippingConditionInput,
) {
  return withTenantSchema(schemaName, async (db) => {
    const [method] = await db
      .select({ type: shippingMethods.type })
      .from(shippingMethods)
      .where(eq(shippingMethods.id, methodId))
      .limit(1);

    if (!method) throw new NotFoundError('ShippingMethod', methodId);
    if (method.type !== 'free') {
      throw new ValidationError('Conditions can only be added to free shipping methods');
    }

    if (input.conditionType === 'min_order_value' && input.thresholdKobo === undefined) {
      throw new ValidationError('thresholdKobo is required for min_order_value conditions');
    }
    if (input.conditionType === 'product' && !input.productId) {
      throw new ValidationError('productId is required for product conditions');
    }
    if (input.conditionType === 'category' && !input.categoryId) {
      throw new ValidationError('categoryId is required for category conditions');
    }
    if (input.conditionType === 'promo_code' && !input.promoCode) {
      throw new ValidationError('promoCode is required for promo_code conditions');
    }

    const id = uuidv4();
    await db.insert(freeShippingConditions).values({
      id,
      methodId,
      conditionType: input.conditionType,
      thresholdKobo: input.thresholdKobo ?? null,
      productId: input.productId ?? null,
      categoryId: input.categoryId ?? null,
      promoCode: input.promoCode ?? null,
    });

    const [condition] = await db
      .select()
      .from(freeShippingConditions)
      .where(eq(freeShippingConditions.id, id));
    return condition!;
  });
}

export async function listFreeShippingConditions(schemaName: string, methodId: string) {
  return withTenantSchema(schemaName, (db) =>
    db.select().from(freeShippingConditions).where(eq(freeShippingConditions.methodId, methodId)),
  );
}

export async function deleteFreeShippingCondition(schemaName: string, conditionId: string) {
  return withTenantSchema(schemaName, (db) =>
    db.delete(freeShippingConditions).where(eq(freeShippingConditions.id, conditionId)),
  );
}

// ─── Pick-up Locations ────────────────────────────────────────────────────────

export type PickupLocationType = 'merchant_branch' | 'third_party';

export interface CreatePickupLocationInput {
  name: string;
  locationType: PickupLocationType;
  locationId?: string;  // required when locationType = 'merchant_branch'
  providerName?: string;
  address: string;
  state?: string;
  phone?: string;
  operatingHours?: string;
}

export async function createPickupLocation(
  schemaName: string,
  input: CreatePickupLocationInput,
) {
  if (input.locationType === 'merchant_branch' && !input.locationId) {
    throw new ValidationError('locationId is required for merchant_branch pick-up locations');
  }
  if (input.state && !isValidNgState(input.state)) {
    throw new ValidationError(`Invalid Nigerian state: ${input.state}`);
  }

  return withTenantSchema(schemaName, async (db) => {
    if (input.locationId) {
      const [loc] = await db
        .select({ id: locations.id })
        .from(locations)
        .where(eq(locations.id, input.locationId))
        .limit(1);
      if (!loc) throw new NotFoundError('Location', input.locationId);
    }

    const id = uuidv4();
    await db.insert(pickupLocations).values({
      id,
      name: input.name,
      locationType: input.locationType,
      locationId: input.locationId ?? null,
      providerName: input.providerName ?? null,
      address: input.address,
      state: input.state ?? null,
      phone: input.phone ?? null,
      operatingHours: input.operatingHours ?? null,
    });

    const [pl] = await db.select().from(pickupLocations).where(eq(pickupLocations.id, id));
    return pl!;
  });
}

export async function listPickupLocations(
  schemaName: string,
  filters?: { state?: string; activeOnly?: boolean },
) {
  return withTenantSchema(schemaName, async (db) => {
    const conditions = [];
    if (filters?.activeOnly !== false) conditions.push(eq(pickupLocations.isActive, true));
    if (filters?.state) conditions.push(eq(pickupLocations.state, filters.state));

    return db
      .select()
      .from(pickupLocations)
      .where(conditions.length ? and(...conditions) : undefined);
  });
}

export async function updatePickupLocation(
  schemaName: string,
  pickupLocationId: string,
  input: Partial<CreatePickupLocationInput> & { isActive?: boolean },
) {
  if (input.state && !isValidNgState(input.state)) {
    throw new ValidationError(`Invalid Nigerian state: ${input.state}`);
  }
  return withTenantSchema(schemaName, (db) =>
    db
      .update(pickupLocations)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(pickupLocations.id, pickupLocationId)),
  );
}
