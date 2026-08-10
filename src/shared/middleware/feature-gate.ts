import type { FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../db/client.js';
import { tenants } from '../db/schema/public.js';
import { eq } from 'drizzle-orm';
import { PLAN_ENTITLEMENTS, type FeatureKey } from '../../config/features.js';
import { FeatureGatedError } from '../errors/types.js';

/**
 * Returns a preHandler that checks whether the tenant's current plan
 * grants access to the given feature.
 *
 * Must be used after resolveTenant — depends on request.tenant being populated.
 */
export function requireFeature(feature: FeatureKey) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    const tenantId = request.tenant.tenantId;

    const [tenant] = await db
      .select({ planTier: tenants.planTier, subscriptionStatus: tenants.subscriptionStatus })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    if (!tenant) {
      throw new FeatureGatedError(feature);
    }

    const plan = tenant.planTier;
    const entitlements = PLAN_ENTITLEMENTS[plan];
    const entitlement = entitlements[feature];

    if (!entitlement.allowed) {
      throw new FeatureGatedError(feature);
    }

    // If subscription is lapsed, only allow subscriptions:manage
    if (tenant.subscriptionStatus === 'lapsed' && feature !== 'subscriptions:manage') {
      throw new FeatureGatedError(feature);
    }
  };
}
