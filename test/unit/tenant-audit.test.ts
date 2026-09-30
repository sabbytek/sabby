import { describe, it, expect, vi, beforeEach } from 'vitest';

// Capture what auditUserAction ultimately inserts, without a database. The
// helper writes through withTenantSchema(schema, cb) → db.insert(auditLog).
const insertValues = vi.fn();
vi.mock('../../src/shared/db/tenant.js', () => ({
  withTenantSchema: async (_schema: string, cb: (db: unknown) => unknown) =>
    cb({ insert: () => ({ values: insertValues }) }),
}));

import { auditUserAction } from '../../src/shared/audit/tenant-audit.js';

beforeEach(() => {
  insertValues.mockClear();
});

describe('auditUserAction', () => {
  it('attributes the entry to the acting user', async () => {
    await auditUserAction(
      { schema: 'tenant_test', userId: 'user-1', email: 'owner@example.com' },
      { action: 'order.cancelled', targetType: 'order', targetId: 'order-9' },
    );

    expect(insertValues).toHaveBeenCalledTimes(1);
    const row = insertValues.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(row).toMatchObject({
      actorType: 'user',
      actorId: 'user-1',
      actorEmail: 'owner@example.com',
      action: 'order.cancelled',
      targetType: 'order',
      targetId: 'order-9',
    });
  });

  it('never throws when the write fails — the trail must not break the action', async () => {
    insertValues.mockRejectedValueOnce(new Error('db down'));
    await expect(
      auditUserAction(
        { schema: 'tenant_test', userId: 'user-1', email: 'owner@example.com' },
        { action: 'order.created' },
      ),
    ).resolves.toBeUndefined();
  });
});
