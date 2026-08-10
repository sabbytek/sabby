import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from '@fastify/type-provider-zod';
import { requireAuth } from '../../shared/middleware/auth.js';
import { resolveTenant } from '../../shared/middleware/tenant.js';
import { requireFeature } from '../../shared/middleware/feature-gate.js';
import { createContext } from '../../shared/http/context.js';
import { sendSuccess } from '../../shared/http/response.js';
import * as controller from './controller.js';
import { initiateSubscriptionBodySchema } from './validators.js';

const guard = [requireAuth, resolveTenant, requireFeature('subscriptions:manage')];

export default function subscriptionsRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // ─── GET /subscriptions ────────────────────────────────────────────────────
  typed.get('/', {
    preHandler: guard,
    schema: {
      tags: ['Subscriptions'],
      summary: 'Get current subscription status and plan tier',
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const ctx = createContext(request);
    const sub = await controller.getSubscriptionHandler(ctx);
    sendSuccess(reply, sub);
  });

  // ─── POST /subscriptions/initiate ─────────────────────────────────────────
  typed.post('/initiate', {
    preHandler: guard,
    schema: {
      tags: ['Subscriptions'],
      summary: 'Initiate a subscription payment via Paystack',
      description:
        'Returns a Paystack authorization URL. On successful payment Paystack fires a ' +
        'charge.success webhook which activates the subscription automatically.',
      security: [{ bearerAuth: [] }],
      body: initiateSubscriptionBodySchema,
    },
  }, async (request, reply) => {
    const ctx = createContext(request);
    const result = await controller.initiateSubscriptionHandler(ctx, request.body);
    sendSuccess(reply, result);
  });

  // ─── POST /subscriptions/cancel ───────────────────────────────────────────
  typed.post('/cancel', {
    preHandler: guard,
    schema: {
      tags: ['Subscriptions'],
      summary: 'Cancel the active subscription',
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const ctx = createContext(request);
    await controller.cancelSubscriptionHandler(ctx);
    sendSuccess(reply, null);
  });
}
