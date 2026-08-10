import type { RequestContext } from '../../shared/types/controller.js';
import { createTenant, type CreateTenantInput } from './service.js';

export async function create(ctx: RequestContext, input: CreateTenantInput) {
  return createTenant(input);
}
