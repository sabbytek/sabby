import type { RequestContext } from '../../shared/types/controller.js';
import { getOnboardingStatus } from './service.js';

export async function getStatus(ctx: RequestContext): Promise<unknown> {
  const result = await getOnboardingStatus(ctx.tenantId, ctx.schema);
  return result;
}
