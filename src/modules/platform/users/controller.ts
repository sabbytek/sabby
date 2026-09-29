/**
 * Platform users controller.
 *
 * Every mutation writes exactly one platform audit row before returning, with a
 * mandatory reason. Creating and promoting platform staff is the most powerful
 * action in the system, so it is also the most thoroughly recorded.
 */

import * as service from './service.js';
import { writeAudit } from '../audit/service.js';
import type { PlatformContext } from '../types.js';
import type { PlatformRole } from '../../../config/platform-permissions.js';

export async function list(query: {
  search?: string;
  role?: PlatformRole;
  isActive?: boolean;
  page: number;
  limit: number;
}) {
  return service.listPlatformUsers(query);
}

export async function get(id: string) {
  return service.getPlatformUser(id);
}

export async function create(
  ctx: PlatformContext,
  input: service.CreatePlatformUserInput,
  reason: string,
) {
  const user = await service.createPlatformUser(input);

  await writeAudit(ctx, {
    action: 'platform_user.create',
    targetType: 'platform_user',
    targetId: user.id,
    reason,
    metadata: { email: user.email, role: user.role },
  });

  return user;
}

export async function update(
  ctx: PlatformContext,
  id: string,
  input: service.UpdatePlatformUserInput,
  reason: string,
) {
  const { user, previous } = await service.updatePlatformUser(id, ctx.platformUserId, input);

  await writeAudit(ctx, {
    action: 'platform_user.update',
    targetType: 'platform_user',
    targetId: id,
    reason,
    metadata: {
      fields: Object.keys(input),
      // Role and active-state transitions are the security-relevant diff.
      ...(input.role !== undefined && {
        before: { role: previous.role },
        after: { role: input.role },
      }),
      ...(input.isActive !== undefined && {
        before: { isActive: previous.isActive },
        after: { isActive: input.isActive },
      }),
    },
  });

  return user;
}

export async function deactivate(ctx: PlatformContext, id: string, reason: string) {
  const result = await service.deactivatePlatformUser(id, ctx.platformUserId);

  await writeAudit(ctx, {
    action: 'platform_user.deactivate',
    targetType: 'platform_user',
    targetId: id,
    reason,
    metadata: { before: { isActive: true }, after: { isActive: false } },
  });

  return result;
}

export async function resetPassword(ctx: PlatformContext, id: string, reason: string) {
  const result = await service.resetPlatformUserPassword(id);

  // The generated password is never recorded in the audit log — only the fact
  // that a reset happened.
  await writeAudit(ctx, {
    action: 'platform_user.reset_password',
    targetType: 'platform_user',
    targetId: id,
    reason,
  });

  return result;
}
