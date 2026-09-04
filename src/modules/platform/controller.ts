/**
 * Platform auth controller — orchestrates HTTP concerns and audit writes for
 * the platform ops plane. Business logic lives in service.ts.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  loginPlatformUser,
  refreshPlatformSession,
  revokePlatformRefreshToken,
  getPlatformUserById,
  beginMfaEnrollment,
  confirmMfaEnrollment,
} from './service.js';
import { recordAudit } from './audit.js';
import type { PlatformAuthUser } from '../../shared/types/index.js';
import type { PlatformLoginBody } from './validators.js';

function auditContext(request: FastifyRequest): { ip: string; requestId: string } {
  return { ip: request.ip, requestId: request.id };
}

export async function login(
  app: FastifyInstance,
  body: PlatformLoginBody,
  request: FastifyRequest,
): Promise<unknown> {
  const result = await loginPlatformUser(app, body);
  await recordAudit({
    actorId: result.user.id,
    actorEmail: result.user.email,
    action: 'auth.login',
    summary: `Platform login (${result.user.role})`,
    ...auditContext(request),
  });
  return result;
}

export async function refresh(app: FastifyInstance, refreshToken: string): Promise<unknown> {
  return refreshPlatformSession(app, refreshToken);
}

export async function logout(
  platformUser: PlatformAuthUser,
  refreshToken: string,
  request: FastifyRequest,
): Promise<unknown> {
  await revokePlatformRefreshToken(refreshToken);
  await recordAudit({
    actorId: platformUser.userId,
    actorEmail: platformUser.email,
    action: 'auth.logout',
    ...auditContext(request),
  });
  return { message: 'Logged out successfully' };
}

export async function me(platformUser: PlatformAuthUser): Promise<unknown> {
  return getPlatformUserById(platformUser.userId);
}

export async function startMfaEnrollment(platformUser: PlatformAuthUser): Promise<unknown> {
  return beginMfaEnrollment(platformUser.userId);
}

export async function verifyMfaEnrollment(
  platformUser: PlatformAuthUser,
  totp: string,
  request: FastifyRequest,
): Promise<unknown> {
  await confirmMfaEnrollment(platformUser.userId, totp);
  await recordAudit({
    actorId: platformUser.userId,
    actorEmail: platformUser.email,
    action: 'auth.mfa_enabled',
    summary: 'MFA enrollment confirmed',
    ...auditContext(request),
  });
  return { message: 'MFA enabled successfully' };
}
