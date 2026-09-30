import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from '@fastify/type-provider-zod';
import { requireAuth } from '../../shared/middleware/auth.js';
import { resolveTenant } from '../../shared/middleware/tenant.js';
import { requireFeature } from '../../shared/middleware/feature-gate.js';
import { createContext } from '../../shared/http/context.js';
import { sendSuccess, sendCreated } from '../../shared/http/response.js';
import * as controller from './controller.js';
import { createExpenseBodySchema, listExpensesQuerySchema, idParamsSchema } from './validators.js';

const guard = [requireAuth, resolveTenant, requireFeature('expenses:track')];

export default function expensesRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post(
    '/',
    {
      preHandler: guard,
      schema: {
        tags: ['Expenses'],
        summary: 'Record an expense',
        security: [{ bearerAuth: [] }],
        body: createExpenseBodySchema,
      },
    },
    async (request, reply) => {
      const ctx = createContext(request);
      const expense = await controller.create(ctx, request.body);
      return sendCreated(reply, expense);
    },
  );

  typed.get(
    '/',
    {
      preHandler: guard,
      schema: {
        tags: ['Expenses'],
        summary: 'List expenses (paginated)',
        security: [{ bearerAuth: [] }],
        querystring: listExpensesQuerySchema,
      },
    },
    async (request, reply) => {
      const ctx = createContext(request);
      const result = await controller.list(ctx, request.query);
      return sendSuccess(reply, result);
    },
  );

  typed.get(
    '/:id',
    {
      preHandler: guard,
      schema: {
        tags: ['Expenses'],
        summary: 'Get an expense record',
        security: [{ bearerAuth: [] }],
        params: idParamsSchema,
      },
    },
    async (request, reply) => {
      const ctx = createContext(request);
      const expense = await controller.get(ctx, request.params.id);
      return sendSuccess(reply, expense);
    },
  );
}
