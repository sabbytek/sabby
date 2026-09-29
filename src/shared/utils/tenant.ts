import { db } from '../db/client.js';
import { tenants } from '../db/schema/public.js';
import { eq } from 'drizzle-orm';
import { NotFoundError } from '../errors/types.js';

/**
 * Resolves a tenant by slug from the public schema.
 * Used by auth endpoints that don't have JWT context yet.
 */
export async function resolveTenantFromSlug(tenantSlug: string) {
  const [tenant] = await db
    .select({ id: tenants.id, schemaName: tenants.schemaName })
    .from(tenants)
    .where(eq(tenants.slug, tenantSlug))
    .limit(1);
  if (!tenant) throw new NotFoundError('Tenant');
  return tenant;
}
