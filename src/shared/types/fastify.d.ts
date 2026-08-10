import '@fastify/jwt';
import type { TenantContext } from './index.js';

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
  }
}
