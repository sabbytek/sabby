import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from '@fastify/type-provider-zod';
import { requireAuth } from '../../shared/middleware/auth.js';
import { resolveTenant } from '../../shared/middleware/tenant.js';
import { requireFeature } from '../../shared/middleware/feature-gate.js';
import { requireManager } from '../../shared/middleware/auth.js';
import { createContext } from '../../shared/http/context.js';
import { sendSuccess } from '../../shared/http/response.js';
import * as controller from './controller.js';
import type { LogisticsWebhookPayload } from './service.js';
import {
  configureDispatchBodySchema,
  quoteBodySchema,
  dispatchOrderParamsSchema,
  dispatchOrderBodySchema,
  trackParamsSchema,
  webhookParamsSchema,
} from './validators.js';

export default async function dispatchRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // ─── Configure logistics provider ──────────────────────────────────────────

  typed.post('/configure', {
    preHandler: [requireAuth, resolveTenant, requireFeature('logistics:dispatch'), requireManager],
    schema: {
      tags: ['Dispatch'],
      summary: 'Configure logistics provider for this tenant',
      description:
        'Store encrypted API key + webhook secret for a logistics provider (e.g. traka). ' +
        'For TRAKA: the merchant must first register on TRAKA, get approved, and create an API key. ' +
        'BPOS stores the key encrypted — it is never returned in plaintext.',
      body: configureDispatchBodySchema,
    },
  }, async (request, reply) => {
    const ctx = createContext(request);
    const result = await controller.configure(ctx, request.body);
    sendSuccess(reply, result);
  });

  // ─── Get dispatch config (key masked) ──────────────────────────────────────

  typed.get('/config', {
    preHandler: [requireAuth, resolveTenant, requireFeature('logistics:dispatch')],
    schema: {
      tags: ['Dispatch'],
      summary: 'Get current logistics provider configuration',
    },
  }, async (request, reply) => {
    const ctx = createContext(request);
    const config = await controller.getConfig(ctx);
    sendSuccess(reply, config);
  });

  // ─── Get shipping quote ────────────────────────────────────────────────────

  typed.post('/quote', {
    preHandler: [requireAuth, resolveTenant, requireFeature('logistics:dispatch')],
    schema: {
      tags: ['Dispatch'],
      summary: 'Get a shipping fee quote',
      body: quoteBodySchema,
    },
  }, async (request, reply) => {
    const ctx = createContext(request);
    const result = await controller.quote(ctx, request.body);
    sendSuccess(reply, result);
  });

  // ─── Dispatch an order ─────────────────────────────────────────────────────

  typed.post('/:orderId/dispatch', {
    preHandler: [requireAuth, resolveTenant, requireFeature('logistics:dispatch'), requireManager],
    schema: {
      tags: ['Dispatch'],
      summary: 'Dispatch an order via the configured logistics provider',
      description:
        'Order must be in PROCESSING status and have a deliveryAddress set. ' +
        'On success the order transitions to DISPATCHED.',
      params: dispatchOrderParamsSchema,
      body: dispatchOrderBodySchema,
    },
  }, async (request, reply) => {
    const ctx = createContext(request);
    const result = await controller.dispatch(ctx, request.params.orderId, request.body);
    sendSuccess(reply, result);
  });

  // ─── Track shipment ────────────────────────────────────────────────────────

  typed.get('/:orderId/track', {
    preHandler: [requireAuth, resolveTenant, requireFeature('logistics:dispatch')],
    schema: {
      tags: ['Dispatch'],
      summary: 'Get live tracking status for a dispatched order',
      params: trackParamsSchema,
    },
  }, async (request, reply) => {
    const ctx = createContext(request);
    const result = await controller.track(ctx, request.params.orderId);
    sendSuccess(reply, result);
  });

  // ─── Inbound webhook from logistics provider ───────────────────────────────

  await app.register((webhookPlugin) => {
    webhookPlugin.addContentTypeParser(
      'application/json',
      { parseAs: 'buffer' },
      (_req, body, done) => { done(null, body); },
    );

    webhookPlugin.post(
      '/webhook/:provider/:tenantId',
      {
        schema: {
          tags: ['Dispatch'],
          hide: true,
          params: webhookParamsSchema,
        },
      },
      async (request, reply) => {
        try {
          const signature = (request.headers['x-logistics-signature'] as string | undefined) ?? '';
          const rawBody = request.body as Buffer;
          const params = request.params as { provider: string; tenantId: string };
          let payload: LogisticsWebhookPayload;

          try {
            payload = JSON.parse(rawBody.toString('utf8')) as LogisticsWebhookPayload;
          } catch {
            request.log.warn('[Webhook] Malformed logistics JSON');
            return reply.code(200).send({ received: true });
          }

          await controller.handleWebhook(
            rawBody,
            signature,
            params.provider,
            params.tenantId,
            payload,
          );
          return reply.code(200).send({ received: true });
        } catch (err) {
          request.log.error({ err }, '[Webhook] Logistics processing error');
          return reply.code(200).send({ received: true });
        }
      },
    );
  });
}
