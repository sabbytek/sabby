/**
 * Guards for the internal admin plane (/v1/platform).
 *
 * These are intentionally NOT built on requireAuth: the platform plane uses a
 * separate JWT namespace signed with a separate secret, so a tenant token can
 * never satisfy a platform guard (and vice versa). Every check below fails
 * closed.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { platformUsers } from '../db/schema/public.js';
import { UnauthorizedError, ForbiddenError } from '../errors/types.js';
import {
  hasPermission,
  type PlatformPermission,
  type PlatformRole,
} from '../../config/platform-permissions.js';

/**
 * Verifies the platform JWT, confirms the account is still active, and
 * populates request.platformUser.
 *
 * The account is re-read from the database on every request rather than
 * trusted from the token: a deactivated admin must lose access immediately,
 * not whenever their 15-minute token happens to expire.
 */
export async function requirePlatformAuth(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  let payload: { sub?: unknown; role?: unknown; email?: unknown; aud?: unknown; type?: unknown };

  try {
    // Registered under the 'platform' namespace in app.ts — verifies against
    // JWT_PLATFORM_SECRET, so a tenant-plane token cannot pass here.
    payload = await request.platformJwtVerify();
  } catch {
    throw new UnauthorizedError('Invalid or expired platform token');
  }

  // Defence in depth: even with the right secret, reject anything not minted
  // as a platform access token.
  if (payload.aud !== 'platform' || payload.type !== 'access') {
    throw new UnauthorizedError('Token is not a platform access token');
  }

  if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
    throw new UnauthorizedError('Malformed platform token');
  }

  const [user] = await db
    .select({
      id: platformUsers.id,
      email: platformUsers.email,
      role: platformUsers.role,
      isActive: platformUsers.isActive,
    })
    .from(platformUsers)
    .where(eq(platformUsers.id, payload.sub))
    .limit(1);

  if (!user) {
    throw new UnauthorizedError('Platform account no longer exists');
  }

  if (!user.isActive) {
    throw new UnauthorizedError('Platform account is deactivated');
  }

  request.platformUser = {
    platformUserId: user.id,
    role: user.role,
    email: user.email,
  };
}

/**
 * Returns a hook enforcing a single platform permission.
 * Mirrors requireFeature() in feature-gate.ts, but reads from
 * PLATFORM_PERMISSIONS — internal trust is never derived from a merchant's plan.
 *
 * Must run after requirePlatformAuth.
 */
export function requirePlatformPermission(permission: PlatformPermission) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    const platformUser = request.platformUser as PlatformAuthUserMaybe;

    if (!platformUser) {
      throw new UnauthorizedError('Platform authentication required');
    }

    if (!hasPermission(platformUser.role, permission)) {
      throw new ForbiddenError(
        `Requires platform permission '${permission}'. Your role: ${platformUser.role}`,
      );
    }
  };
}

type PlatformAuthUserMaybe = { role: PlatformRole } | undefined;

/**
 * Convenience chain for a platform route: authenticate, then authorise.
 *
 * Register this as `onRequest`, not `preHandler`. Fastify validates the body
 * and querystring between the two, so a preHandler guard lets an unauthorised
 * caller probe the request schema by reading the 400 it gets back before the
 * 401/403 it should have got. Neither guard touches the body, so running them
 * earlier costs nothing.
 */
export function platformGuard(permission: PlatformPermission) {
  return [requirePlatformAuth, requirePlatformPermission(permission)];
}
