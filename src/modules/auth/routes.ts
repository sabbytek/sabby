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
} from './validators.js';

export default function authRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post('/login', {
    config: {
      rateLimit: { max: 10, timeWindow: '1 minute' },
    },
    schema: {
      tags: ['Auth'],
      summary: 'Authenticate a user and receive tokens',
      body: loginBodySchema,
    },
  }, async (request, reply) => {
    const result = await controller.login(app, request.body);
    sendSuccess(reply, result);
  });

  typed.post('/refresh', {
    config: {
      rateLimit: { max: 20, timeWindow: '1 minute' },
    },
    schema: {
      tags: ['Auth'],
      summary: 'Exchange a refresh token for a new access token',
      body: refreshBodySchema,
    },
  }, async (request, reply) => {
    const result = await controller.refresh(app, request.body);
    sendSuccess(reply, result);
  });

  typed.post('/logout', {
    preHandler: [requireAuth],
    schema: {
      tags: ['Auth'],
      summary: 'Revoke a refresh token (logout)',
      security: [{ bearerAuth: [] }],
      body: logoutBodySchema,
    },
  }, async (request, reply) => {
    const result = await controller.logout(request.user.tenantId, request.body.refreshToken);
    sendSuccess(reply, result);
  });

  typed.get('/me', {
    preHandler: [requireAuth],
    schema: {
      tags: ['Auth'],
      summary: 'Get the authenticated user profile',
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const result = controller.me(request.user);
    sendSuccess(reply, result);
  });

  // ─── Password Reset ────────────────────────────────────────────────────────

  typed.post('/forgot-password', {
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
    },
  }, async (request, reply) => {
    const result = await controller.forgotPassword(request.body, request.log);
    sendSuccess(reply, result);
  });

  typed.post('/reset-password', {
    config: {
      rateLimit: { max: 5, timeWindow: '15 minutes' },
    },
    schema: {
      tags: ['Auth'],
      summary: 'Reset password using token from email',
      security: [],
      description: 'Rate limited: 5 requests per 15 minutes.',
      body: resetPasswordBodySchema,
    },
  }, async (request, reply) => {
    const result = await controller.reset(request.body);
    sendSuccess(reply, result);
  });
}
