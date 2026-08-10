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
  createLocationBodySchema,
  updateLocationBodySchema,
  idParamsSchema,
} from './validators.js';

const readGuard = [requireAuth, resolveTenant, requireFeature('locations:manage')];
const writeGuard = [requireAuth, resolveTenant, requireFeature('locations:manage'), requireManager];

export default async function locationsRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get('/', {
    preHandler: readGuard,
    schema: {
      tags: ['Locations'],
      summary: 'List all locations',
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const ctx = createContext(request);
    const items = await controller.list(ctx);
    sendSuccess(reply, items);
  });

  typed.get('/:id', {
    preHandler: readGuard,
    schema: {
      tags: ['Locations'],
      summary: 'Get a location',
      security: [{ bearerAuth: [] }],
      params: idParamsSchema,
    },
  }, async (request, reply) => {
    const ctx = createContext(request);
    const loc = await controller.get(ctx, request.params.id);
    sendSuccess(reply, loc);
  });

  typed.post('/', {
    preHandler: writeGuard,
    schema: {
      tags: ['Locations'],
      summary: 'Create a location',
      security: [{ bearerAuth: [] }],
      body: createLocationBodySchema,
    },
  }, async (request, reply) => {
    const ctx = createContext(request);
    const loc = await controller.create(ctx, request.body);
    sendCreated(reply, loc);
  });

  typed.patch('/:id', {
    preHandler: writeGuard,
    schema: {
      tags: ['Locations'],
      summary: 'Update a location',
      security: [{ bearerAuth: [] }],
      params: idParamsSchema,
      body: updateLocationBodySchema,
    },
  }, async (request, reply) => {
    const ctx = createContext(request);
    const loc = await controller.update(ctx, request.params.id, request.body);
    sendSuccess(reply, loc);
  });

  typed.delete('/:id', {
    preHandler: writeGuard,
    schema: {
      tags: ['Locations'],
      summary: 'Deactivate a location',
      security: [{ bearerAuth: [] }],
      params: idParamsSchema,
    },
  }, async (request, reply) => {
    const ctx = createContext(request);
    await controller.deactivate(ctx, request.params.id);
    reply.status(204).send();
  });
}
