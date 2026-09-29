/**
 * Support tooling: time-boxed tenant access grants and a fixed set of
 * repair actions.
 *
 * The repair actions are deliberately a closed whitelist. Support can read a
 * merchant's data under a grant and run these four remedies; it cannot write
 * orders, inventory or ledger entries. Widening this list is a policy decision,
 * not a code convenience — add to PLATFORM_PERMISSIONS first.
 */

import { v4 as uuidv4 } from 'uuid';
import { and, desc, eq, gt, isNull, sql, type SQL } from 'drizzle-orm';
import { db } from '../../../shared/db/client.js';
import { tenantAccessGrants, tenants, platformUsers } from '../../../shared/db/schema/public.js';
import { withTenantSchema } from '../../../shared/db/tenant.js';
import { users, invoices, orders } from '../../../shared/db/schema/tenant.js';
import { NotFoundError, ValidationError } from '../../../shared/errors/types.js';
import { writeTenantAudit } from '../../../shared/audit/tenant-audit.js';
import { notificationsQueue, documentsQueue } from '../../../shared/queue/client.js';
import type { PlatformContext } from '../types.js';
import type { GenerateInvoiceJobData } from '../../invoicing/service.js';

/** Grants are short by default; long-lived access defeats the purpose. */
const DEFAULT_GRANT_MINUTES = 60;
const MAX_GRANT_MINUTES = 24 * 60;

export interface OpenGrantInput {
  tenantId: string;
  scope: 'read' | 'write';
  reason: string;
  durationMinutes?: number;
}

/**
 * Open a grant, notify the merchant owner, and record it on the merchant's own
 * audit trail. The notification and trail entry are the merchant's side of the
 * bargain: support can look, but never invisibly.
 */
export async function openGrant(ctx: PlatformContext, input: OpenGrantInput) {
  const minutes = Math.min(input.durationMinutes ?? DEFAULT_GRANT_MINUTES, MAX_GRANT_MINUTES);

  const [tenant] = await db
    .select({
      id: tenants.id,
      name: tenants.name,
      schemaName: tenants.schemaName,
      businessPhone: tenants.businessPhone,
      businessEmail: tenants.businessEmail,
    })
    .from(tenants)
    .where(eq(tenants.id, input.tenantId))
    .limit(1);

  if (!tenant) throw new NotFoundError('Tenant', input.tenantId);

  const expiresAt = new Date(Date.now() + minutes * 60 * 1000);
  const grantId = uuidv4();

  await db.insert(tenantAccessGrants).values({
    id: grantId,
    platformUserId: ctx.platformUserId,
    tenantId: tenant.id,
    scope: input.scope,
    reason: input.reason,
    expiresAt,
  });

  // The merchant's own record of the access.
  await writeTenantAudit(tenant.schemaName, {
    actorType: 'platform',
    actorId: ctx.platformUserId,
    actorEmail: ctx.email,
    action: 'support.access_granted',
    targetType: 'tenant',
    targetId: tenant.id,
    reason: input.reason,
    metadata: { scope: input.scope, expiresAt: expiresAt.toISOString(), grantId },
  });

  // And an active notification, so they do not have to go looking.
  if (tenant.businessPhone) {
    await notificationsQueue.add('send-sms', {
      to: tenant.businessPhone,
      tenantId: tenant.id,
      message:
        `[BPOS] Support staff (${ctx.email}) opened ${input.scope} access to your account ` +
        `for ${String(minutes)} minutes. Reason: ${input.reason}`,
    });
  }

  return {
    grantId,
    tenantId: tenant.id,
    scope: input.scope,
    reason: input.reason,
    expiresAt,
  };
}

export interface ListGrantsQuery {
  tenantId?: string;
  activeOnly?: boolean;
  page: number;
  limit: number;
}

