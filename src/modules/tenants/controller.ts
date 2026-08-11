import type { RequestContext } from '../../shared/types/controller.js';
import { createTenant, type CreateTenantInput } from './service.js';

export async function create(_ctx: RequestContext, input: CreateTenantInput): Promise<unknown> {
  const result = await createTenant(input);
  return result;
}
