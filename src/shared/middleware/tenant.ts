import type { FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../db/client.js';
import { tenants } from '../db/schema/public.js';
import { eq } from 'drizzle-orm';
import { UnauthorizedError, NotFoundError } from '../errors/types.js';

/**
 * Resolves the tenant from the authenticated JWT payload and attaches
 * the tenant context (id + schema name) to the request.
 *
 * Must be used after requireAuth — depends on request.user being populated.
 */
export async function resolveTenant(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const tenantId = request.user.tenantId;
  if (!tenantId) {
    throw new UnauthorizedError('Tenant context missing from token');
  }

  const [tenant] = await db
    .select({ id: tenants.id, schemaName: tenants.schemaName, isActive: tenants.isActive })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!tenant) {
    throw new NotFoundError('Tenant', tenantId);
  }

  if (!tenant.isActive) {
    throw new UnauthorizedError('Tenant account is suspended');
  }

  request.tenant = {
    tenantId: tenant.id,
    schema: tenant.schemaName,
  };
}
