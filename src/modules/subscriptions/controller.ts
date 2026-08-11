/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
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

export async function getSubscriptionHandler(ctx: RequestContext): Promise<unknown> {
  const result = await getSubscription(ctx.schema);
  return result;
}

export async function initiateSubscriptionHandler(
  ctx: RequestContext,
  input: { planTier: Exclude<PlanTier, 'trial'> },
): Promise<unknown> {
  const [tenant] = await db
    .select({ businessEmail: tenants.businessEmail })
    .from(tenants)
    .where(eq(tenants.id, ctx.tenantId))
    .limit(1);

  const email = tenant?.businessEmail ?? ctx.email;

  const result = await initiateSubscription(ctx.schema, ctx.tenantId, input.planTier, email);
  return result;
}

export async function cancelSubscriptionHandler(ctx: RequestContext): Promise<void> {
  await cancelSubscription(ctx.schema, ctx.tenantId);
}
