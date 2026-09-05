/**
 * Platform auth controller — orchestrates HTTP concerns and audit writes for
 * the platform ops plane. Business logic lives in service.ts.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  loginPlatformUser,
  refreshPlatformSession,
  revokePlatformRefreshToken,
  getPlatformUserById,
  beginMfaEnrollment,
  confirmMfaEnrollment,
} from './service.js';
import {
  getOverviewKpis,
  listTenants,
  getTenantDetail,
  type ListTenantsInput,
} from './oversight-service.js';
import { setTenantActive, changeTenantPlan, extendTenantTrial } from './mutations-service.js';
import { assertMfaEnrolled } from './service.js';
import { recordAudit } from './audit.js';
import type { PlatformAuthUser } from '../../shared/types/index.js';
import type { PlatformLoginBody } from './validators.js';

type PlanTier = 'trial' | 'entry' | 'growth' | 'enterprise';

function auditContext(request: FastifyRequest): { ip: string; requestId: string } {
  return { ip: request.ip, requestId: request.id };
}

export async function login(
  app: FastifyInstance,
  body: PlatformLoginBody,
  request: FastifyRequest,
): Promise<unknown> {
  const result = await loginPlatformUser(app, body);
  await recordAudit({
    actorId: result.user.id,
    actorEmail: result.user.email,
    action: 'auth.login',
    summary: `Platform login (${result.user.role})`,
    ...auditContext(request),
  });
  return result;
}

export async function refresh(app: FastifyInstance, refreshToken: string): Promise<unknown> {
  return refreshPlatformSession(app, refreshToken);
}

export async function logout(
  platformUser: PlatformAuthUser,
  refreshToken: string,
  request: FastifyRequest,
): Promise<unknown> {
  await revokePlatformRefreshToken(refreshToken);
  await recordAudit({
    actorId: platformUser.userId,
    actorEmail: platformUser.email,
    action: 'auth.logout',
    ...auditContext(request),
  });
  return { message: 'Logged out successfully' };
}

export async function me(platformUser: PlatformAuthUser): Promise<unknown> {
  return getPlatformUserById(platformUser.userId);
}

export async function startMfaEnrollment(platformUser: PlatformAuthUser): Promise<unknown> {
  return beginMfaEnrollment(platformUser.userId);
}

export async function verifyMfaEnrollment(
  platformUser: PlatformAuthUser,
  totp: string,
  request: FastifyRequest,
): Promise<unknown> {
  await confirmMfaEnrollment(platformUser.userId, totp);
  await recordAudit({
    actorId: platformUser.userId,
    actorEmail: platformUser.email,
    action: 'auth.mfa_enabled',
    summary: 'MFA enrollment confirmed',
    ...auditContext(request),
  });
  return { message: 'MFA enabled successfully' };
}

// ─── Tenant oversight (read-only) ─────────────────────────────────────────────
// Reads are not audited; only state changes and PII reveals are.

export async function overview(): Promise<unknown> {
  return getOverviewKpis();
}

export async function tenants(query: ListTenantsInput): Promise<unknown> {
  return listTenants(query);
}

export async function tenantDetail(id: string): Promise<unknown> {
  return getTenantDetail(id);
}

// ─── Tenant mutations (audited; MFA enforced for admin/super-admin) ────────────

export async function suspendTenant(
  actor: PlatformAuthUser,
  id: string,
  request: FastifyRequest,
): Promise<unknown> {
  await assertMfaEnrolled(actor.userId, actor.role);
  const result = await setTenantActive(id, false);
  await recordAudit({
    actorId: actor.userId,
    actorEmail: actor.email,
    action: 'tenant.suspend',
    targetType: 'tenant',
    targetId: id,
    summary: `Suspended ${result.summary.name}`,
    before: result.before,
    after: result.after,
    ...auditContext(request),
  });
  return result.summary;
}

export async function reactivateTenant(
  actor: PlatformAuthUser,
  id: string,
  request: FastifyRequest,
): Promise<unknown> {
  await assertMfaEnrolled(actor.userId, actor.role);
  const result = await setTenantActive(id, true);
  await recordAudit({
    actorId: actor.userId,
    actorEmail: actor.email,
    action: 'tenant.reactivate',
    targetType: 'tenant',
    targetId: id,
    summary: `Reactivated ${result.summary.name}`,
    before: result.before,
    after: result.after,
    ...auditContext(request),
  });
  return result.summary;
}

export async function changePlan(
  actor: PlatformAuthUser,
  id: string,
  planTier: PlanTier,
  request: FastifyRequest,
): Promise<unknown> {
  await assertMfaEnrolled(actor.userId, actor.role);
  const result = await changeTenantPlan(id, planTier);
  await recordAudit({
    actorId: actor.userId,
    actorEmail: actor.email,
    action: 'tenant.plan_change',
    targetType: 'tenant',
    targetId: id,
    summary: `Plan ${String(result.before['planTier'])} → ${String(result.after['planTier'])}`,
    before: result.before,
    after: result.after,
    ...auditContext(request),
  });
  return result.summary;
}

export async function extendTrial(
  actor: PlatformAuthUser,
  id: string,
  days: number,
  request: FastifyRequest,
): Promise<unknown> {
  await assertMfaEnrolled(actor.userId, actor.role);
  const result = await extendTenantTrial(id, days);
  await recordAudit({
    actorId: actor.userId,
    actorEmail: actor.email,
    action: 'tenant.trial_extend',
    targetType: 'tenant',
    targetId: id,
    summary: `Extended trial by ${String(days)} days`,
    before: result.before,
    after: result.after,
    ...auditContext(request),
  });
  return result.summary;
}
