/**
 * The bridge between the platform plane and tenant data.
 *
 * requireTenantGrant resolves an active tenant_access_grants row for the
 * authenticated platform user and the :tenantId route param, then populates
 * `request.tenant` with EXACTLY the same `{ tenantId, schema }` contract that
 * resolveTenant produces for merchant requests.
 *
 * That identical shape is the whole point: every existing tenant-scoped
 * service (orders, payments, ledger, …) is reusable from support tooling
 * without modification. No service needs to learn what a platform user is.
 *
 * Holding a platform identity grants nothing here on its own — reach into a
 * specific tenant is always an explicit, time-boxed, reason-carrying grant.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { db } from '../db/client.js';
import { tenantAccessGrants, tenants } from '../db/schema/public.js';
import { ForbiddenError, NotFoundError, UnauthorizedError } from '../errors/types.js';

export type GrantScope = 'read' | 'write';

declare module 'fastify' {
  interface FastifyRequest {
    /** The grant that authorised this request, when it came via the platform plane. */
    tenantGrant?: {
      id: string;
      scope: GrantScope;
      reason: string;
      expiresAt: Date;
    };
  }
}

/**
 * @param required - 'read' is satisfied by a read or write grant; 'write'
 *                   only by a write grant.
 */
export function requireTenantGrant(required: GrantScope) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    const platformUser = request.platformUser as { platformUserId: string } | undefined;
    if (!platformUser) {
      throw new UnauthorizedError('Platform authentication required');
    }

    const params = request.params as { tenantId?: string };
    const tenantId = params.tenantId;
    if (!tenantId) {
      throw new ForbiddenError('No tenant specified for this grant-scoped request');
    }

    const now = new Date();
    const grants = await db
      .select({
        id: tenantAccessGrants.id,
        scope: tenantAccessGrants.scope,
        reason: tenantAccessGrants.reason,
        expiresAt: tenantAccessGrants.expiresAt,
      })
      .from(tenantAccessGrants)
      .where(
        and(
          eq(tenantAccessGrants.platformUserId, platformUser.platformUserId),
          eq(tenantAccessGrants.tenantId, tenantId),
          gt(tenantAccessGrants.expiresAt, now),
          isNull(tenantAccessGrants.revokedAt),
        ),
      );

    // A write grant also satisfies a read requirement; the reverse never holds.
    const grant = grants.find((g) => (required === 'read' ? true : g.scope === 'write'));

    if (!grant) {
      const hasReadOnly = grants.length > 0;
      throw new ForbiddenError(
        hasReadOnly
          ? `Your active grant on this tenant is read-only; '${required}' access is required`
          : 'No active access grant for this tenant. Open one via POST /v1/platform/support/grants.',
      );
    }

    const [tenant] = await db
      .select({ id: tenants.id, schemaName: tenants.schemaName, isActive: tenants.isActive })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    if (!tenant) throw new NotFoundError('Tenant', tenantId);

    // Deliberately NOT gated on tenant.isActive: support must still be able to
    // investigate a suspended merchant, which is often exactly why it was
    // suspended. resolveTenant blocks the merchant; this path is audited.

    request.tenant = { tenantId: tenant.id, schema: tenant.schemaName };
    request.tenantGrant = {
      id: grant.id,
      scope: grant.scope,
      reason: grant.reason,
      expiresAt: grant.expiresAt,
    };
  };
}
