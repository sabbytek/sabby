import type { RequestContext } from '../../shared/types/controller.js';
import type { PlanTier } from '../../config/features.js';
import { db } from '../../shared/db/client.js';
import { tenants } from '../../shared/db/schema/public.js';
import { eq } from 'drizzle-orm';
import {
  getSubscription,
  initiateSubscription,
  cancelSubscription,
} from './service.js';

export async function getSubscriptionHandler(ctx: RequestContext) {
  return getSubscription(ctx.schema);
}

export async function initiateSubscriptionHandler(
  ctx: RequestContext,
  input: { planTier: Exclude<PlanTier, 'trial'> },
) {
  const [tenant] = await db
    .select({ businessEmail: tenants.businessEmail })
    .from(tenants)
    .where(eq(tenants.id, ctx.tenantId))
    .limit(1);

  const email = tenant?.businessEmail ?? ctx.email;

  return initiateSubscription(ctx.schema, ctx.tenantId, input.planTier, email);
}

export async function cancelSubscriptionHandler(ctx: RequestContext) {
  await cancelSubscription(ctx.schema, ctx.tenantId);
}
