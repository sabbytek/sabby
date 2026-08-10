import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from '@fastify/type-provider-zod';
import { requireAuth } from '../../shared/middleware/auth.js';
import { resolveTenant } from '../../shared/middleware/tenant.js';
import { requireFeature } from '../../shared/middleware/feature-gate.js';
import { requireManager } from '../../shared/middleware/auth.js';
import { createContext } from '../../shared/http/context.js';
import { sendSuccess, sendCreated } from '../../shared/http/response.js';
import * as controller from './controller.js';
import {
  createOrderBodySchema,
  listOrdersQuerySchema,
  idParamsSchema,
} from './validators.js';

const readGuard = [requireAuth, resolveTenant, requireFeature('orders:create')];
const managerGuard = [requireAuth, resolveTenant, requireManager, requireFeature('orders:create')];

export default async function ordersRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // ─── Create draft order ────────────────────────────────────────────────────

  typed.post('/', {
    preHandler: readGuard,
    schema: {
      tags: ['Orders'],
      summary: 'Create a draft order',
      security: [{ bearerAuth: [] }],
      body: createOrderBodySchema,
    },
  }, async (request, reply) => {
    const ctx = createContext(request);
    const order = await controller.create(ctx, request.body);
    sendCreated(reply, order);
  });

  // ─── List orders ───────────────────────────────────────────────────────────

  typed.get('/', {
    preHandler: readGuard,
    schema: {
      tags: ['Orders'],
      summary: 'List orders (paginated, filterable)',
      security: [{ bearerAuth: [] }],
      querystring: listOrdersQuerySchema,
    },
  }, async (request, reply) => {
    const ctx = createContext(request);
    const result = await controller.list(ctx, request.query);
    sendSuccess(reply, result);
  });

  // ─── Get single order ─────────────────────────────────────────────────────

  typed.get('/:id', {
    preHandler: readGuard,
    schema: {
      tags: ['Orders'],
      summary: 'Get a single order with its line items',
      security: [{ bearerAuth: [] }],
      params: idParamsSchema,
    },
  }, async (request, reply) => {
    const ctx = createContext(request);
    const order = await controller.get(ctx, request.params.id);
    sendSuccess(reply, order);
  });

  // ─── State transitions ────────────────────────────────────────────────────

  typed.post('/:id/confirm', {
    preHandler: managerGuard,
    schema: {
      tags: ['Orders'],
      summary: 'Confirm an order (validates and deducts stock)',
      security: [{ bearerAuth: [] }],
      params: idParamsSchema,
    },
  }, async (request, reply) => {
    const ctx = createContext(request);
    const order = await controller.confirm(ctx, request.params.id);
    sendSuccess(reply, order);
  });

  typed.post('/:id/process', {
    preHandler: readGuard,
    schema: {
      tags: ['Orders'],
      summary: 'Move an order to processing',
      security: [{ bearerAuth: [] }],
      params: idParamsSchema,
    },
  }, async (request, reply) => {
    const ctx = createContext(request);
    const order = await controller.process(ctx, request.params.id);
    sendSuccess(reply, order);
  });

  typed.post('/:id/fulfil', {
    preHandler: readGuard,
    schema: {
      tags: ['Orders'],
      summary: 'Mark an order as fulfilled',
      security: [{ bearerAuth: [] }],
      params: idParamsSchema,
    },
  }, async (request, reply) => {
    const ctx = createContext(request);
    const order = await controller.fulfil(ctx, request.params.id);
    sendSuccess(reply, order);
  });

  typed.post('/:id/cancel', {
    preHandler: managerGuard,
    schema: {
      tags: ['Orders'],
      summary: 'Cancel an order (restores stock if previously confirmed)',
      security: [{ bearerAuth: [] }],
      params: idParamsSchema,
    },
  }, async (request, reply) => {
    const ctx = createContext(request);
    const order = await controller.cancel(ctx, request.params.id);
    sendSuccess(reply, order);
  });
}
