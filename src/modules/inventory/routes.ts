import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from '@fastify/type-provider-zod';
import { requireAuth } from '../../shared/middleware/auth.js';
import { resolveTenant } from '../../shared/middleware/tenant.js';
import { requireManager } from '../../shared/middleware/auth.js';
import { requireFeature } from '../../shared/middleware/feature-gate.js';
import { createContext } from '../../shared/http/context.js';
import { sendSuccess, sendCreated } from '../../shared/http/response.js';
import * as controller from './controller.js';
import {
  listInventoryQuerySchema,
  receiveStockBodySchema,
  adjustStockBodySchema,
  movementsQuerySchema,
  lowStockQuerySchema,
  availabilityQuerySchema,
  transferStockBodySchema,
  inventoryItemResponseSchema,
  availabilityResponseSchema,
  transferResponseSchema,
  type ListInventoryQuery,
} from './validators.js';
import { successResponseSchema, createdResponseSchema } from '../../shared/http/schemas.js';

const readGuard = [requireAuth, resolveTenant, requireFeature('inventory:track')];
const writeGuard = [requireAuth, resolveTenant, requireManager, requireFeature('inventory:track')];

export default function inventoryRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get('/', {
    preHandler: readGuard,
    schema: {
      tags: ['Inventory'],
      summary: 'List inventory levels',
      security: [{ bearerAuth: [] }],
      querystring: listInventoryQuerySchema,
    },
  }, async (request, reply) => {
    const ctx = createContext(request);
    const query = request.query as ListInventoryQuery;
    const data = await controller.list(ctx, query) as unknown;
    sendSuccess(reply, data);
  });

  typed.post('/receive', {
    preHandler: writeGuard,
    schema: {
      tags: ['Inventory'],
      summary: 'Receive stock into a location',
      security: [{ bearerAuth: [] }],
      body: receiveStockBodySchema,
    },
  }, async (request, reply) => {
    const ctx = createContext(request);
    const data = await controller.receive(ctx, request.body);
    sendCreated(reply, data);
  });

  typed.post('/adjust', {
    preHandler: writeGuard,
    schema: {
      tags: ['Inventory'],
      summary: 'Manually adjust stock (positive = add, negative = write-off)',
      security: [{ bearerAuth: [] }],
      body: adjustStockBodySchema,
    },
  }, async (request, reply) => {
    const ctx = createContext(request);
    const data = await controller.adjust(ctx, request.body);
    sendSuccess(reply, data);
  });

  typed.get('/movements', {
    preHandler: readGuard,
    schema: {
      tags: ['Inventory'],
      summary: 'List stock movements (audit trail)',
      security: [{ bearerAuth: [] }],
      querystring: movementsQuerySchema,
    },
  }, async (request, reply) => {
    const ctx = createContext(request);
    const data = await controller.movements(ctx, request.query);
    sendSuccess(reply, data);
  });

  typed.get('/low-stock', {
    preHandler: [requireAuth, resolveTenant, requireFeature('inventory:alerts')],
    schema: {
      tags: ['Inventory'],
      summary: 'List variants at or below their low-stock threshold',
      security: [{ bearerAuth: [] }],
      querystring: lowStockQuerySchema,
    },
  }, async (request, reply) => {
    const ctx = createContext(request);
    const data = await controller.lowStock(ctx, request.query.locationId);
    sendSuccess(reply, data);
  });

  typed.get('/availability', {
    preHandler: readGuard,
    schema: {
      tags: ['Inventory'],
      summary: 'Check stock availability across all locations',
      description: 'Returns stock levels at each branch so staff can see where to source from or transfer stock. Useful for multi-location businesses like pharmacy chains.',
      security: [{ bearerAuth: [] }],
      querystring: availabilityQuerySchema,
      response: {
        200: successResponseSchema(availabilityResponseSchema),
      },
    },
  }, async (request, reply) => {
    const ctx = createContext(request);
    const data = await controller.availability(ctx, request.query);
    sendSuccess(reply, data);
  });

  typed.post('/transfer', {
    preHandler: writeGuard,
    schema: {
      tags: ['Inventory'],
      summary: 'Transfer stock between locations',
      description: 'Moves inventory from one branch to another within the same tenant. Creates audit trail with paired stock movements (OUT at source, IN at destination).',
      security: [{ bearerAuth: [] }],
      body: transferStockBodySchema,
      response: {
        201: createdResponseSchema(transferResponseSchema),
      },
    },
  }, async (request, reply) => {
    const ctx = createContext(request);
    const data = await controller.transfer(ctx, request.body);
    sendCreated(reply, data);
  });
}
