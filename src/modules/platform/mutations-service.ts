import { eq } from 'drizzle-orm';
import { db } from '../../shared/db/client.js';
import { tenants } from '../../shared/db/schema/public.js';
import { subscriptions } from '../../shared/db/schema/tenant.js';
import { withTenantSchema } from '../../shared/db/tenant.js';
import { NotFoundError, ValidationError } from '../../shared/errors/types.js';
import { maskEmail, maskPhone } from './mask.js';

type TenantRow = typeof tenants.$inferSelect;
type PlanTier = (typeof tenants.planTier.enumValues)[number];

/** Masked, list-shaped view returned by every mutation. */
function summarize(t: TenantRow) {
  return {
    id: t.id,
    name: t.name,
    slug: t.slug,
    planTier: t.planTier,
    subscriptionStatus: t.subscriptionStatus,
    isActive: t.isActive,
    subscriptionExpiresAt: t.subscriptionExpiresAt,
    businessEmail: maskEmail(t.businessEmail),
    businessPhone: maskPhone(t.businessPhone),
    createdAt: t.createdAt,
  };
}

export type TenantSummary = ReturnType<typeof summarize>;

export interface MutationResult {
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  summary: TenantSummary;
}

async function loadTenant(id: string): Promise<TenantRow> {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, id)).limit(1);
  if (!tenant) throw new NotFoundError('Tenant', id);
  return tenant;
}

/** Sync a single field onto the tenant-schema subscription row, if one exists. */
async function syncSubscription(
  schemaName: string,
  patch: Partial<typeof subscriptions.$inferInsert>,
) {
  await withTenantSchema(schemaName, async (tenantDb) => {
    const [row] = await tenantDb.select({ id: subscriptions.id }).from(subscriptions).limit(1);
    if (!row) return;
    await tenantDb
      .update(subscriptions)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(subscriptions.id, row.id));
  }).catch(() => undefined); // best-effort; public.tenants is authoritative for gating
}

export async function setTenantActive(id: string, isActive: boolean): Promise<MutationResult> {
  const before = await loadTenant(id);
  const [updated] = await db
    .update(tenants)
    .set({ isActive, updatedAt: new Date() })
    .where(eq(tenants.id, id))
    .returning();
  if (!updated) throw new NotFoundError('Tenant', id);
  return {
    before: { isActive: before.isActive },
    after: { isActive: updated.isActive },
    summary: summarize(updated),
  };
}

export async function changeTenantPlan(id: string, planTier: PlanTier): Promise<MutationResult> {
  const before = await loadTenant(id);
  const [updated] = await db
    .update(tenants)
    .set({ planTier, updatedAt: new Date() })
    .where(eq(tenants.id, id))
    .returning();
  if (!updated) throw new NotFoundError('Tenant', id);
  await syncSubscription(before.schemaName, { planTier });
  return {
    before: { planTier: before.planTier },
    after: { planTier: updated.planTier },
    summary: summarize(updated),
  };
}

export async function extendTenantTrial(id: string, days: number): Promise<MutationResult> {
  const before = await loadTenant(id);
  if (before.subscriptionStatus !== 'trial') {
    throw new ValidationError('Only tenants currently on trial can have their trial extended.');
  }
  const now = new Date();
  const anchor =
    before.subscriptionExpiresAt && before.subscriptionExpiresAt > now
      ? before.subscriptionExpiresAt
      : now;
  const newExpiry = new Date(anchor.getTime() + days * 24 * 60 * 60 * 1000);

  const [updated] = await db
    .update(tenants)
    .set({ subscriptionExpiresAt: newExpiry, updatedAt: new Date() })
    .where(eq(tenants.id, id))
    .returning();
  if (!updated) throw new NotFoundError('Tenant', id);
  await syncSubscription(before.schemaName, { trialEndsAt: newExpiry });
  return {
    before: { subscriptionExpiresAt: before.subscriptionExpiresAt },
    after: { subscriptionExpiresAt: updated.subscriptionExpiresAt },
    summary: summarize(updated),
  };
}
