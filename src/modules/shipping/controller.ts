/**
 * Shipping controller — orchestrates HTTP concerns for shipping configuration.
 */

import type { RequestContext } from '../../shared/types/controller.js';
import {
  createShippingZone,
  listShippingZones,
  updateShippingZone,
  deleteShippingZone,
  createShippingMethod,
  listShippingMethods,
  updateShippingMethod,
  addShippingRate,
  listShippingRates,
  deleteShippingRate,
  addFreeShippingCondition,
  listFreeShippingConditions,
  deleteFreeShippingCondition,
  createPickupLocation,
  listPickupLocations,
  updatePickupLocation,
} from './service.js';
import type { CreateShippingMethodInput, AddShippingRateInput } from './service.js';
import { getAvailableShippingOptions } from './calculator.js';
import { NG_STATES } from './ng-states.js';

// ── Utility ────────────────────────────────────────────────────────────────────

export function getStates(): readonly string[] {
  return NG_STATES;
}

// ── Shipping Zones ─────────────────────────────────────────────────────────────

export async function createZone(ctx: RequestContext, input: { name: string; states: string[] }): Promise<unknown> {
  const result = await createShippingZone(ctx.schema, input);
  return result;
}

export async function listZones(ctx: RequestContext): Promise<unknown> {
  const result = await listShippingZones(ctx.schema);
  return result;
}

export async function updateZone(ctx: RequestContext, zoneId: string, input: { name?: string; states?: string[] }): Promise<unknown> {
  const result = await updateShippingZone(ctx.schema, zoneId, input);
  return result;
}

export async function deleteZone(ctx: RequestContext, zoneId: string): Promise<unknown> {
  const result = await deleteShippingZone(ctx.schema, zoneId);
  return result;
}

// ── Shipping Methods ───────────────────────────────────────────────────────────

export async function createMethod(ctx: RequestContext, input: CreateShippingMethodInput): Promise<unknown> {
  const result = await createShippingMethod(ctx.schema, input);
  return result;
}

export async function listMethods(ctx: RequestContext): Promise<unknown> {
  const result = await listShippingMethods(ctx.schema);
  return result;
}

export async function updateMethod(ctx: RequestContext, methodId: string, input: Partial<CreateShippingMethodInput> & { isActive?: boolean }): Promise<unknown> {
  const result = await updateShippingMethod(ctx.schema, methodId, input);
  return result;
}

// ── Shipping Rates ─────────────────────────────────────────────────────────────

export async function addRate(ctx: RequestContext, methodId: string, input: AddShippingRateInput): Promise<unknown> {
  const result = await addShippingRate(ctx.schema, methodId, input);
  return result;
}

export async function listRates(ctx: RequestContext, methodId: string): Promise<unknown> {
  const result = await listShippingRates(ctx.schema, methodId);
  return result;
}

export async function deleteRate(ctx: RequestContext, rateId: string): Promise<unknown> {
  const result = await deleteShippingRate(ctx.schema, rateId);
  return result;
}

// ── Free Shipping Conditions ───────────────────────────────────────────────────

export async function addCondition(ctx: RequestContext, methodId: string, input: { conditionType: string; thresholdKobo?: number; productId?: string; categoryId?: string; promoCode?: string }): Promise<unknown> {
  const result = await addFreeShippingCondition(ctx.schema, methodId, input as never);
  return result;
}

export async function listConditions(ctx: RequestContext, methodId: string): Promise<unknown> {
  const result = await listFreeShippingConditions(ctx.schema, methodId);
  return result;
}

export async function deleteCondition(ctx: RequestContext, conditionId: string): Promise<unknown> {
  const result = await deleteFreeShippingCondition(ctx.schema, conditionId);
  return result;
}

// ── Pick-up Locations ──────────────────────────────────────────────────────────

export async function createPickup(ctx: RequestContext, input: { name: string; locationType: string; locationId?: string; providerName?: string; address: string; state?: string; phone?: string; operatingHours?: string }): Promise<unknown> {
  const result = await createPickupLocation(ctx.schema, input as never);
  return result;
}

export async function listPickups(ctx: RequestContext, query: { state?: string }): Promise<unknown> {
  const result = await listPickupLocations(ctx.schema, {
    ...(query.state ? { state: query.state } : {}),
    activeOnly: true,
  });
  return result;
}

export async function updatePickup(ctx: RequestContext, locationId: string, input: { name?: string; address?: string; state?: string; phone?: string; operatingHours?: string; isActive?: boolean }): Promise<unknown> {
  const result = await updatePickupLocation(ctx.schema, locationId, input);
  return result;
}

// ── Checkout Calculator ────────────────────────────────────────────────────────

export interface AvailableShippingQuery {
  orderValueKobo: string;
  destinationState?: string;
  totalWeightKg?: string;
  promoCode?: string;
  itemProductIds?: string;
  itemCategoryIds?: string;
}

export async function getAvailable(ctx: RequestContext, query: AvailableShippingQuery): Promise<unknown> {
  const result = await getAvailableShippingOptions(ctx.schema, {
    orderValueKobo: parseInt(query.orderValueKobo),
    ...(query.destinationState ? { destinationState: query.destinationState } : {}),
    ...(query.totalWeightKg ? { totalWeightKg: parseFloat(query.totalWeightKg) } : {}),
    ...(query.promoCode ? { promoCode: query.promoCode } : {}),
    ...(query.itemProductIds ? { itemProductIds: query.itemProductIds.split(',') } : {}),
    ...(query.itemCategoryIds ? { itemCategoryIds: query.itemCategoryIds.split(',') } : {}),
  });
  return result;
}
