import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RequestContext } from '../../src/shared/types/controller.js';

// The controllers call auditUserAction after a successful mutation. Mock the
// audit module so we can assert the entry each controller records without
// touching a database, and mock the service layer so the controller returns a
// predictable entity.
const auditUserAction = vi.fn();
vi.mock('../../src/shared/audit/tenant-audit.js', () => ({
  auditUserAction: (...args: unknown[]) => auditUserAction(...args),
}));

vi.mock('../../src/modules/orders/service.js', () => ({
  createOrder: vi
    .fn()
    .mockResolvedValue({ id: 'order-1', orderNumber: 'ORD-1', channel: 'manual' }),
  confirmOrder: vi.fn().mockResolvedValue({ id: 'order-1', status: 'confirmed' }),
  processOrder: vi.fn().mockResolvedValue({ id: 'order-1', status: 'processing' }),
  fulfillOrder: vi.fn().mockResolvedValue({ id: 'order-1', status: 'fulfilled' }),
  cancelOrder: vi.fn().mockResolvedValue({ id: 'order-1', status: 'cancelled' }),
  listOrders: vi.fn(),
  getOrder: vi.fn(),
}));

vi.mock('../../src/modules/staff/service.js', () => ({
  inviteStaff: vi.fn().mockResolvedValue({ id: 'staff-1' }),
  updateStaffMember: vi.fn().mockResolvedValue({ id: 'staff-1' }),
  deactivateStaffMember: vi.fn().mockResolvedValue(undefined),
  listStaff: vi.fn(),
  getStaffMember: vi.fn(),
}));

import * as orders from '../../src/modules/orders/controller.js';
import * as staff from '../../src/modules/staff/controller.js';

const ctx: RequestContext = {
  schema: 'tenant_test',
  tenantId: 'tenant-1',
  userId: 'user-1',
  role: 'owner',
  email: 'owner@example.com',
};

beforeEach(() => {
  auditUserAction.mockClear();
});

describe('order mutations write the owner activity trail', () => {
  it('records order.created with the new order id', async () => {
    await orders.create(ctx, { channel: 'manual', items: [] });
    expect(auditUserAction).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        action: 'order.created',
        targetType: 'order',
        targetId: 'order-1',
      }),
    );
  });

  it.each([
    ['confirm', 'order.confirmed'],
    ['process', 'order.processing'],
    ['fulfil', 'order.fulfilled'],
    ['cancel', 'order.cancelled'],
  ] as const)('records %s as %s', async (method, action) => {
    await (orders[method] as (c: RequestContext, id: string) => Promise<unknown>)(ctx, 'order-1');
    expect(auditUserAction).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ action, targetType: 'order', targetId: 'order-1' }),
    );
  });
});

describe('staff mutations write the owner activity trail', () => {
  it('records staff.invited with email and role', async () => {
    await staff.invite(ctx, {
      email: 'new@example.com',
      firstName: 'A',
      lastName: 'B',
      role: 'manager',
      temporaryPassword: 'x',
    });
    expect(auditUserAction).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        action: 'staff.invited',
        targetId: 'staff-1',
        metadata: expect.objectContaining({ email: 'new@example.com', role: 'manager' }),
      }),
    );
  });

  it('surfaces the new role on a role change', async () => {
    await staff.update(ctx, 'staff-1', { role: 'viewer' });
    expect(auditUserAction).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        action: 'staff.updated',
        metadata: expect.objectContaining({ role: 'viewer' }),
      }),
    );
  });

  it('records staff.deactivated', async () => {
    await staff.deactivate(ctx, 'staff-1');
    expect(auditUserAction).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ action: 'staff.deactivated', targetId: 'staff-1' }),
    );
  });
});
