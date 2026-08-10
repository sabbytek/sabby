import type { RequestContext } from '../../shared/types/controller.js';
import { registerPhoneIdTenant } from './session.js';

export interface SetupInput {
  phoneNumberId: string;
}

export async function setup(ctx: RequestContext, input: SetupInput) {
  await registerPhoneIdTenant(input.phoneNumberId, ctx.tenantId, ctx.schema);
  return { success: true, message: 'Phone number ID registered' };
}
