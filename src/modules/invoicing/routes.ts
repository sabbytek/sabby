import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from '@fastify/type-provider-zod';
import { requireAuth } from '../../shared/middleware/auth.js';
import { resolveTenant } from '../../shared/middleware/tenant.js';
import { requireFeature } from '../../shared/middleware/feature-gate.js';
import { createContext } from '../../shared/http/context.js';
import { sendSuccess, sendCreated } from '../../shared/http/response.js';
import * as controller from './controller.js';
import { createInvoiceBodySchema, listInvoicesQuerySchema, idParamsSchema } from './validators.js';

const guard = [requireAuth, resolveTenant, requireFeature('invoicing:generate')];

export default function invoicingRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // ─── POST /invoices — generate invoice for an order ─────────────────────────
  typed.post(
    '/',
    {
      preHandler: guard,
      schema: {
        tags: ['Invoicing'],
        summary: 'Generate an invoice for an order',
        description:
          'Creates an invoice record and enqueues async PDF generation. ' +
          'Poll GET /invoices/:id to check when pdfUrl is populated.',
        security: [{ bearerAuth: [] }],
        body: createInvoiceBodySchema,
      },
    },
    async (request, reply) => {
      const ctx = createContext(request);
      const invoice = await controller.create(ctx, request.body);
      return sendCreated(reply, invoice);
    },
  );

  // ─── GET /invoices — list invoices (optionally filter by orderId) ────────────
  typed.get(
    '/',
    {
      preHandler: guard,
      schema: {
        tags: ['Invoicing'],
        summary: 'List invoices',
        security: [{ bearerAuth: [] }],
        querystring: listInvoicesQuerySchema,
      },
    },
    async (request, reply) => {
      const ctx = createContext(request);
      const items = await controller.list(ctx, request.query);
      return sendSuccess(reply, items);
    },
  );

  // ─── GET /invoices/:id — get invoice with order details ─────────────────────
  typed.get(
    '/:id',
    {
      preHandler: guard,
      schema: {
        tags: ['Invoicing'],
        summary: 'Get an invoice (with order details and line items)',
        security: [{ bearerAuth: [] }],
        params: idParamsSchema,
      },
    },
    async (request, reply) => {
      const ctx = createContext(request);
      const invoice = await controller.get(ctx, request.params.id);
      return sendSuccess(reply, invoice);
    },
  );
}
