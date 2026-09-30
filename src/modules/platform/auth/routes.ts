import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from '@fastify/type-provider-zod';
import { requirePlatformAuth } from '../../../shared/middleware/platform-auth.js';
import { sendSuccess } from '../../../shared/http/response.js';
import { createPlatformContext } from '../context.js';
import { writeAudit } from '../audit/service.js';
import {
  loginPlatformUser,
  refreshPlatformToken,
  revokePlatformSession,
  beginMfaEnrolment,
  confirmMfaEnrolment,
} from './service.js';
import {
  platformLoginBodySchema,
  platformRefreshBodySchema,
  platformLogoutBodySchema,
  mfaVerifyBodySchema,
} from './validators.js';

export default function platformAuthRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post(
    '/login',
    {
      // Tighter than the tenant login (10/min): this console reaches every tenant.
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
      schema: {
        tags: ['Platform · Auth'],
        summary: 'Authenticate an internal staff account',
        description:
          'Returns a short-lived platform access token. Roles listed in ' +
          'MFA_REQUIRED_ROLES must supply a valid TOTP code.',
        security: [],
        body: platformLoginBodySchema,
      },
    },
    async (request, reply) => {
      const userAgent = request.headers['user-agent'];
      const result = await loginPlatformUser(
        app,
        request.body.email,
        request.body.password,
        request.body.totpCode,
        {
          ipAddress: request.ip,
          ...(typeof userAgent === 'string' ? { userAgent } : {}),
        },
      );

      // Successful platform logins are themselves auditable events.
      await writeAudit(
        {
          platformUserId: result.user.id,
          email: result.user.email,
          role: result.user.role as never,
          ipAddress: request.ip,
          ...(typeof userAgent === 'string' ? { userAgent } : {}),
          requestId: request.id,
        },
        { action: 'platform_user.login', targetType: 'platform_user', targetId: result.user.id },
      );

      return sendSuccess(reply, result);
    },
  );

  typed.post(
    '/refresh',
    {
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
      schema: {
        tags: ['Platform · Auth'],
        summary: 'Exchange a platform refresh token for a new access token',
        security: [],
        body: platformRefreshBodySchema,
      },
    },
    async (request, reply) => {
      const result = await refreshPlatformToken(app, request.body.refreshToken);
      return sendSuccess(reply, result);
    },
  );

  typed.post(
    '/logout',
    {
      onRequest: [requirePlatformAuth],
      schema: {
        tags: ['Platform · Auth'],
        summary: 'Revoke the current platform session',
        security: [{ bearerAuth: [] }],
        body: platformLogoutBodySchema,
      },
    },
    async (request, reply) => {
      await revokePlatformSession(request.body.refreshToken);
      return sendSuccess(reply, { message: 'Logged out successfully' });
    },
  );

  typed.get(
    '/me',
    {
      onRequest: [requirePlatformAuth],
      schema: {
        tags: ['Platform · Auth'],
        summary: 'Get the authenticated platform user',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      return sendSuccess(reply, {
        platformUserId: request.platformUser.platformUserId,
        email: request.platformUser.email,
        role: request.platformUser.role,
      });
    },
  );

  // ─── MFA enrolment ─────────────────────────────────────────────────────────

  typed.post(
    '/mfa/setup',
    {
      onRequest: [requirePlatformAuth],
      config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
      schema: {
        tags: ['Platform · Auth'],
        summary: 'Begin TOTP enrolment',
        description:
          'Returns an otpauth:// URI to render as a QR code. MFA is not active ' +
          'until /mfa/verify confirms possession of the secret.',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const result = await beginMfaEnrolment(request.platformUser.platformUserId);
      return sendSuccess(reply, result);
    },
  );

  typed.post(
    '/mfa/verify',
    {
      onRequest: [requirePlatformAuth],
      config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
      schema: {
        tags: ['Platform · Auth'],
        summary: 'Confirm TOTP enrolment with a generated code',
        security: [{ bearerAuth: [] }],
        body: mfaVerifyBodySchema,
      },
    },
    async (request, reply) => {
      const ctx = createPlatformContext(request);
      const result = await confirmMfaEnrolment(
        request.platformUser.platformUserId,
        request.body.code,
      );

      await writeAudit(ctx, {
        action: 'platform_user.mfa_enabled',
        targetType: 'platform_user',
        targetId: request.platformUser.platformUserId,
      });

      return sendSuccess(reply, result);
    },
  );
}
