import type { RequestContext } from '../../shared/types/controller.js';
import type { UserRole } from '../../shared/types/index.js';
import {
  listStaff,
  getStaffMember,
  inviteStaff,
  updateStaffMember,
  deactivateStaffMember,
} from './service.js';

export async function list(ctx: RequestContext): Promise<unknown> {
  const result = await listStaff(ctx.schema);
  return result;
}

export async function get(ctx: RequestContext, id: string): Promise<unknown> {
  const result = await getStaffMember(ctx.schema, id);
  return result;
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
): Promise<unknown> {
  const result = await inviteStaff(ctx.schema, input);
  return result;
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
): Promise<unknown> {
  const result = await updateStaffMember(ctx.schema, id, input);
  return result;
}

export async function deactivate(ctx: RequestContext, id: string): Promise<unknown> {
  const result = await deactivateStaffMember(ctx.schema, id, ctx.userId);
  return result;
}
