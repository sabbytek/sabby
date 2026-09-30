import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from '@fastify/type-provider-zod';
import { requireAuth } from '../../shared/middleware/auth.js';
import { resolveTenant } from '../../shared/middleware/tenant.js';
import { requireFeature } from '../../shared/middleware/feature-gate.js';
import { createContext } from '../../shared/http/context.js';
import { sendSuccess, sendCreated } from '../../shared/http/response.js';
import * as controller from './controller.js';
import {
  createZoneBodySchema,
  updateZoneBodySchema,
  idParamsSchema,
  createMethodBodySchema,
  updateMethodBodySchema,
  addRateBodySchema,
  rateParamsSchema,
  addConditionBodySchema,
  conditionParamsSchema,
  createPickupBodySchema,
  updatePickupBodySchema,
  pickupListQuerySchema,
  availableQuerySchema,
} from './validators.js';

const managerGuard = [requireAuth, resolveTenant];
const shippingFeature = requireFeature('shipping:manage');

export default async function shippingRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // ── Utility ──────────────────────────────────────────────────────────────────

  typed.get(
    '/states',
    {
      schema: {
        tags: ['Shipping'],
        summary: 'List valid Nigerian state names for zone/rate configuration',
        security: [{ bearerAuth: [] }],
      },
    },
    async (_request, reply) => {
      return sendSuccess(reply, controller.getStates());
    },
  );

  // ── Shipping Zones ────────────────────────────────────────────────────────────

  typed.post(
    '/zones',
    {
      preHandler: [...managerGuard, shippingFeature],
      schema: {
        tags: ['Shipping'],
        summary: 'Create a shipping zone (named group of Nigerian states)',
        security: [{ bearerAuth: [] }],
        body: createZoneBodySchema,
      },
    },
    async (request, reply) => {
      const ctx = createContext(request);
      const zone = await controller.createZone(ctx, request.body);
      return sendCreated(reply, zone);
    },
  );

  typed.get(
    '/zones',
    {
      preHandler: managerGuard,
      schema: {
        tags: ['Shipping'],
        summary: 'List shipping zones',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const ctx = createContext(request);
      const zones = await controller.listZones(ctx);
      return sendSuccess(reply, zones);
    },
  );

  typed.patch(
    '/zones/:id',
    {
      preHandler: [...managerGuard, shippingFeature],
      schema: {
        tags: ['Shipping'],
        summary: 'Update a shipping zone',
        security: [{ bearerAuth: [] }],
        params: idParamsSchema,
        body: updateZoneBodySchema,
      },
    },
    async (request, reply) => {
      const ctx = createContext(request);
      await controller.updateZone(ctx, request.params.id, request.body);
      return sendSuccess(reply, { message: 'Zone updated' });
    },
  );

  typed.delete(
    '/zones/:id',
    {
      preHandler: [...managerGuard, shippingFeature],
      schema: {
        tags: ['Shipping'],
        summary: 'Delete a shipping zone',
        security: [{ bearerAuth: [] }],
        params: idParamsSchema,
      },
    },
    async (request, reply) => {
      const ctx = createContext(request);
      await controller.deleteZone(ctx, request.params.id);
      return sendSuccess(reply, { message: 'Zone deleted' });
    },
  );

  // ── Shipping Methods ──────────────────────────────────────────────────────────

  typed.post(
    '/methods',
    {
      preHandler: [...managerGuard, shippingFeature],
      schema: {
        tags: ['Shipping'],
        summary: 'Create a shipping method',
        description: [
          'type values: flat_rate | zone_rate | value_rate | weight_rate | automated | free | pick_up.',
          'flat_rate requires flatRateKobo.',
          'free with isFreeAlways=true is always visible at checkout.',
          'free without isFreeAlways uses conditions (POST /shipping/methods/:id/conditions).',
          'zone_rate / value_rate / weight_rate require rates (POST /shipping/methods/:id/rates).',
          'automated uses the configured logistics provider for a live quote.',
          'pick_up always returns NGN 0 — customer must also choose a pick-up location.',
        ].join(' '),
        security: [{ bearerAuth: [] }],
        body: createMethodBodySchema,
      },
    },
    async (request, reply) => {
      const ctx = createContext(request);
      const method = await controller.createMethod(ctx, request.body);
      return sendCreated(reply, method);
    },
  );

  typed.get(
    '/methods',
    {
      preHandler: managerGuard,
      schema: {
        tags: ['Shipping'],
        summary: 'List all shipping methods',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const ctx = createContext(request);
      const methods = await controller.listMethods(ctx);
      return sendSuccess(reply, methods);
    },
  );

  typed.patch(
    '/methods/:id',
    {
      preHandler: [...managerGuard, shippingFeature],
      schema: {
        tags: ['Shipping'],
        summary: 'Update a shipping method',
        security: [{ bearerAuth: [] }],
        params: idParamsSchema,
        body: updateMethodBodySchema,
      },
    },
    async (request, reply) => {
      const ctx = createContext(request);
      await controller.updateMethod(ctx, request.params.id, request.body);
      return sendSuccess(reply, { message: 'Method updated' });
    },
  );

  // ── Shipping Rates (zone / value / weight) ────────────────────────────────────

  typed.post(
    '/methods/:id/rates',
    {
      preHandler: [...managerGuard, shippingFeature],
      schema: {
        tags: ['Shipping'],
        summary: 'Add a rate row to a zone_rate / value_rate / weight_rate method',
        description:
          'For zone_rate: set zoneId (or omit for catch-all). For value_rate: set min/maxOrderValueKobo. For weight_rate: set min/maxWeightKg. maxOrderValueKobo / maxWeightKg can be omitted for "and above" tiers.',
        security: [{ bearerAuth: [] }],
        params: idParamsSchema,
        body: addRateBodySchema,
      },
    },
    async (request, reply) => {
      const ctx = createContext(request);
      const rate = await controller.addRate(ctx, request.params.id, request.body);
      return sendCreated(reply, rate);
    },
  );

  typed.get(
    '/methods/:id/rates',
    {
      preHandler: managerGuard,
      schema: {
        tags: ['Shipping'],
        summary: 'List rate rows for a shipping method',
        security: [{ bearerAuth: [] }],
        params: idParamsSchema,
      },
    },
    async (request, reply) => {
      const ctx = createContext(request);
      const rates = await controller.listRates(ctx, request.params.id);
      return sendSuccess(reply, rates);
    },
  );

  typed.delete(
    '/methods/:id/rates/:rateId',
    {
      preHandler: [...managerGuard, shippingFeature],
      schema: {
        tags: ['Shipping'],
        summary: 'Remove a rate row from a shipping method',
        security: [{ bearerAuth: [] }],
        params: rateParamsSchema,
      },
    },
    async (request, reply) => {
      const ctx = createContext(request);
      await controller.deleteRate(ctx, request.params.rateId);
      return sendSuccess(reply, { message: 'Rate deleted' });
    },
  );

  // ── Free Shipping Conditions ───────────────────────────────────────────────────

  typed.post(
    '/methods/:id/conditions',
    {
      preHandler: [...managerGuard, shippingFeature],
      schema: {
        tags: ['Shipping'],
        summary: 'Add a condition to a free shipping method',
        security: [{ bearerAuth: [] }],
        params: idParamsSchema,
        body: addConditionBodySchema,
      },
    },
    async (request, reply) => {
      const ctx = createContext(request);
      const condition = await controller.addCondition(ctx, request.params.id, request.body);
      return sendCreated(reply, condition);
    },
  );

  typed.get(
    '/methods/:id/conditions',
    {
      preHandler: managerGuard,
      schema: {
        tags: ['Shipping'],
        summary: 'List conditions for a free shipping method',
        security: [{ bearerAuth: [] }],
        params: idParamsSchema,
      },
    },
    async (request, reply) => {
      const ctx = createContext(request);
      const conditions = await controller.listConditions(ctx, request.params.id);
      return sendSuccess(reply, conditions);
    },
  );

  typed.delete(
    '/methods/:id/conditions/:conditionId',
    {
      preHandler: [...managerGuard, shippingFeature],
      schema: {
        tags: ['Shipping'],
        summary: 'Remove a condition from a free shipping method',
        security: [{ bearerAuth: [] }],
        params: conditionParamsSchema,
      },
    },
    async (request, reply) => {
      const ctx = createContext(request);
      await controller.deleteCondition(ctx, request.params.conditionId);
      return sendSuccess(reply, { message: 'Condition deleted' });
    },
  );

  // ── Pick-up Locations ─────────────────────────────────────────────────────────

  typed.post(
    '/pickup-locations',
    {
      preHandler: [...managerGuard, shippingFeature],
      schema: {
        tags: ['Shipping'],
        summary: 'Create a pick-up location (merchant branch or third-party collection point)',
        security: [{ bearerAuth: [] }],
        body: createPickupBodySchema,
      },
    },
    async (request, reply) => {
      const ctx = createContext(request);
      const pl = await controller.createPickup(ctx, request.body);
      return sendCreated(reply, pl);
    },
  );

  typed.get(
    '/pickup-locations',
    {
      schema: {
        tags: ['Shipping'],
        summary: 'List active pick-up locations (public — no auth required)',
        description:
          'Called by the customer-facing storefront. Filter by Nigerian state with ?state=Lagos.',
        querystring: pickupListQuerySchema,
      },
    },
    async (request, reply) => {
      const ctx = createContext(request);
      const locs = await controller.listPickups(ctx, request.query);
      return sendSuccess(reply, locs);
    },
  );

  typed.patch(
    '/pickup-locations/:id',
    {
      preHandler: [...managerGuard, shippingFeature],
      schema: {
        tags: ['Shipping'],
        summary: 'Update a pick-up location',
        security: [{ bearerAuth: [] }],
        params: idParamsSchema,
        body: updatePickupBodySchema,
      },
    },
    async (request, reply) => {
      const ctx = createContext(request);
      await controller.updatePickup(ctx, request.params.id, request.body);
      return sendSuccess(reply, { message: 'Pickup location updated' });
    },
  );

  // ── Checkout Calculator ───────────────────────────────────────────────────────

  typed.get(
    '/available',
    {
      schema: {
        tags: ['Shipping'],
        summary: 'Get available shipping methods and fees for a given checkout context',
        description:
          'Called at checkout after the customer provides their delivery details. Returns options sorted cheapest-first. automated methods are excluded — use GET /shipping/quote for live provider quotes.',
        querystring: availableQuerySchema,
      },
    },
    async (request, reply) => {
      const ctx = createContext(request);
      const options = await controller.getAvailable(ctx, request.query);
      return sendSuccess(reply, options);
    },
  );
}
