import type { RequestContext } from '../../shared/types/controller.js';
import { getOnboardingStatus } from './service.js';

export async function getStatus(ctx: RequestContext) {
  return getOnboardingStatus(ctx.tenantId, ctx.schema);
}
