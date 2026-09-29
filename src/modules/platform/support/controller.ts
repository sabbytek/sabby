/**
 * Support controller.
 *
 * Every action writes to BOTH audit trails: the platform log (internal
 * compliance) and, via the service layer, the merchant's own audit_log.
 */

import * as service from './service.js';
import { writeAudit } from '../audit/service.js';
import type { PlatformContext } from '../types.js';

export async function openGrant(ctx: PlatformContext, input: service.OpenGrantInput) {
  const grant = await service.openGrant(ctx, input);

  await writeAudit(ctx, {
    action: 'support.grant_opened',
    targetType: 'tenant_access_grant',
    targetId: grant.grantId,
    tenantId: grant.tenantId,
    reason: grant.reason,
    metadata: { scope: grant.scope, expiresAt: grant.expiresAt.toISOString() },
  });

  return grant;
}

export async function listGrants(query: service.ListGrantsQuery) {
  return service.listGrants(query);
}

export async function revokeGrant(ctx: PlatformContext, grantId: string) {
  const result = await service.revokeGrant(ctx, grantId);

  await writeAudit(ctx, {
    action: 'support.grant_revoked',
    targetType: 'tenant_access_grant',
    targetId: grantId,
  });

  return result;
}

export async function listOrders(
  ctx: PlatformContext,
  tenantId: string,
  schemaName: string,
  page: number,
  limit: number,
) {
  const result = await service.listTenantOrders(schemaName, page, limit);

  // Reads are audited too — the point of a grant is that looking is recorded.
  await writeAudit(ctx, {
    action: 'support.orders_read',
    targetType: 'tenant',
    targetId: tenantId,
    tenantId,
    metadata: { page, limit, returned: result.items.length },
  });

  return result;
}

export async function resendReceipt(
  ctx: PlatformContext,
  tenantId: string,
  schemaName: string,
  invoiceId: string,
) {
  const result = await service.resendReceipt(ctx, tenantId, schemaName, invoiceId);

  await writeAudit(ctx, {
    action: 'support.receipt_resent',
    targetType: 'invoice',
    targetId: invoiceId,
    tenantId,
  });

  return result;
}

export async function retryWebhook(
  ctx: PlatformContext,
  tenantId: string,
  schemaName: string,
  rawPayload: string,
) {
  const result = await service.retryWebhook(ctx, schemaName, rawPayload);

  await writeAudit(ctx, {
    action: 'support.webhook_retried',
    targetType: 'payment_webhook',
    tenantId,
    metadata: { result },
  });

  return result;
}

export async function unlockAccount(
  ctx: PlatformContext,
  tenantId: string,
  schemaName: string,
  userId: string,
  reason: string,
) {
  const result = await service.unlockAccount(ctx, schemaName, userId, reason);

  await writeAudit(ctx, {
    action: 'support.account_unlocked',
    targetType: 'user',
    targetId: userId,
    tenantId,
    reason,
  });

  return result;
}

export async function resetPassword(
  ctx: PlatformContext,
  tenantId: string,
  schemaName: string,
  email: string,
  reason: string,
) {
  const result = await service.triggerPasswordReset(ctx, tenantId, schemaName, email);

  await writeAudit(ctx, {
    action: 'support.password_reset_triggered',
    targetType: 'user',
    tenantId,
    reason,
    metadata: { email },
  });

  return result;
}
