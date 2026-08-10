import type { RequestContext } from '../../shared/types/controller.js';
import type { UserRole } from '../../shared/types/index.js';
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
  return inviteStaff(ctx.schema, input);
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
  return updateStaffMember(ctx.schema, id, input);
}

export async function deactivate(ctx: RequestContext, id: string) {
  return deactivateStaffMember(ctx.schema, id, ctx.userId);
}
