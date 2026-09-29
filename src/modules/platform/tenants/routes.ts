import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from '@fastify/type-provider-zod';
import { platformGuard } from '../../../shared/middleware/platform-auth.js';
import { sendSuccess, sendPaginated } from '../../../shared/http/response.js';
import { createPlatformContext } from '../context.js';
import * as controller from './controller.js';
import {
  listTenantsQuerySchema,
  tenantIdParamsSchema,
  suspendTenantBodySchema,
  changePlanBodySchema,
  createTenantBodySchema,
} from './validators.js';

export default function platformTenantRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/',
    {
      onRequest: platformGuard('tenants:read'),
      schema: {
        tags: ['Platform · Tenants'],
        summary: 'List all merchant tenants',
        security: [{ bearerAuth: [] }],
        querystring: listTenantsQuerySchema,
      },
    },
    async (request, reply) => {
      const { page, limit } = request.query;
      const { items, total } = await controller.list(request.query);
      return sendPaginated(reply, items, total, page, limit);
    },
  );

  typed.get(
    '/:id',
    {
      onRequest: platformGuard('tenants:read'),
      schema: {
        tags: ['Platform · Tenants'],
        summary: 'Get a single tenant record',
        security: [{ bearerAuth: [] }],
        params: tenantIdParamsSchema,
      },
    },
    async (request, reply) => {
      const result = await controller.get(request.params.id);
      return sendSuccess(reply, result);
    },
  );

  typed.post(
    '/',
    {
      onRequest: platformGuard('tenants:create'),
      schema: {
        tags: ['Platform · Tenants'],
        summary: 'Provision a tenant on a merchant’s behalf',
        description:
          'Staff-initiated onboarding. Unlike public signup this is authenticated, ' +
          'permission-gated and audited.',
        security: [{ bearerAuth: [] }],
        body: createTenantBodySchema,
      },
    },
    async (request, reply) => {
      const ctx = createPlatformContext(request);
      const { reason, ...input } = request.body;
      const result = await controller.create(ctx, input, reason);
      return sendSuccess(reply, result, 201);
    },
  );

  typed.patch(
    '/:id/suspend',
    {
      onRequest: platformGuard('tenants:suspend'),
      schema: {
        tags: ['Platform · Tenants'],
        summary: 'Suspend a tenant',
        description:
          'Takes effect on the merchant’s next request — resolveTenant rejects an inactive ' +
          'tenant, so access is not left open until their token expires. Audited.',
        security: [{ bearerAuth: [] }],
        params: tenantIdParamsSchema,
        body: suspendTenantBodySchema,
      },
    },
    async (request, reply) => {
      const ctx = createPlatformContext(request);
      const result = await controller.suspend(ctx, request.params.id, request.body.reason);
      return sendSuccess(reply, result);
    },
  );

  typed.patch(
    '/:id/reactivate',
    {
      onRequest: platformGuard('tenants:suspend'),
      schema: {
        tags: ['Platform · Tenants'],
        summary: 'Reactivate a suspended tenant',
        security: [{ bearerAuth: [] }],
        params: tenantIdParamsSchema,
        body: suspendTenantBodySchema,
      },
    },
    async (request, reply) => {
      const ctx = createPlatformContext(request);
      const result = await controller.reactivate(ctx, request.params.id, request.body.reason);
      return sendSuccess(reply, result);
    },
  );

  typed.patch(
    '/:id/plan',
    {
      onRequest: platformGuard('tenants:change_plan'),
      schema: {
        tags: ['Platform · Tenants'],
        summary: 'Change a tenant’s plan tier',
        description:
          'Billing-affecting. The previous tier is recorded in the audit log so the ' +
          'change can be reconstructed.',
        security: [{ bearerAuth: [] }],
        params: tenantIdParamsSchema,
        body: changePlanBodySchema,
      },
    },
    async (request, reply) => {
      const ctx = createPlatformContext(request);
      const result = await controller.changePlan(
        ctx,
        request.params.id,
        request.body.planTier,
        request.body.reason,
      );
      return sendSuccess(reply, result);
    },
  );
}
