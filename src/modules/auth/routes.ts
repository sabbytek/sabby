import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from '@fastify/type-provider-zod';
import { requireAuth } from '../../shared/middleware/auth.js';
import { sendSuccess } from '../../shared/http/response.js';
import * as controller from './controller.js';
import {
  loginBodySchema,
  refreshBodySchema,
  logoutBodySchema,
  forgotPasswordBodySchema,
  resetPasswordBodySchema,
  loginResponseSchema,
  refreshResponseSchema,
  meResponseSchema,
  messageResponseSchema,
  errorEnvelopeSchema,
} from './validators.js';

export default function authRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post(
    '/login',
    {
      config: {
        rateLimit: { max: 10, timeWindow: '1 minute' },
      },
      schema: {
        tags: ['Auth'],
        summary: 'Authenticate a user and receive tokens',
        description:
          'Accounts are scoped to a business: the same email under another `tenantSlug` is a ' +
          'different account. Wrong email, wrong password, or credentials from another business ' +
          'all return the same 401. An unknown `tenantSlug` returns 404. ' +
          'Rate limited: 10 requests per minute.',
        security: [],
        body: loginBodySchema,
        response: {
          200: loginResponseSchema,
          400: errorEnvelopeSchema,
          401: errorEnvelopeSchema,
          404: errorEnvelopeSchema,
          429: errorEnvelopeSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await controller.login(app, request.body);
      return sendSuccess(reply, result);
    },
  );

  typed.post(
    '/refresh',
    {
      config: {
        rateLimit: { max: 20, timeWindow: '1 minute' },
      },
      schema: {
        tags: ['Auth'],
        summary: 'Exchange a refresh token for a new access token',
        description:
          'Call when an authenticated request returns 401. Returns only a new `accessToken`; ' +
          'keep using the same `refreshToken` until it expires (7 days) or is revoked by logout. ' +
          'Rate limited: 20 requests per minute.',
        security: [],
        body: refreshBodySchema,
        response: {
          200: refreshResponseSchema,
          400: errorEnvelopeSchema,
          401: errorEnvelopeSchema,
          404: errorEnvelopeSchema,
          429: errorEnvelopeSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await controller.refresh(app, request.body);
      return sendSuccess(reply, result);
    },
  );

  typed.post(
    '/logout',
    {
      preHandler: [requireAuth],
      schema: {
        tags: ['Auth'],
        summary: 'Revoke a refresh token (logout)',
        description: 'After this, /v1/auth/refresh rejects the token with 401.',
        security: [{ bearerAuth: [] }],
        body: logoutBodySchema,
        response: {
          200: messageResponseSchema,
          400: errorEnvelopeSchema,
          401: errorEnvelopeSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await controller.logout(request.user.tenantId, request.body.refreshToken);
      return sendSuccess(reply, result);
    },
  );

  typed.get(
    '/me',
    {
      preHandler: [requireAuth],
      schema: {
        tags: ['Auth'],
        summary: 'Get the authenticated user profile',
        description:
          'Returns the claims in the access token, not the full profile: no name fields. ' +
          'Use the `user` object from login for display.',
        security: [{ bearerAuth: [] }],
        response: {
          200: meResponseSchema,
          401: errorEnvelopeSchema,
        },
      },
    },
    async (request, reply) => {
      const result = controller.me(request.user);
      return sendSuccess(reply, result);
    },
  );

  // ─── Password Reset ────────────────────────────────────────────────────────

  typed.post(
    '/forgot-password',
    {
      config: {
        rateLimit: { max: 5, timeWindow: '15 minutes' },
      },
      schema: {
        tags: ['Auth'],
        summary: 'Request a password reset email',
        security: [],
        description:
          'Always returns success to prevent email enumeration. ' +
          'If the email exists, a reset link is sent.',
        body: forgotPasswordBodySchema,
        response: {
          200: messageResponseSchema,
          400: errorEnvelopeSchema,
          429: errorEnvelopeSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await controller.forgotPassword(request.body);
      return sendSuccess(reply, result);
    },
  );

  typed.post(
    '/reset-password',
    {
      config: {
        rateLimit: { max: 5, timeWindow: '15 minutes' },
      },
      schema: {
        tags: ['Auth'],
        summary: 'Reset password using token from email',
        security: [],
        description: 'Rate limited: 5 requests per 15 minutes.',
        body: resetPasswordBodySchema,
        response: {
          200: messageResponseSchema,
          400: errorEnvelopeSchema,
          429: errorEnvelopeSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await controller.reset(request.body);
      return sendSuccess(reply, result);
    },
  );
}
