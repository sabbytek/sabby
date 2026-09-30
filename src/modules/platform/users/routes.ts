import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from '@fastify/type-provider-zod';
import { platformGuard } from '../../../shared/middleware/platform-auth.js';
import { sendSuccess, sendPaginated } from '../../../shared/http/response.js';
import { createPlatformContext } from '../context.js';
import * as controller from './controller.js';
import {
  listPlatformUsersQuerySchema,
  platformUserIdParamsSchema,
  createPlatformUserBodySchema,
  updatePlatformUserBodySchema,
  resetPlatformUserPasswordBodySchema,
} from './validators.js';

export default function platformUserRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/',
    {
      onRequest: platformGuard('platform_users:read'),
      schema: {
        tags: ['Platform · Users'],
        summary: 'List platform staff accounts',
        security: [{ bearerAuth: [] }],
        querystring: listPlatformUsersQuerySchema,
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
      onRequest: platformGuard('platform_users:read'),
      schema: {
        tags: ['Platform · Users'],
        summary: 'Get a single platform staff account',
        security: [{ bearerAuth: [] }],
        params: platformUserIdParamsSchema,
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
      onRequest: platformGuard('platform_users:manage'),
      schema: {
        tags: ['Platform · Users'],
        summary: 'Create a platform staff account',
        description:
          'The supported way to add a second platform user — no database access required. ' +
          'Creating an account grants cross-tenant power, so it is super_admin-only and audited.',
        security: [{ bearerAuth: [] }],
        body: createPlatformUserBodySchema,
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
    '/:id',
    {
      onRequest: platformGuard('platform_users:manage'),
      schema: {
        tags: ['Platform · Users'],
        summary: 'Update a platform staff account',
        description:
          'Change name, role, or active state. A role or active-state change revokes the ' +
          'target’s live sessions so it takes effect immediately. The platform’s last active ' +
          'super_admin cannot be demoted or deactivated.',
        security: [{ bearerAuth: [] }],
        params: platformUserIdParamsSchema,
        body: updatePlatformUserBodySchema,
      },
    },
    async (request, reply) => {
      const ctx = createPlatformContext(request);
      const { reason, ...input } = request.body;
      const result = await controller.update(ctx, request.params.id, input, reason);
      return sendSuccess(reply, result);
    },
  );

  typed.delete(
    '/:id',
    {
      onRequest: platformGuard('platform_users:manage'),
      schema: {
        tags: ['Platform · Users'],
        summary: 'Deactivate a platform staff account',
        description:
          'Soft delete — flips is_active to false and revokes live sessions. You cannot ' +
          'deactivate your own account or the last active super_admin.',
        security: [{ bearerAuth: [] }],
        params: platformUserIdParamsSchema,
        body: resetPlatformUserPasswordBodySchema,
      },
    },
    async (request, reply) => {
      const ctx = createPlatformContext(request);
      const result = await controller.deactivate(ctx, request.params.id, request.body.reason);
      return sendSuccess(reply, result);
    },
  );

  typed.post(
    '/:id/reset-password',
    {
      onRequest: platformGuard('platform_users:manage'),
      schema: {
        tags: ['Platform · Users'],
        summary: 'Reset a platform staff password',
        description:
          'Generates a temporary password, returned once, and revokes the target’s live ' +
          'sessions. MFA enrolment is left intact.',
        security: [{ bearerAuth: [] }],
        params: platformUserIdParamsSchema,
        body: resetPlatformUserPasswordBodySchema,
      },
    },
    async (request, reply) => {
      const ctx = createPlatformContext(request);
      const result = await controller.resetPassword(ctx, request.params.id, request.body.reason);
      return sendSuccess(reply, result);
    },
  );
}
