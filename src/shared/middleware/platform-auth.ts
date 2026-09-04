import type { FastifyRequest, FastifyReply } from 'fastify';
import { UnauthorizedError, ForbiddenError } from '../errors/types.js';
import type { PlatformAuthUser } from '../types/index.js';
import { roleHasPermission, type PlatformPermission } from '../../modules/platform/permissions.js';

/**
 * Verifies a platform access token (separate audience + secret from tenant
 * tokens) and attaches the normalized platform context to the request.
 *
 * A tenant token can never satisfy this: it is signed with a different secret
 * and lacks the platform audience, so `platformJwtVerify` rejects it.
 */
export async function requirePlatformAuth(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  try {
    const decoded = await request.platformJwtVerify();
    request.platformAuth = {
      userId: decoded.sub,
      email: decoded.email,
      role: decoded.role,
    };
  } catch {
    throw new UnauthorizedError('Invalid or expired platform token');
  }
}

/**
 * Returns the authenticated platform context, or throws if the route was not
 * guarded by requirePlatformAuth. Lets handlers avoid non-null assertions.
 */
export function getPlatformAuth(request: FastifyRequest): PlatformAuthUser {
  if (!request.platformAuth) {
    throw new UnauthorizedError('Platform authentication required');
  }
  return request.platformAuth;
}

/**
 * Guards a route behind one or more platform permissions (AND semantics).
 * Authorization is by permission, never by role name — the role-to-permission
 * mapping lives in modules/platform/permissions.ts.
 */
export function requirePlatformPermission(...permissions: PlatformPermission[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    await requirePlatformAuth(request, reply);
    const role = getPlatformAuth(request).role;
    const missing = permissions.filter((perm) => !roleHasPermission(role, perm));
    if (missing.length > 0) {
      throw new ForbiddenError(
        `Missing platform permission: ${missing.join(', ')}. Your role: ${role}`,
      );
    }
  };
}
