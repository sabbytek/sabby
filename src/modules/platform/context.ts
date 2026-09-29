/**
 * Platform context factory — the platform-plane counterpart to
 * shared/http/context.ts. The only platform file that imports Fastify types.
 *
 * Captures IP, user agent and request id at the edge so every audit row can be
 * traced back to a specific request without the services knowing about HTTP.
 */

import type { FastifyRequest } from 'fastify';
import type { PlatformContext } from './types.js';

export function createPlatformContext(request: FastifyRequest): PlatformContext {
  const userAgent = request.headers['user-agent'];

  return {
    platformUserId: request.platformUser.platformUserId,
    email: request.platformUser.email,
    role: request.platformUser.role,
    ipAddress: request.ip,
    ...(typeof userAgent === 'string' ? { userAgent } : {}),
    requestId: request.id,
  };
}
