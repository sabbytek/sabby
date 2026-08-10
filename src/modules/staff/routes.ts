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
  inviteStaffBodySchema,
  updateStaffBodySchema,
  idParamsSchema,
} from './validators.js';

const readGuard = [requireAuth, resolveTenant, requireFeature('staff:invite')];
const writeGuard = [requireAuth, resolveTenant, requireFeature('staff:invite'), requireManager];

export default function staffRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get('/', {
    preHandler: readGuard,
    schema: {
      tags: ['Staff'],
      summary: 'List all staff members',
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
      tags: ['Staff'],
      summary: 'Get a staff member',
      security: [{ bearerAuth: [] }],
      params: idParamsSchema,
    },
  }, async (request, reply) => {
    const ctx = createContext(request);
    const member = await controller.get(ctx, request.params.id);
    sendSuccess(reply, member);
  });

  typed.post('/invite', {
    preHandler: writeGuard,
    schema: {
      tags: ['Staff'],
      summary: 'Invite a staff member',
      security: [{ bearerAuth: [] }],
      body: inviteStaffBodySchema,
    },
  }, async (request, reply) => {
    const ctx = createContext(request);
    const member = await controller.invite(ctx, request.body);
    sendCreated(reply, member);
  });

  typed.patch('/:id', {
    preHandler: writeGuard,
    schema: {
      tags: ['Staff'],
      summary: 'Update a staff member',
      security: [{ bearerAuth: [] }],
      params: idParamsSchema,
      body: updateStaffBodySchema,
    },
  }, async (request, reply) => {
    const ctx = createContext(request);
    const member = await controller.update(ctx, request.params.id, request.body);
    sendSuccess(reply, member);
  });

  typed.delete('/:id', {
    preHandler: writeGuard,
    schema: {
      tags: ['Staff'],
      summary: 'Deactivate a staff member',
      security: [{ bearerAuth: [] }],
      params: idParamsSchema,
    },
  }, async (request, reply) => {
    const ctx = createContext(request);
    await controller.deactivate(ctx, request.params.id);
    reply.status(204).send();
  });
}
