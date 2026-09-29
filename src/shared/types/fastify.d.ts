import '@fastify/jwt';
import type { TenantContext, PlatformAuthUser, PlatformJwtPayload } from './index.js';

/**
 * JWT payload stored in the token.
 * `sub` = userId, `tid` = tenantId — short names to keep token size minimal.
 */
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      sub: string;
      tid: string;
      role: 'owner' | 'manager' | 'staff' | 'viewer';
      email: string;
      type: 'access' | 'refresh';
    };
    user: {
      sub: string;
      tid: string;
      role: 'owner' | 'manager' | 'staff' | 'viewer';
      email: string;
      type: 'access' | 'refresh';
      // Convenience aliases populated after jwtVerify
      userId: string;
      tenantId: string;
    };
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    tenant: TenantContext;
    /**
     * Populated by requirePlatformAuth for internal-staff requests only.
     * Never set on tenant-plane requests — the two planes are disjoint.
     */
    platformUser: PlatformAuthUser;
    /**
     * Verifies against JWT_PLATFORM_SECRET. Added by the second @fastify/jwt
     * registration (namespace: 'platform') in app.ts, so a tenant-plane token
     * can never satisfy it.
     */
    platformJwtVerify<T = PlatformJwtPayload>(): Promise<T>;
  }
}

// Note: instance-side signing is NOT a decorator. @fastify/jwt puts the
// namespaced signer at app.jwt.platform.sign() — see
// modules/platform/auth/jwt.ts, which wraps it in a typed helper.
