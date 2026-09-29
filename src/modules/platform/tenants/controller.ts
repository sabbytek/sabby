/**
 * Platform tenants controller.
 *
 * Every mutation writes an audit row before returning. The reason string is
 * required by the validators for state-changing actions — an unexplained
 * suspension is not defensible after the fact.
 */

import * as service from './service.js';
import { writeAudit } from '../audit/service.js';
import type { PlatformContext } from '../types.js';
import type { PlanTier } from '../../../config/features.js';
import { createTenant, type CreateTenantInput } from '../../tenants/service.js';

/**
 * Admin-initiated provisioning — the vetted alternative to public self-signup,
 * used when staff onboard a merchant directly. Reuses the same service as the
 * public route so both paths provision identically.
 */
export async function create(ctx: PlatformContext, input: CreateTenantInput, reason: string) {
  const result = await createTenant(input);

  await writeAudit(ctx, {
    action: 'tenant.create',
    targetType: 'tenant',
    targetId: result.tenantId,
    tenantId: result.tenantId,
    reason,
    metadata: { slug: result.slug, businessEmail: input.businessEmail },
  });

  return result;
}

export async function list(query: {
  search?: string;
  planTier?: PlanTier;
  isActive?: boolean;
  page: number;
  limit: number;
}) {
  return service.listTenants(query);
}

export async function get(tenantId: string) {
  return service.getTenant(tenantId);
}

export async function suspend(ctx: PlatformContext, tenantId: string, reason: string) {
  const result = await service.suspendTenant(tenantId);

  await writeAudit(ctx, {
    action: 'tenant.suspend',
    targetType: 'tenant',
    targetId: tenantId,
    tenantId,
    reason,
    metadata: { before: result.previousState, after: { isActive: false } },
  });

  return { tenantId, isActive: false };
}

export async function reactivate(ctx: PlatformContext, tenantId: string, reason: string) {
  const result = await service.reactivateTenant(tenantId);

  await writeAudit(ctx, {
    action: 'tenant.reactivate',
    targetType: 'tenant',
    targetId: tenantId,
    tenantId,
    reason,
    metadata: { before: result.previousState, after: { isActive: true } },
  });

  return { tenantId, isActive: true };
}

export async function changePlan(
  ctx: PlatformContext,
  tenantId: string,
  planTier: PlanTier,
  reason: string,
) {
  const result = await service.changeTenantPlan(tenantId, planTier);

  await writeAudit(ctx, {
    action: 'tenant.change_plan',
    targetType: 'tenant',
    targetId: tenantId,
    tenantId,
    reason,
    metadata: { before: result.previousState, after: { planTier } },
  });

  return { tenantId, planTier };
}
