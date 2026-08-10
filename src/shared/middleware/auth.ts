import type { FastifyRequest, FastifyReply } from 'fastify';
import { UnauthorizedError, ForbiddenError } from '../errors/types.js';
import type { UserRole } from '../types/index.js';

/**
 * Verifies the Bearer JWT and populates request.user.
 * The JWT payload uses `sub` (userId), `tid` (tenantId), `role`, `email`.
 * @fastify/jwt populates request.user from the decoded payload directly.
 */
export async function requireAuth(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  try {
    await request.jwtVerify();
  } catch {
    throw new UnauthorizedError('Invalid or expired token');
  }
}

export function requireRole(...roles: UserRole[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    await requireAuth(request, reply);
    if (!roles.includes(request.user.role)) {
      throw new ForbiddenError(
        `Required role: ${roles.join(' or ')}. Your role: ${request.user.role}`,
      );
    }
  };
}

export async function requireOwner(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  return requireRole('owner')(request, reply);
}

export async function requireManager(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  return requireRole('owner', 'manager')(request, reply);
}