export async function listGrants(query: ListGrantsQuery) {
  const filters: SQL[] = [];
  if (query.tenantId) filters.push(eq(tenantAccessGrants.tenantId, query.tenantId));
  if (query.activeOnly) {
    filters.push(gt(tenantAccessGrants.expiresAt, new Date()));
    filters.push(isNull(tenantAccessGrants.revokedAt));
  }
  const where = filters.length > 0 ? and(...filters) : undefined;

  const items = await db
    .select({
      id: tenantAccessGrants.id,
      tenantId: tenantAccessGrants.tenantId,
      platformUserId: tenantAccessGrants.platformUserId,
      platformUserEmail: platformUsers.email,
      scope: tenantAccessGrants.scope,
      reason: tenantAccessGrants.reason,
      expiresAt: tenantAccessGrants.expiresAt,
      revokedAt: tenantAccessGrants.revokedAt,
      createdAt: tenantAccessGrants.createdAt,
    })
    .from(tenantAccessGrants)
    .leftJoin(platformUsers, eq(platformUsers.id, tenantAccessGrants.platformUserId))
    .where(where)
    .orderBy(desc(tenantAccessGrants.createdAt))
    .limit(query.limit)
    .offset((query.page - 1) * query.limit);

  const [counted] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(tenantAccessGrants)
    .where(where);

  return { items, total: counted?.count ?? 0 };
}

export async function revokeGrant(ctx: PlatformContext, grantId: string) {
  const [grant] = await db
    .select()
    .from(tenantAccessGrants)
    .where(eq(tenantAccessGrants.id, grantId))
    .limit(1);

  if (!grant) throw new NotFoundError('Access grant', grantId);
  if (grant.revokedAt) throw new ValidationError('Grant is already revoked');

  await db
    .update(tenantAccessGrants)
    .set({ revokedAt: new Date() })
    .where(eq(tenantAccessGrants.id, grantId));

  const [tenant] = await db
    .select({ schemaName: tenants.schemaName })
    .from(tenants)
    .where(eq(tenants.id, grant.tenantId))
    .limit(1);

  if (tenant) {
    await writeTenantAudit(tenant.schemaName, {
      actorType: 'platform',
      actorId: ctx.platformUserId,
      actorEmail: ctx.email,
      action: 'support.access_revoked',
      targetType: 'tenant',
      targetId: grant.tenantId,
      metadata: { grantId },
    });
  }

  return { grantId, revoked: true };
}

// ─── Repair actions (closed whitelist) ───────────────────────────────────────

/**
 * Re-run invoice generation and delivery for an order. Reuses the same
 * documents-queue job the normal flow uses, so the merchant's customer gets
 * exactly the document they would have got originally.
 */
export async function resendReceipt(
  ctx: PlatformContext,
  tenantId: string,
  schemaName: string,
  invoiceId: string,
) {
  const invoice = await withTenantSchema(schemaName, async (tdb) => {
    const [found] = await tdb
      .select({ id: invoices.id, orderId: invoices.orderId })
      .from(invoices)
      .where(eq(invoices.id, invoiceId))
      .limit(1);
    return found;
  });

  if (!invoice) throw new NotFoundError('Invoice', invoiceId);

  // invoices.orderId is nullable, but the PDF is rendered from the order's line
  // items — a detached invoice has nothing to regenerate from.
  if (!invoice.orderId) {
    throw new ValidationError(
      `Invoice ${invoiceId} is not linked to an order, so it cannot be regenerated`,
    );
  }

  await documentsQueue.add('generate-invoice-pdf', {
    tenantId,
    schemaName,
    invoiceId: invoice.id,
    orderId: invoice.orderId,
  } satisfies GenerateInvoiceJobData);

  await writeTenantAudit(schemaName, {
    actorType: 'platform',
    actorId: ctx.platformUserId,
    actorEmail: ctx.email,
    action: 'support.receipt_resent',
    targetType: 'invoice',
    targetId: invoiceId,
  });

  return { invoiceId, queued: true };
}

