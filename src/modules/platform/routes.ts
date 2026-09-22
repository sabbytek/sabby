import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from '@fastify/type-provider-zod';
import {
  requirePlatformAuth,
  requirePlatformPermission,
  getPlatformAuth,
} from '../../shared/middleware/platform-auth.js';
import { sendSuccess } from '../../shared/http/response.js';
import * as controller from './controller.js';
import {
  platformLoginBodySchema,
  platformRefreshBodySchema,
  platformLogoutBodySchema,
  mfaConfirmBodySchema,
  tenantListQuerySchema,
  tenantIdParamSchema,
  changePlanBodySchema,
  extendTrialBodySchema,
  auditListQuerySchema,
} from './validators.js';

/**
 * Platform ops plane routes (Phase 0: auth + MFA).
 * Tenant oversight endpoints land in Phase 1 on top of this foundation.
 */
export default function platformRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post(
    '/auth/login',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        tags: ['Platform'],
        summary: 'Authenticate a platform user (support/admin/super-admin)',
        description: 'Provide `totp` when the account has MFA enabled.',
        security: [],
        body: platformLoginBodySchema,
      },
    },
    async (request, reply) => {
      const result = await controller.login(app, request.body, request);
      sendSuccess(reply, result);
    },
  );

  typed.post(
    '/auth/refresh',
    {
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
      schema: {
        tags: ['Platform'],
        summary: 'Rotate a platform refresh token for a new token pair',
        security: [],
        body: platformRefreshBodySchema,
      },
    },
    async (request, reply) => {
      const result = await controller.refresh(app, request.body.refreshToken);
      sendSuccess(reply, result);
    },
  );

  typed.post(
    '/auth/logout',
    {
      preHandler: [requirePlatformAuth],
      schema: {
        tags: ['Platform'],
        summary: 'Revoke a platform refresh token (logout)',
        security: [{ platformBearerAuth: [] }],
        body: platformLogoutBodySchema,
      },
    },
    async (request, reply) => {
      const result = await controller.logout(
        getPlatformAuth(request),
        request.body.refreshToken,
        request,
      );
      sendSuccess(reply, result);
    },
  );

  typed.get(
    '/auth/me',
    {
      preHandler: [requirePlatformAuth],
      schema: {
        tags: ['Platform'],
        summary: 'Get the authenticated platform user profile',
        security: [{ platformBearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const result = await controller.me(getPlatformAuth(request));
      sendSuccess(reply, result);
    },
  );

  typed.post(
    '/auth/mfa/enroll',
    {
      preHandler: [requirePlatformAuth],
      config: { rateLimit: { max: 5, timeWindow: '5 minutes' } },
      schema: {
        tags: ['Platform'],
        summary: 'Begin TOTP MFA enrollment (returns secret + otpauth URI)',
        security: [{ platformBearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const result = await controller.startMfaEnrollment(getPlatformAuth(request));
      sendSuccess(reply, result);
    },
  );

  typed.post(
    '/auth/mfa/confirm',
    {
      preHandler: [requirePlatformAuth],
      config: { rateLimit: { max: 5, timeWindow: '5 minutes' } },
      schema: {
        tags: ['Platform'],
        summary: 'Confirm TOTP MFA enrollment with a code',
        security: [{ platformBearerAuth: [] }],
        body: mfaConfirmBodySchema,
      },
    },
    async (request, reply) => {
      const result = await controller.verifyMfaEnrollment(
        getPlatformAuth(request),
        request.body.totp,
        request,
      );
      sendSuccess(reply, result);
    },
  );

  // ─── Tenant oversight (read-only) ───────────────────────────────────────────

  typed.get(
    '/overview',
    {
      preHandler: [requirePlatformPermission('platform:view')],
      schema: {
        tags: ['Platform'],
        summary: 'Platform KPIs: tenant counts, status and plan distribution',
        security: [{ platformBearerAuth: [] }],
      },
    },
    async (_request, reply) => {
      const result = await controller.overview();
      sendSuccess(reply, result);
    },
  );

  typed.get(
    '/tenants',
    {
      preHandler: [requirePlatformPermission('tenant:read')],
      schema: {
        tags: ['Platform'],
        summary: 'List tenants (paginated, searchable; PII masked)',
        security: [{ platformBearerAuth: [] }],
        querystring: tenantListQuerySchema,
      },
    },
    async (request, reply) => {
      const result = await controller.tenants(request.query);
      sendSuccess(reply, result);
    },
  );

  typed.get(
    '/tenants/:id',
    {
      preHandler: [requirePlatformPermission('tenant:read')],
      schema: {
        tags: ['Platform'],
        summary: 'Tenant detail with usage metrics and onboarding (PII masked)',
        security: [{ platformBearerAuth: [] }],
        params: tenantIdParamSchema,
      },
    },
    async (request, reply) => {
      const result = await controller.tenantDetail(request.params.id);
      sendSuccess(reply, result);
    },
  );

  typed.get(
    '/audit',
    {
      preHandler: [requirePlatformPermission('audit:read:own')],
      schema: {
        tags: ['Platform'],
        summary: 'Read the platform audit log (own actions, or all with audit:read:all)',
        security: [{ platformBearerAuth: [] }],
        querystring: auditListQuerySchema,
      },
    },
    async (request, reply) => {
      const result = await controller.auditLog(getPlatformAuth(request), request.query);
      sendSuccess(reply, result);
    },
  );

  // ─── Tenant mutations (audited; MFA enforced for admin/super-admin) ──────────

  typed.post(
    '/tenants/:id/suspend',
    {
      preHandler: [requirePlatformPermission('tenant:suspend')],
      schema: {
        tags: ['Platform'],
        summary: 'Suspend a tenant (blocks tenant access)',
        security: [{ platformBearerAuth: [] }],
        params: tenantIdParamSchema,
      },
    },
    async (request, reply) => {
      const result = await controller.suspendTenant(
        getPlatformAuth(request),
        request.params.id,
        request,
      );
      sendSuccess(reply, result);
    },
  );

  typed.post(
    '/tenants/:id/reactivate',
    {
      preHandler: [requirePlatformPermission('tenant:suspend')],
      schema: {
        tags: ['Platform'],
        summary: 'Reactivate a suspended tenant',
        security: [{ platformBearerAuth: [] }],
        params: tenantIdParamSchema,
      },
    },
    async (request, reply) => {
      const result = await controller.reactivateTenant(
        getPlatformAuth(request),
        request.params.id,
        request,
      );
      sendSuccess(reply, result);
    },
  );

  typed.post(
    '/tenants/:id/plan',
    {
      preHandler: [requirePlatformPermission('tenant:plan:manage')],
      schema: {
        tags: ['Platform'],
        summary: 'Change a tenant plan tier (manual override)',
        security: [{ platformBearerAuth: [] }],
        params: tenantIdParamSchema,
        body: changePlanBodySchema,
      },
    },
    async (request, reply) => {
      const result = await controller.changePlan(
        getPlatformAuth(request),
        request.params.id,
        request.body.planTier,
        request,
      );
      sendSuccess(reply, result);
    },
  );

  typed.post(
    '/tenants/:id/extend-trial',
    {
      preHandler: [requirePlatformPermission('tenant:plan:manage')],
      schema: {
        tags: ['Platform'],
        summary: 'Extend a trial tenant subscription window',
        security: [{ platformBearerAuth: [] }],
        params: tenantIdParamSchema,
        body: extendTrialBodySchema,
      },
    },
    async (request, reply) => {
      const result = await controller.extendTrial(
        getPlatformAuth(request),
        request.params.id,
        request.body.days,
        request,
      );
      sendSuccess(reply, result);
    },
  );
}
