import type { RequestContext } from '../../shared/types/controller.js';
import type { UserRole } from '../../shared/types/index.js';
import { auditUserAction } from '../../shared/audit/tenant-audit.js';
import {
  listStaff,
  getStaffMember,
  inviteStaff,
  updateStaffMember,
  deactivateStaffMember,
} from './service.js';

export async function list(ctx: RequestContext) {
  return listStaff(ctx.schema);
}

export async function get(ctx: RequestContext, id: string) {
  return getStaffMember(ctx.schema, id);
}

export async function invite(
  ctx: RequestContext,
  input: {
    email: string;
    firstName: string;
    lastName: string;
    role: UserRole;
    phone?: string;
    locationId?: string;
    temporaryPassword: string;
  },
) {
  const member = await inviteStaff(ctx.schema, input);
  await auditUserAction(ctx, {
    action: 'staff.invited',
    targetType: 'staff',
    targetId: member.id,
    metadata: { email: input.email, role: input.role },
  });
  return member;
}

export async function update(
  ctx: RequestContext,
  id: string,
  input: Partial<{
    firstName: string;
    lastName: string;
    phone: string | null;
    role: UserRole;
    locationId: string | null;
    isActive: boolean;
  }>,
) {
  const member = await updateStaffMember(ctx.schema, id, input);
  await auditUserAction(ctx, {
    action: 'staff.updated',
    targetType: 'staff',
    targetId: id,
    // Role changes are the security-sensitive case; surface the new value.
    metadata: { fields: Object.keys(input), ...(input.role !== undefined && { role: input.role }) },
  });
  return member;
}

export async function deactivate(ctx: RequestContext, id: string) {
  const result = await deactivateStaffMember(ctx.schema, id, ctx.userId);
  await auditUserAction(ctx, { action: 'staff.deactivated', targetType: 'staff', targetId: id });
  return result;
}