/**
 * Re-process a payment webhook from its stored raw payload.
 *
 * handlePaystackWebhook is idempotent on gatewayEventId, so replaying an event
 * that already landed is a no-op rather than a double credit — which is what
 * makes this safe to hand to support.
 */
export async function retryWebhook(ctx: PlatformContext, schemaName: string, rawPayload: string) {
  let parsed: { event?: string; data?: unknown };
  try {
    parsed = JSON.parse(rawPayload) as { event?: string; data?: unknown };
  } catch {
    throw new ValidationError('rawPayload is not valid JSON');
  }

  if (!parsed.event || !parsed.data) {
    throw new ValidationError('rawPayload must contain "event" and "data" fields');
  }

  const { handlePaystackWebhook } = await import('../../payments/service.js');
  const result = await handlePaystackWebhook(
    schemaName,
    parsed.event,
    parsed.data as Parameters<typeof handlePaystackWebhook>[2],
  );

  await writeTenantAudit(schemaName, {
    actorType: 'platform',
    actorId: ctx.platformUserId,
    actorEmail: ctx.email,
    action: 'support.webhook_retried',
    targetType: 'payment_webhook',
    metadata: { event: parsed.event, result },
  });

  return result;
}

/**
 * Reactivate a deactivated merchant user. Note this reverses an explicit
 * deactivation — there is no automatic lockout mechanism in the tenant plane
 * today, so this is the only way an account becomes inactive.
 */
export async function unlockAccount(
  ctx: PlatformContext,
  schemaName: string,
  userId: string,
  reason: string,
) {
  const user = await withTenantSchema(schemaName, async (tdb) => {
    const [found] = await tdb
      .select({ id: users.id, email: users.email, isActive: users.isActive })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return found;
  });

  if (!user) throw new NotFoundError('User', userId);
  if (user.isActive) throw new ValidationError('User account is already active');

  await withTenantSchema(schemaName, async (tdb) => {
    await tdb
      .update(users)
      .set({ isActive: true, updatedAt: new Date() })
      .where(eq(users.id, userId));
  });

  await writeTenantAudit(schemaName, {
    actorType: 'platform',
    actorId: ctx.platformUserId,
    actorEmail: ctx.email,
    action: 'support.account_unlocked',
    targetType: 'user',
    targetId: userId,
    reason,
    metadata: { before: { isActive: false }, after: { isActive: true } },
  });

  return { userId, isActive: true };
}

/**
 * Trigger the normal password-reset email for a merchant user.
 *
 * Support never sets a password or sees a token — this only kicks off the
 * same self-service flow the merchant could start themselves, so the reset
 * link goes to the merchant's own inbox.
 */
export async function triggerPasswordReset(
  ctx: PlatformContext,
  tenantId: string,
  schemaName: string,
  email: string,
) {
  const { requestPasswordReset } = await import('../../auth/service.js');
  await requestPasswordReset(tenantId, schemaName, email);

  await writeTenantAudit(schemaName, {
    actorType: 'platform',
    actorId: ctx.platformUserId,
    actorEmail: ctx.email,
    action: 'support.password_reset_triggered',
    targetType: 'user',
    metadata: { email },
  });

  // Same non-committal shape as the public endpoint — no enumeration signal.
  return { message: 'If the email exists, a reset link has been sent' };
}

// ─── Grant-scoped reads ──────────────────────────────────────────────────────

export async function listTenantOrders(schemaName: string, page: number, limit: number) {
  return withTenantSchema(schemaName, async (tdb) => {
    const items = await tdb
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        status: orders.status,
        paymentStatus: orders.paymentStatus,
        totalKobo: orders.totalKobo,
        channel: orders.channel,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .orderBy(desc(orders.createdAt))
      .limit(limit)
      .offset((page - 1) * limit);

    const [counted] = await tdb.select({ count: sql<number>`count(*)::int` }).from(orders);
    return { items, total: counted?.count ?? 0 };
  });
}
