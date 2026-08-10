/**
 * Context factory — creates RequestContext from Fastify request.
 * This is the ONLY file in the controller layer that imports Fastify types.
 */

import type { FastifyRequest } from 'fastify';
import type { RequestContext } from '../types/controller.js';

/**
 * Creates a RequestContext from a Fastify request.
 * Called once per request, before controller invocation.
 *
 * @example
 * // In route handler:
 * async (request, reply) => {
 *   const ctx = createContext(request);
 *   await controller.create(ctx, request.body, reply);
 * }
 */
export function createContext(request: FastifyRequest): RequestContext {
  return {
    schema: request.tenant.schema,
    tenantId: request.user.tid,
    userId: request.user.sub,
    role: request.user.role,
    email: request.user.email,
  };
}
