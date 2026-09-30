/**
 * Platform (internal admin) plane router.
 *
 * Registered under /v1/platform only when JWT_PLATFORM_SECRET is configured —
 * see app.ts. There is no fallback secret, so an unconfigured deployment
 * simply has no admin plane rather than one protected by a default key.
 */

import type { FastifyInstance } from 'fastify';
import platformAuthRoutes from './auth/routes.js';
import platformTenantRoutes from './tenants/routes.js';
import platformUserRoutes from './users/routes.js';
import platformAuditRoutes from './audit/routes.js';
import platformSupportRoutes from './support/routes.js';
import platformOverviewRoutes from './overview/routes.js';

export default async function platformRoutes(app: FastifyInstance) {
  await app.register(platformAuthRoutes, { prefix: '/auth' });
  await app.register(platformTenantRoutes, { prefix: '/tenants' });
  await app.register(platformUserRoutes, { prefix: '/users' });
  await app.register(platformAuditRoutes, { prefix: '/audit' });
  await app.register(platformSupportRoutes, { prefix: '/support' });
  await app.register(platformOverviewRoutes, { prefix: '/overview' });
}
