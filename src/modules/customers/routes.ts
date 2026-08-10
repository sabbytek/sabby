import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from '@fastify/type-provider-zod';
import { requireAuth } from '../../shared/middleware/auth.js';
import { resolveTenant } from '../../shared/middleware/tenant.js';
import { requireFeature } from '../../shared/middleware/feature-gate.js';
import { createContext } from '../../shared/http/context.js';
import { sendSuccess, sendCreated } from '../../shared/http/response.js';
import * as controller from './controller.js';
import {
  createCustomerBodySchema,
  listCustomersQuerySchema,
  idParamsSchema,
  updateCustomerBodySchema,
} from './validators.js';

const guard = [requireAuth, resolveTenant, requireFeature('customers:manage')];

export default async function customersRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post('/', {
    preHandler: guard,
    schema: {
      tags: ['Customers'],
      summary: 'Create a customer record',
      security: [{ bearerAuth: [] }],
      body: createCustomerBodySchema,
    },
  }, async (request, reply) => {
    const ctx = createContext(request);
    const customer = await controller.create(ctx, request.body);
    sendCreated(reply, customer);
  });

  typed.get('/', {
    preHandler: guard,
    schema: {
      tags: ['Customers'],
      summary: 'List customers (paginated, searchable)',
      security: [{ bearerAuth: [] }],
      querystring: listCustomersQuerySchema,
    },
  }, async (request, reply) => {
    const ctx = createContext(request);
    const result = await controller.list(ctx, request.query);
    sendSuccess(reply, result);
  });

  typed.get('/:id', {
    preHandler: guard,
    schema: {
      tags: ['Customers'],
      summary: 'Get a customer record',
      security: [{ bearerAuth: [] }],
      params: idParamsSchema,
    },
  }, async (request, reply) => {
    const ctx = createContext(request);
    const customer = await controller.get(ctx, request.params.id);
    sendSuccess(reply, customer);
  });

  typed.patch('/:id', {
    preHandler: guard,
    schema: {
      tags: ['Customers'],
      summary: 'Update a customer record',
      security: [{ bearerAuth: [] }],
      params: idParamsSchema,
      body: updateCustomerBodySchema,
    },
  }, async (request, reply) => {
    const ctx = createContext(request);
    const customer = await controller.update(ctx, request.params.id, request.body);
    sendSuccess(reply, customer);
  });
}
