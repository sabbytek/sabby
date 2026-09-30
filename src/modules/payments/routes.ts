import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from '@fastify/type-provider-zod';
import { requireAuth } from '../../shared/middleware/auth.js';
import { resolveTenant } from '../../shared/middleware/tenant.js';
import { requireFeature } from '../../shared/middleware/feature-gate.js';
import { paystackGateway } from '../../shared/payments/paystack.js';
import { flutterwaveGateway } from '../../shared/payments/flutterwave.js';
import { createContext } from '../../shared/http/context.js';
import { sendCreated, sendSuccess } from '../../shared/http/response.js';
import * as controller from './controller.js';
import type { PaystackWebhookData } from './service.js';
import { initiatePaymentBodySchema } from './validators.js';

interface WebhookRequest extends FastifyRequest {
  rawBody: string;
}

export default async function paymentsRoutes(fastify: FastifyInstance) {
  const typed = fastify.withTypeProvider<ZodTypeProvider>();

  // ─── POST /payments/initiate ──────────────────────────────────────────────
  typed.post(
    '/initiate',
    {
      preHandler: [requireAuth, resolveTenant, requireFeature('orders:create')],
      schema: {
        tags: ['Payments'],
        summary: 'Initiate a Paystack payment for an order',
        security: [{ bearerAuth: [] }],
        body: initiatePaymentBodySchema,
      },
    },
    async (request, reply) => {
      const ctx = createContext(request);
      const result = await controller.initiate(ctx, request.body);
      return sendCreated(reply, result);
    },
  );

  // ─── POST /payments/webhook/paystack ─────────────────────────────────────
  // Webhook endpoint: unauthenticated, raw body required for HMAC verification.
  // Scoped plugin so the content type parser override only applies here.
  fastify.register(async function webhookScope(scope) {
    // Override JSON parser to capture raw body for signature verification
    scope.removeAllContentTypeParsers();
    scope.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, done) => {
      const raw = (body as Buffer).toString('utf-8');
      (_req as WebhookRequest).rawBody = raw;
      try {
        done(null, JSON.parse(raw) as unknown);
      } catch {
        done(new Error('Invalid JSON body'), undefined);
      }
    });

    scope.post(
      '/webhook/paystack',
      {
        schema: {
          tags: ['Payments'],
          summary: 'Paystack webhook receiver',
          description: 'Receives Paystack events. Validates HMAC-SHA512 signature.',
        },
      },
      async (request, reply) => {
        try {
          const rawBody = (request as unknown as WebhookRequest).rawBody ?? '';
          const signature = (request.headers['x-paystack-signature'] as string | undefined) ?? '';

          if (!paystackGateway.validateWebhookSignature(rawBody, signature)) {
            request.log.warn({ ip: request.ip }, '[Webhook] Invalid Paystack signature');
            return reply.code(200).send({ received: true });
          }

          const payload = request.body as { event: string; data: PaystackWebhookData };

          const meta = (payload.data?.metadata ?? {}) as Record<string, unknown>;
          const schemaName = (meta['schemaName'] as string | undefined) ?? '';
          if (!schemaName) {
            return sendSuccess(reply, undefined);
          }

          await controller.handleWebhook(schemaName, payload.event, payload.data, meta);
          return sendSuccess(reply, undefined);
        } catch (err) {
          request.log.error({ err }, '[Webhook] Paystack processing error');
          return reply.code(200).send({ received: true });
        }
      },
    );

    // ─── POST /payments/webhook/flutterwave ─────────────────────────────────
    scope.post(
      '/webhook/flutterwave',
      {
        schema: {
          tags: ['Payments'],
          summary: 'Flutterwave webhook receiver',
          description: 'Receives Flutterwave charge.completed events. Validates verif-hash header.',
        },
      },
      async (request, reply) => {
        try {
          const rawBody = (request as unknown as WebhookRequest).rawBody ?? '';
          const signature = (request.headers['verif-hash'] as string | undefined) ?? '';

          if (!flutterwaveGateway.validateWebhookSignature(rawBody, signature)) {
            request.log.warn({ ip: request.ip }, '[Webhook] Invalid Flutterwave signature');
            return reply.code(200).send({ received: true });
          }

          const payload = request.body as {
            event: string;
            data: {
              txRef?: string;
              tx_ref?: string;
              metadata?: Record<string, unknown>;
              id?: number;
              status?: string;
              amount?: number;
              app_fee?: number;
              flw_ref?: string;
              created_at?: string;
            };
          };

          const meta = payload.data?.metadata ?? {};
          const schemaName = (meta['schemaName'] as string | undefined) ?? '';
          if (!schemaName) return sendSuccess(reply, undefined);

          if (payload.event === 'charge.completed' && payload.data?.status === 'successful') {
            const reference = payload.data.txRef ?? payload.data.tx_ref ?? '';
            await controller.handleWebhook(
              schemaName,
              'charge.success',
              {
                id: payload.data.id ?? 0,
                reference,
                amount: Math.round((payload.data.amount ?? 0) * 100),
                fees: Math.round((payload.data.app_fee ?? 0) * 100),
                status: 'success',
                metadata: meta,
              },
              meta,
            );
          }

          return sendSuccess(reply, undefined);
        } catch (err) {
          request.log.error({ err }, '[Webhook] Flutterwave processing error');
          return reply.code(200).send({ received: true });
        }
      },
    );
  });
}
