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

export function getStates() {
  return NG_STATES;
}

// ── Shipping Zones ─────────────────────────────────────────────────────────────

export async function createZone(ctx: RequestContext, input: { name: string; states: string[] }) {
  return createShippingZone(ctx.schema, input);
}

export async function listZones(ctx: RequestContext) {
  return listShippingZones(ctx.schema);
}

export async function updateZone(ctx: RequestContext, zoneId: string, input: { name?: string; states?: string[] }) {
  return updateShippingZone(ctx.schema, zoneId, input);
}

export async function deleteZone(ctx: RequestContext, zoneId: string) {
  return deleteShippingZone(ctx.schema, zoneId);
}

// ── Shipping Methods ───────────────────────────────────────────────────────────

export async function createMethod(ctx: RequestContext, input: CreateShippingMethodInput) {
  return createShippingMethod(ctx.schema, input);
}

export async function listMethods(ctx: RequestContext) {
  return listShippingMethods(ctx.schema);
}

export async function updateMethod(ctx: RequestContext, methodId: string, input: Partial<CreateShippingMethodInput> & { isActive?: boolean }) {
  return updateShippingMethod(ctx.schema, methodId, input);
}

// ── Shipping Rates ─────────────────────────────────────────────────────────────

export async function addRate(ctx: RequestContext, methodId: string, input: AddShippingRateInput) {
  return addShippingRate(ctx.schema, methodId, input);
}

export async function listRates(ctx: RequestContext, methodId: string) {
  return listShippingRates(ctx.schema, methodId);
}

export async function deleteRate(ctx: RequestContext, rateId: string) {
  return deleteShippingRate(ctx.schema, rateId);
}

// ── Free Shipping Conditions ───────────────────────────────────────────────────

export async function addCondition(ctx: RequestContext, methodId: string, input: { conditionType: string; thresholdKobo?: number; productId?: string; categoryId?: string; promoCode?: string }) {
  return addFreeShippingCondition(ctx.schema, methodId, input as never);
}

export async function listConditions(ctx: RequestContext, methodId: string) {
  return listFreeShippingConditions(ctx.schema, methodId);
}

export async function deleteCondition(ctx: RequestContext, conditionId: string) {
  return deleteFreeShippingCondition(ctx.schema, conditionId);
}

// ── Pick-up Locations ──────────────────────────────────────────────────────────

export async function createPickup(ctx: RequestContext, input: { name: string; locationType: string; locationId?: string; providerName?: string; address: string; state?: string; phone?: string; operatingHours?: string }) {
  return createPickupLocation(ctx.schema, input as never);
}

export async function listPickups(ctx: RequestContext, query: { state?: string }) {
  return listPickupLocations(ctx.schema, {
    ...(query.state ? { state: query.state } : {}),
    activeOnly: true,
  });
}

export async function updatePickup(ctx: RequestContext, locationId: string, input: { name?: string; address?: string; state?: string; phone?: string; operatingHours?: string; isActive?: boolean }) {
  return updatePickupLocation(ctx.schema, locationId, input);
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

export async function getAvailable(ctx: RequestContext, query: AvailableShippingQuery) {
  return getAvailableShippingOptions(ctx.schema, {
    orderValueKobo: parseInt(query.orderValueKobo),
    ...(query.destinationState ? { destinationState: query.destinationState } : {}),
    ...(query.totalWeightKg ? { totalWeightKg: parseFloat(query.totalWeightKg) } : {}),
    ...(query.promoCode ? { promoCode: query.promoCode } : {}),
    ...(query.itemProductIds ? { itemProductIds: query.itemProductIds.split(',') } : {}),
    ...(query.itemCategoryIds ? { itemCategoryIds: query.itemCategoryIds.split(',') } : {}),
  });
}
