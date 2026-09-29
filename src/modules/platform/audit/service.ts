/**
 * Append-only platform audit log.
 *
 * Every mutating platform action writes exactly one row here, via an explicit
 * writeAudit() call from the controller. This is deliberately not an automatic
 * hook: a reviewer can grep the call sites and see precisely what is recorded,
 * and a visibly missing call is easier to catch than a silently skipped hook.
 *
 * There is no update or delete path, by design.
 */

import { v4 as uuidv4 } from 'uuid';
import { and, desc, eq, gte, lte, sql, type SQL } from 'drizzle-orm';
import { db } from '../../../shared/db/client.js';
import { platformAuditLog } from '../../../shared/db/schema/public.js';
import type { PlatformAuditActor } from '../types.js';

export interface AuditWriteInput {
  action: string; // e.g. 'tenant.suspend'
  targetType?: string; // 'tenant' | 'platform_user' | ...
  targetId?: string;
  tenantId?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Record a platform action. Never throws into the caller's path — an audit
 * failure must not silently roll back an action the operator believes
 * succeeded, but it must be loud in the logs.
 */
export async function writeAudit(actor: PlatformAuditActor, input: AuditWriteInput): Promise<void> {
  try {
    await db.insert(platformAuditLog).values({
      id: uuidv4(),
      actorId: actor.platformUserId,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: input.action,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      tenantId: input.tenantId ?? null,
      reason: input.reason ?? null,
      ipAddress: actor.ipAddress ?? null,
      userAgent: actor.userAgent ?? null,
      requestId: actor.requestId ?? null,
      metadata: input.metadata ?? null,
    });
  } catch (err) {
    console.error('AUDIT WRITE FAILED', {
      action: input.action,
      actorId: actor.platformUserId,
      targetId: input.targetId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export interface AuditQuery {
  actorId?: string;
  action?: string;
  tenantId?: string;
  from?: Date;
  to?: Date;
  page: number;
  limit: number;
}

export async function listAudit(query: AuditQuery) {
  const filters: SQL[] = [];
  if (query.actorId) filters.push(eq(platformAuditLog.actorId, query.actorId));
  if (query.action) filters.push(eq(platformAuditLog.action, query.action));
  if (query.tenantId) filters.push(eq(platformAuditLog.tenantId, query.tenantId));
  if (query.from) filters.push(gte(platformAuditLog.createdAt, query.from));
  if (query.to) filters.push(lte(platformAuditLog.createdAt, query.to));

  const where = filters.length > 0 ? and(...filters) : undefined;

  const rows = await db
    .select()
    .from(platformAuditLog)
    .where(where)
    .orderBy(desc(platformAuditLog.createdAt))
    .limit(query.limit)
    .offset((query.page - 1) * query.limit);

  const [counted] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(platformAuditLog)
    .where(where);

  return { items: rows, total: counted?.count ?? 0 };
}
