/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
/**
 * Auth controller — orchestrates HTTP concerns for authentication.
 * Auth is special: it resolves tenant from body (tenantSlug), not from JWT.
 */

import type { FastifyInstance } from 'fastify';
import { db } from '../../shared/db/client.js';
import { tenants } from '../../shared/db/schema/public.js';
import { eq } from 'drizzle-orm';
import { NotFoundError } from '../../shared/errors/types.js';
import {
  loginUser,
  refreshAccessToken,
  revokeRefreshToken,
  requestPasswordReset,
  resetPassword,
} from './service.js';

async function resolveTenantFromSlug(tenantSlug: string): Promise<{ id: string; schemaName: string }> {
  const [tenant] = await db
    .select({ id: tenants.id, schemaName: tenants.schemaName })
    .from(tenants)
    .where(eq(tenants.slug, tenantSlug))
    .limit(1);
  if (!tenant) throw new NotFoundError('Tenant');
  return tenant;
}

export interface LoginInput {
  tenantSlug: string;
  email: string;
  password: string;
}

export async function login(app: FastifyInstance, input: LoginInput): Promise<unknown> {
  const tenant = await resolveTenantFromSlug(input.tenantSlug);
  const result = await loginUser(app, tenant.id, tenant.schemaName, input.email, input.password);
  return result;
}

export interface RefreshInput {
  tenantSlug: string;
  refreshToken: string;
}

export async function refresh(app: FastifyInstance, input: RefreshInput): Promise<unknown> {
  const tenant = await resolveTenantFromSlug(input.tenantSlug);
  const accessToken = await refreshAccessToken(app, tenant.id, tenant.schemaName, input.refreshToken);
  return { accessToken };
}

export async function logout(tenantId: string, refreshToken: string): Promise<unknown> {
  await revokeRefreshToken(tenantId, refreshToken);
  return { message: 'Logged out successfully' };
}

export function me(user: { userId: string; tenantId: string; email: string; role: string }): unknown {
  return {
    userId: user.userId,
    tenantId: user.tenantId,
    email: user.email,
    role: user.role,
  };
}

export interface ForgotPasswordInput {
  tenantSlug: string;
  email: string;
}

export async function forgotPassword(input: ForgotPasswordInput, logger: { info: (obj: unknown, msg: string) => void }): Promise<unknown> {
  const [tenant] = await db
    .select({ id: tenants.id, schemaName: tenants.schemaName })
    .from(tenants)
    .where(eq(tenants.slug, input.tenantSlug))
    .limit(1);

  if (!tenant) {
    return { message: 'If the email exists, a reset link has been sent' };
  }

  const result = await requestPasswordReset(tenant.id, tenant.schemaName, input.email);

  if (result) {
    logger.info(
      { token: result.rawToken, email: result.userEmail },
      'Password reset token generated (dev only — would be sent via email in production)',
    );
  }

  return { message: 'If the email exists, a reset link has been sent' };
}

export interface ResetPasswordInput {
  tenantSlug: string;
  token: string;
  newPassword: string;
}

export async function reset(input: ResetPasswordInput): Promise<unknown> {
  const tenant = await resolveTenantFromSlug(input.tenantSlug);
  await resetPassword(tenant.id, tenant.schemaName, input.token, input.newPassword);
  return { message: 'Password reset successful. Please login with your new password.' };
}
