/**
 * Append-only audit trail for the platform ops plane.
 *
 * Every state-changing or PII-revealing platform action must write one entry.
 * Rows are never updated or deleted from application code. If it is not logged,
 * it should not have been allowed.
 */
import { v4 as uuidv4 } from 'uuid';
import { db } from '../../shared/db/client.js';
import { platformAuditLog } from '../../shared/db/schema/public.js';

export interface AuditEntryInput {
  actorId?: string | null;
  actorEmail: string;
  action: string; // dotted verb, e.g. 'auth.login', 'tenant.suspend'
  targetType?: string;
  targetId?: string;
  summary?: string;
  before?: unknown;
  after?: unknown;
  ip?: string;
  requestId?: string;
}

export async function recordAudit(entry: AuditEntryInput): Promise<void> {
  await db.insert(platformAuditLog).values({
    id: uuidv4(),
    actorId: entry.actorId ?? null,
    actorEmail: entry.actorEmail,
    action: entry.action,
    targetType: entry.targetType ?? null,
    targetId: entry.targetId ?? null,
    summary: entry.summary ?? null,
    before: entry.before ?? null,
    after: entry.after ?? null,
    ip: entry.ip ?? null,
    requestId: entry.requestId ?? null,
  });
}
