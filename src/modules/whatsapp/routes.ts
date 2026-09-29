import crypto from 'crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from '@fastify/type-provider-zod';
import { env } from '../../config/env.js';
import { requireAuth } from '../../shared/middleware/auth.js';
import { resolveTenant } from '../../shared/middleware/tenant.js';
import { createContext } from '../../shared/http/context.js';
import { sendMessage } from '../../shared/http/response.js';
import * as controller from './controller.js';
import { getTenantForPhoneId } from './session.js';
import { handleInboundMessage } from './handler.js';
import { webhookVerifyQuerySchema, setupBodySchema } from './validators.js';

interface RawBodyRequest extends FastifyRequest {
  rawBody: string;
}

// ─── Meta webhook payload types ───────────────────────────────────────────────

interface MetaTextMessage {
  type: 'text';
  text: { body: string };
  id: string;
  from: string;
  timestamp: string;
}

interface MetaInteractiveMessage {
  type: 'interactive';
  interactive: {
    type: 'list_reply' | 'button_reply';
    list_reply?: { id: string; title: string };
    button_reply?: { id: string; title: string };
  };
  id: string;
  from: string;
  timestamp: string;
}

type MetaMessage = MetaTextMessage | MetaInteractiveMessage;

interface MetaWebhookEntry {
  id: string;
  changes: {
    value: {
      metadata: { phone_number_id: string; display_phone_number: string };
      messages?: MetaMessage[];
      statuses?: unknown[];
    };
    field: string;
  }[];
}

interface MetaWebhookPayload {
  object: string;
  entry: MetaWebhookEntry[];
}

export default async function whatsappRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // ─── GET /whatsapp/webhook — Meta challenge-response verification ────────────
  typed.get(
    '/webhook',
    {
      schema: {
        tags: ['WhatsApp'],
        summary: 'Meta webhook verification endpoint',
        description: 'Responds to Meta hub challenge. Set WHATSAPP_VERIFY_TOKEN in env.',
        querystring: webhookVerifyQuerySchema,
      },
    },
    async (request, reply) => {
      const {
        'hub.mode': mode,
        'hub.verify_token': token,
        'hub.challenge': challenge,
      } = request.query;

      if (mode === 'subscribe' && token === env.WHATSAPP_VERIFY_TOKEN) {
        return reply.send(challenge);
      }

      return reply.code(403).send({ error: 'Forbidden' });
    },
  );

  // ─── POST /whatsapp/webhook — Inbound events ──────────────────────────────
  app.register(async function webhookScope(scope) {
    scope.removeAllContentTypeParsers();
    scope.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, done) => {
      const raw = (body as Buffer).toString('utf-8');
      (_req as RawBodyRequest).rawBody = raw;
      try {
        done(null, JSON.parse(raw) as unknown);
      } catch {
        done(new Error('Invalid JSON'), undefined);
      }
    });

    scope.post(
      '/webhook',
      {
        schema: {
          tags: ['WhatsApp'],
          summary: 'Receive WhatsApp events from Meta',
          description: 'Validates x-hub-signature-256 and processes inbound messages.',
        },
      },
      async (request, reply) => {
        try {
          if (env.WHATSAPP_APP_SECRET) {
            const rawBody = (request as unknown as RawBodyRequest).rawBody ?? '';
            const sigHeader = (request.headers['x-hub-signature-256'] as string | undefined) ?? '';
            const expected = `sha256=${crypto.createHmac('sha256', env.WHATSAPP_APP_SECRET).update(rawBody).digest('hex')}`;

            let sigValid = false;
            try {
              sigValid = crypto.timingSafeEqual(
                Buffer.from(expected, 'utf-8'),
                Buffer.from(sigHeader, 'utf-8'),
              );
            } catch {
              sigValid = false;
            }
            if (!sigValid) {
              request.log.warn({ ip: request.ip }, '[Webhook] Invalid WhatsApp signature');
              return reply.code(200).send({ success: true });
            }
          }

          const payload = request.body as MetaWebhookPayload;

          if (payload.object !== 'whatsapp_business_account') {
            return reply.send({ success: true });
          }

          void processEntries(payload.entry);
          return reply.send({ success: true });
        } catch (err) {
          request.log.error({ err }, '[Webhook] WhatsApp processing error');
          return reply.send({ success: true });
        }
      },
    );
  });

  // ─── POST /whatsapp/setup — Register phone number ID → tenant ────────────
  typed.post(
    '/setup',
    {
      preHandler: [requireAuth, resolveTenant],
      schema: {
        tags: ['WhatsApp'],
        summary: 'Register a WhatsApp phone number ID for this tenant',
        description:
          'Maps a Meta phone_number_id to this tenant so inbound messages are routed correctly.',
        security: [{ bearerAuth: [] }],
        body: setupBodySchema,
      },
    },
    async (request, reply) => {
      const ctx = createContext(request);
      const result = await controller.setup(ctx, request.body);
      return sendMessage(reply, result.message);
    },
  );
}

// ─── Process Meta webhook entries ─────────────────────────────────────────────

async function processEntries(entries: MetaWebhookEntry[]): Promise<void> {
  for (const entry of entries) {
    for (const change of entry.changes) {
      if (change.field !== 'messages' || !change.value.messages?.length) continue;

      const phoneNumberId = change.value.metadata.phone_number_id;
      const tenant = await getTenantForPhoneId(phoneNumberId);

      if (!tenant) continue; // Unknown phone number ID — skip

      for (const msg of change.value.messages) {
        let messageBody = '';
        let interactiveId: string | null = null;

        if (msg.type === 'text') {
          messageBody = msg.text.body;
        } else if (msg.type === 'interactive') {
          const ia = msg.interactive;
          if (ia.type === 'list_reply' && ia.list_reply) {
            interactiveId = ia.list_reply.id;
            messageBody = ia.list_reply.title;
          } else if (ia.type === 'button_reply' && ia.button_reply) {
            interactiveId = ia.button_reply.id;
            messageBody = ia.button_reply.title;
          }
        }

        await handleInboundMessage(
          phoneNumberId,
          msg.from,
          tenant.tenantId,
          tenant.schemaName,
          msg.type,
          messageBody,
          interactiveId,
        ).catch((err: unknown) => {
          console.error('[WhatsApp] handler error:', err);
        });
      }
    }
  }
}
