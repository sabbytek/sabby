import type { RequestContext } from '../../shared/types/controller.js';
import { createTenant, type CreateTenantInput, type CreateTenantResult } from './service.js';

export async function create(_ctx: RequestContext, input: CreateTenantInput): Promise<CreateTenantResult> {
  const result = await createTenant(input);
  return result;
}
