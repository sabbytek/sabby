/**
 * Cross-tenant administration for internal staff.
 *
 * Everything here reads or writes the public.tenants row — the tenant's own
 * schema is never touched from this module. Reaching into a tenant's data is
 * a separate, grant-gated capability (Phase B), deliberately not implied by
 * the ability to administer the tenant record.
 */

import { and, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import { db } from '../../../shared/db/client.js';
import { tenants } from '../../../shared/db/schema/public.js';
import { NotFoundError, ValidationError } from '../../../shared/errors/types.js';
import type { PlanTier } from '../../../config/features.js';

export interface TenantListQuery {
  search?: string;
  planTier?: PlanTier;
  isActive?: boolean;
  page: number;
  limit: number;
}

export async function listTenants(query: TenantListQuery) {
  const filters: SQL[] = [];

  if (query.search) {
    const term = `%${query.search}%`;
    const match = or(
      ilike(tenants.name, term),
      ilike(tenants.slug, term),
      ilike(tenants.businessEmail, term),
    );
    if (match) filters.push(match);
  }
  if (query.planTier) filters.push(eq(tenants.planTier, query.planTier));
  if (query.isActive !== undefined) filters.push(eq(tenants.isActive, query.isActive));

  const where = filters.length > 0 ? and(...filters) : undefined;

  const items = await db
    .select({
      id: tenants.id,
      name: tenants.name,
      slug: tenants.slug,
      planTier: tenants.planTier,
      subscriptionStatus: tenants.subscriptionStatus,
      subscriptionExpiresAt: tenants.subscriptionExpiresAt,
      isActive: tenants.isActive,
      businessEmail: tenants.businessEmail,
      businessPhone: tenants.businessPhone,
      createdAt: tenants.createdAt,
    })
    .from(tenants)
    .where(where)
    .orderBy(desc(tenants.createdAt))
    .limit(query.limit)
    .offset((query.page - 1) * query.limit);

  const [counted] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(tenants)
    .where(where);

  return { items, total: counted?.count ?? 0 };
}

export async function getTenant(tenantId: string) {
  const [tenant] = await db
    .select({
      id: tenants.id,
      name: tenants.name,
      slug: tenants.slug,
      schemaName: tenants.schemaName,
      planTier: tenants.planTier,
      subscriptionStatus: tenants.subscriptionStatus,
      subscriptionExpiresAt: tenants.subscriptionExpiresAt,
      isActive: tenants.isActive,
      businessEmail: tenants.businessEmail,
      businessPhone: tenants.businessPhone,
      createdAt: tenants.createdAt,
      updatedAt: tenants.updatedAt,
    })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!tenant) throw new NotFoundError('Tenant', tenantId);
  return tenant;
}

/**
 * Suspend a tenant. resolveTenant() already rejects requests for an inactive
 * tenant, so this takes effect on the merchant's very next request rather
 * than whenever their token expires.
 */
export async function suspendTenant(tenantId: string) {
  const tenant = await getTenant(tenantId);
  if (!tenant.isActive) {
    throw new ValidationError('Tenant is already suspended');
  }

  await db
    .update(tenants)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(tenants.id, tenantId));

  return { tenantId, isActive: false, previousState: { isActive: true } };
}

export async function reactivateTenant(tenantId: string) {
  const tenant = await getTenant(tenantId);
  if (tenant.isActive) {
    throw new ValidationError('Tenant is already active');
  }

  await db
    .update(tenants)
    .set({ isActive: true, updatedAt: new Date() })
    .where(eq(tenants.id, tenantId));

  return { tenantId, isActive: true, previousState: { isActive: false } };
}

/**
 * Change a tenant's plan tier. Returns the previous tier so the caller can
 * record a before/after diff in the audit log — a plan change is a billing
 * event and must be reconstructable.
 */
export async function changeTenantPlan(tenantId: string, planTier: PlanTier) {
  const tenant = await getTenant(tenantId);
  if (tenant.planTier === planTier) {
    throw new ValidationError(`Tenant is already on the '${planTier}' plan`);
  }

  await db.update(tenants).set({ planTier, updatedAt: new Date() }).where(eq(tenants.id, tenantId));

  return {
    tenantId,
    planTier,
    previousState: { planTier: tenant.planTier },
  };
}
