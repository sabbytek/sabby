import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from '@fastify/type-provider-zod';
import {
  requirePlatformAuth,
  requirePlatformPermission,
} from '../../../shared/middleware/platform-auth.js';
import { requireTenantGrant } from '../../../shared/middleware/tenant-grant.js';
import { sendSuccess, sendPaginated } from '../../../shared/http/response.js';
import { createPlatformContext } from '../context.js';
import * as controller from './controller.js';
import {
  openGrantBodySchema,
  listGrantsQuerySchema,
  grantIdParamsSchema,
  tenantIdParamsSchema,
  paginationQuerySchema,
  resendReceiptBodySchema,
  retryWebhookBodySchema,
  unlockAccountBodySchema,
  resetPasswordBodySchema,
} from './validators.js';

/**
 * Grant-scoped routes chain three guards:
 *   requirePlatformAuth          — who are you (platform plane)
 *   requirePlatformPermission    — are you trusted with this action
 *   requireTenantGrant           — do you have live, reasoned access to THIS tenant
 *
 * All three must pass. Holding a support role is never sufficient on its own.
 *
 * The first two run as onRequest so identity and permission are settled before
 * Fastify validates the body — otherwise an unauthorised caller learns the
 * schema from a 400. The grant check stays in preHandler because it resolves
 * the tenant from the route params.
 */
export default function platformSupportRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // ─── Grants ────────────────────────────────────────────────────────────────

  typed.post(
    '/grants',
    {
      onRequest: [requirePlatformAuth, requirePlatformPermission('support:grant_read')],
      schema: {
        tags: ['Platform · Support'],
        summary: 'Open a time-boxed access grant on a tenant',
        description:
          'Defaults to 60 minutes read access, capped at 24 hours. The merchant is ' +
          'notified and the grant is written to their own audit log.',
        security: [{ bearerAuth: [] }],
        body: openGrantBodySchema,
      },
    },
    async (request, reply) => {
      const ctx = createPlatformContext(request);
      const result = await controller.openGrant(ctx, request.body);
      return sendSuccess(reply, result, 201);
    },
  );

  typed.get(
    '/grants',
    {
      onRequest: [requirePlatformAuth, requirePlatformPermission('support:grant_read')],
      schema: {
        tags: ['Platform · Support'],
        summary: 'List access grants',
        security: [{ bearerAuth: [] }],
        querystring: listGrantsQuerySchema,
      },
    },
    async (request, reply) => {
      const { page, limit } = request.query;
      const { items, total } = await controller.listGrants(request.query);
      return sendPaginated(reply, items, total, page, limit);
    },
  );

  typed.delete(
    '/grants/:id',
    {
      onRequest: [requirePlatformAuth, requirePlatformPermission('support:grant_read')],
      schema: {
        tags: ['Platform · Support'],
        summary: 'Revoke an access grant early',
        security: [{ bearerAuth: [] }],
        params: grantIdParamsSchema,
      },
    },
    async (request, reply) => {
      const ctx = createPlatformContext(request);
      const result = await controller.revokeGrant(ctx, request.params.id);
      return sendSuccess(reply, result);
    },
  );

  // ─── Grant-scoped reads ────────────────────────────────────────────────────

  typed.get(
    '/tenants/:tenantId/orders',
    {
      onRequest: [requirePlatformAuth, requirePlatformPermission('support:grant_read')],
      preHandler: [requireTenantGrant('read')],
      schema: {
        tags: ['Platform · Support'],
        summary: 'Read a tenant’s orders under an active grant',
        security: [{ bearerAuth: [] }],
        params: tenantIdParamsSchema,
        querystring: paginationQuerySchema,
      },
    },
    async (request, reply) => {
      const ctx = createPlatformContext(request);
      const { page, limit } = request.query;
      const { items, total } = await controller.listOrders(
        ctx,
        request.tenant.tenantId,
        request.tenant.schema,
        page,
        limit,
      );
      return sendPaginated(reply, items, total, page, limit);
    },
  );

  // ─── Repair actions (closed whitelist) ─────────────────────────────────────

  typed.post(
    '/tenants/:tenantId/resend-receipt',
    {
      onRequest: [requirePlatformAuth, requirePlatformPermission('support:resend_receipt')],
      preHandler: [requireTenantGrant('write')],
      schema: {
        tags: ['Platform · Support'],
        summary: 'Re-generate and re-send an invoice to the customer',
        security: [{ bearerAuth: [] }],
        params: tenantIdParamsSchema,
        body: resendReceiptBodySchema,
      },
    },
    async (request, reply) => {
      const ctx = createPlatformContext(request);
      const result = await controller.resendReceipt(
        ctx,
        request.tenant.tenantId,
        request.tenant.schema,
        request.body.invoiceId,
      );
      return sendSuccess(reply, result);
    },
  );

  typed.post(
    '/tenants/:tenantId/retry-webhook',
    {
      onRequest: [requirePlatformAuth, requirePlatformPermission('support:retry_webhook')],
      preHandler: [requireTenantGrant('write')],
      schema: {
        tags: ['Platform · Support'],
        summary: 'Re-process a payment webhook from its raw payload',
        description:
          'Safe to repeat: handlePaystackWebhook is idempotent on gatewayEventId, so ' +
          'replaying an event that already landed is a no-op, not a double credit.',
        security: [{ bearerAuth: [] }],
        params: tenantIdParamsSchema,
        body: retryWebhookBodySchema,
      },
    },
    async (request, reply) => {
      const ctx = createPlatformContext(request);
      const result = await controller.retryWebhook(
        ctx,
        request.tenant.tenantId,
        request.tenant.schema,
        request.body.rawPayload,
      );
      return sendSuccess(reply, result);
    },
  );

  typed.post(
    '/tenants/:tenantId/unlock-account',
    {
      onRequest: [requirePlatformAuth, requirePlatformPermission('support:unlock_account')],
      preHandler: [requireTenantGrant('write')],
      schema: {
        tags: ['Platform · Support'],
        summary: 'Reactivate a deactivated merchant user',
        security: [{ bearerAuth: [] }],
        params: tenantIdParamsSchema,
        body: unlockAccountBodySchema,
      },
    },
    async (request, reply) => {
      const ctx = createPlatformContext(request);
      const result = await controller.unlockAccount(
        ctx,
        request.tenant.tenantId,
        request.tenant.schema,
        request.body.userId,
        request.body.reason,
      );
      return sendSuccess(reply, result);
    },
  );

  typed.post(
    '/tenants/:tenantId/reset-password',
    {
      onRequest: [requirePlatformAuth, requirePlatformPermission('support:reset_password')],
      preHandler: [requireTenantGrant('write')],
      schema: {
        tags: ['Platform · Support'],
        summary: 'Trigger the standard password-reset email for a merchant user',
        description:
          'Support never sets a password or sees the token — this starts the same ' +
          'self-service flow the merchant could start themselves.',
        security: [{ bearerAuth: [] }],
        params: tenantIdParamsSchema,
        body: resetPasswordBodySchema,
      },
    },
    async (request, reply) => {
      const ctx = createPlatformContext(request);
      const result = await controller.resetPassword(
        ctx,
        request.tenant.tenantId,
        request.tenant.schema,
        request.body.email,
        request.body.reason,
      );
      return sendSuccess(reply, result);
    },
  );
}
