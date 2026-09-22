import { and, desc, eq, sql, type SQL } from 'drizzle-orm';
import { db } from '../../shared/db/client.js';
import { platformAuditLog } from '../../shared/db/schema/public.js';

export interface AuditListItem {
  id: string;
  actorId: string | null;
  actorEmail: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  summary: string | null;
  ip: string | null;
  createdAt: Date;
}

export interface ListAuditInput {
  page: number;
  limit: number;
  action?: string;
  targetType?: string;
  targetId?: string;
  // Scope: when the viewer lacks audit:read:all, results are restricted to
  // their own actions by forcing actorId to their id.
  restrictToActorId?: string;
}

export async function listAuditLog(input: ListAuditInput): Promise<{
  items: AuditListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}> {
  const conditions: SQL[] = [];
  if (input.restrictToActorId) {
    conditions.push(eq(platformAuditLog.actorId, input.restrictToActorId));
  }
  if (input.action) conditions.push(eq(platformAuditLog.action, input.action));
  if (input.targetType) conditions.push(eq(platformAuditLog.targetType, input.targetType));
  if (input.targetId) conditions.push(eq(platformAuditLog.targetId, input.targetId));

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const offset = (input.page - 1) * input.limit;

  const [rows, totalRows] = await Promise.all([
    db
      .select({
        id: platformAuditLog.id,
        actorId: platformAuditLog.actorId,
        actorEmail: platformAuditLog.actorEmail,
        action: platformAuditLog.action,
        targetType: platformAuditLog.targetType,
        targetId: platformAuditLog.targetId,
        summary: platformAuditLog.summary,
        ip: platformAuditLog.ip,
        createdAt: platformAuditLog.createdAt,
      })
      .from(platformAuditLog)
      .where(where)
      .orderBy(desc(platformAuditLog.createdAt))
      .limit(input.limit)
      .offset(offset),
    db
      .select({ count: sql<string>`count(*)` })
      .from(platformAuditLog)
      .where(where),
  ]);

  const total = parseInt(totalRows[0]?.count ?? '0', 10) || 0;
  return {
    items: rows,
    total,
    page: input.page,
    limit: input.limit,
    totalPages: Math.ceil(total / input.limit),
  };
}
