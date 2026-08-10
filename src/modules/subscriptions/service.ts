import { v4 as uuidv4 } from 'uuid';
import { eq } from 'drizzle-orm';
import { withTenantSchema } from '../../shared/db/tenant.js';
import { subscriptions } from '../../shared/db/schema/tenant.js';
import { db } from '../../shared/db/client.js';
import { tenants } from '../../shared/db/schema/public.js';
import { NotFoundError, ValidationError } from '../../shared/errors/types.js';
import { paystackGateway } from '../../shared/payments/paystack.js';
import { PLAN_PRICING_NGN, type PlanTier } from '../../config/features.js';
import { env } from '../../config/env.js';
import { assertTransition, type SubscriptionStatus } from './state-machine.js';

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getSubscription(schemaName: string) {
  return withTenantSchema(schemaName, async (db) => {
    const [sub] = await db.select().from(subscriptions).limit(1);
    if (!sub) throw new NotFoundError('Subscription', schemaName);
    return sub;
  });
}

// ─── Initiate ─────────────────────────────────────────────────────────────────

export async function initiateSubscription(
  schemaName: string,
  tenantId: string,
  planTier: Exclude<PlanTier, 'trial'>,
  email: string,
) {
  const priceKobo = PLAN_PRICING_NGN[planTier];
  if (priceKobo === 0) {
    throw new ValidationError('Enterprise plans require manual billing setup — contact support');
  }

  const reference = `bpos-sub-${uuidv4()}`;
  const callbackUrl = `${env.PLATFORM_BASE_URL}/v1/subscriptions/callback`;

  const result = await paystackGateway.initiatePayment({
    email,
    amountKobo: priceKobo,
    reference,
    callbackUrl,
    metadata: { type: 'subscription', tenantId, schemaName, planTier },
  });

  return { authorizationUrl: result.authorizationUrl, reference };
}

// ─── Activate ─────────────────────────────────────────────────────────────────

export async function activateSubscription(
  schemaName: string,
  tenantId: string,
  planTier: Exclude<PlanTier, 'trial'>,
  authorizationCode: string,
  customerCode: string,
) {
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setDate(periodEnd.getDate() + 30);

  await withTenantSchema(schemaName, async (tenantDb) => {
    const [existing] = await tenantDb
      .select({ id: subscriptions.id, status: subscriptions.status })
      .from(subscriptions)
      .limit(1);

    if (existing) {
      assertTransition(existing.status as SubscriptionStatus, 'active');
      await tenantDb
        .update(subscriptions)
        .set({
          planTier,
          status: 'active',
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          paystackAuthorizationCode: authorizationCode,
          paystackCustomerCode: customerCode,
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.id, existing.id));
    } else {
      await tenantDb.insert(subscriptions).values({
        id: uuidv4(),
        planTier,
        status: 'active',
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        paystackAuthorizationCode: authorizationCode,
        paystackCustomerCode: customerCode,
      });
    }
  });

  // Sync denormalised public record — read by feature gate on every request
  await db
    .update(tenants)
    .set({
      planTier: planTier as 'entry' | 'growth' | 'enterprise',
      subscriptionStatus: 'active',
      subscriptionExpiresAt: periodEnd,
      updatedAt: new Date(),
    })
    .where(eq(tenants.id, tenantId));
}

// ─── Grace period ─────────────────────────────────────────────────────────────

export async function startGracePeriod(schemaName: string, tenantId: string) {
  const graceEnd = new Date();
  graceEnd.setDate(graceEnd.getDate() + 7);

  await withTenantSchema(schemaName, async (tenantDb) => {
    const [existing] = await tenantDb
      .select({ id: subscriptions.id, status: subscriptions.status })
      .from(subscriptions)
      .limit(1);
    if (!existing) throw new NotFoundError('Subscription', schemaName);
    assertTransition(existing.status as SubscriptionStatus, 'grace');

    await tenantDb
      .update(subscriptions)
      .set({ status: 'grace', currentPeriodEnd: graceEnd, updatedAt: new Date() })
      .where(eq(subscriptions.id, existing.id));
  });

  await db
    .update(tenants)
    .set({ subscriptionStatus: 'grace', updatedAt: new Date() })
    .where(eq(tenants.id, tenantId));
}

// ─── Lapse ────────────────────────────────────────────────────────────────────

export async function lapseSubscription(schemaName: string, tenantId: string) {
  await withTenantSchema(schemaName, async (tenantDb) => {
    const [existing] = await tenantDb
      .select({ id: subscriptions.id, status: subscriptions.status })
      .from(subscriptions)
      .limit(1);
    if (!existing) throw new NotFoundError('Subscription', schemaName);
    assertTransition(existing.status as SubscriptionStatus, 'lapsed');

    await tenantDb
      .update(subscriptions)
      .set({ status: 'lapsed', updatedAt: new Date() })
      .where(eq(subscriptions.id, existing.id));
  });

  await db
    .update(tenants)
    .set({ subscriptionStatus: 'lapsed', updatedAt: new Date() })
    .where(eq(tenants.id, tenantId));
}

// ─── Cancel ───────────────────────────────────────────────────────────────────

export async function cancelSubscription(schemaName: string, tenantId: string) {
  await withTenantSchema(schemaName, async (tenantDb) => {
    const [existing] = await tenantDb
      .select({ id: subscriptions.id, status: subscriptions.status })
      .from(subscriptions)
      .limit(1);
    if (!existing) throw new NotFoundError('Subscription', schemaName);
    assertTransition(existing.status as SubscriptionStatus, 'cancelled');

    await tenantDb
      .update(subscriptions)
      .set({ status: 'cancelled', cancelledAt: new Date(), updatedAt: new Date() })
      .where(eq(subscriptions.id, existing.id));
  });

  await db
    .update(tenants)
    .set({ subscriptionStatus: 'cancelled', updatedAt: new Date() })
    .where(eq(tenants.id, tenantId));
}

// ─── Webhook handler ──────────────────────────────────────────────────────────

export async function handleSubscriptionBillingWebhook(
  eventType: string,
  tenantId: string,
  schemaName: string,
  planTier: Exclude<PlanTier, 'trial'>,
  authorizationCode: string,
  customerCode: string,
) {
  if (eventType === 'charge.success') {
    await activateSubscription(schemaName, tenantId, planTier, authorizationCode, customerCode);
  } else if (eventType === 'charge.failed') {
    // Billing failure: enter grace period; cron job will lapse after 7 days
    await startGracePeriod(schemaName, tenantId).catch(() => {});
  }
}
