import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { env } from '../config/env.js';

async function rateLimitPlugin(app: FastifyInstance) {
  await app.register(rateLimit, {
    max: env.NODE_ENV === 'test' ? 10000 : 200,
    timeWindow: '1 minute',
    keyGenerator: (request) => {
      // Rate limit per tenant + IP for authenticated requests, per IP otherwise
      const tenantId = request.headers['x-tenant-id'] as string | undefined;
      return tenantId
        ? `${tenantId}:${request.ip}`
        : request.ip;
    },
    errorResponseBuilder: () => ({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests, please slow down',
      },
    }),
  });
}

export default fp(rateLimitPlugin, { name: 'rate-limit' });
