import { describe, it, expect, vi } from 'vitest';
import type { FastifyRequest, FastifyReply } from 'fastify';
import {
  requirePlatformAuth,
  requirePlatformPermission,
} from '../../src/shared/middleware/platform-auth.js';
import { UnauthorizedError, ForbiddenError } from '../../src/shared/errors/types.js';
import type { PlatformJwtPayload, PlatformRole } from '../../src/shared/types/index.js';

function fakeRequest(payload: PlatformJwtPayload | Error): FastifyRequest {
  return {
    platformJwtVerify: vi
      .fn()
      .mockImplementation(() =>
        payload instanceof Error ? Promise.reject(payload) : Promise.resolve(payload),
      ),
  } as unknown as FastifyRequest;
}

const reply = {} as FastifyReply;

function accessPayload(role: PlatformRole): PlatformJwtPayload {
  return { sub: 'pu-1', role, email: 'ops@sabby.example', type: 'access' };
}

describe('requirePlatformAuth', () => {
  it('attaches normalized platform context on a valid access token', async () => {
    const request = fakeRequest(accessPayload('admin'));
    await requirePlatformAuth(request, reply);
    expect(request.platformAuth).toEqual({
      userId: 'pu-1',
      email: 'ops@sabby.example',
      role: 'admin',
    });
  });

  it('rejects an invalid/expired token', async () => {
    const request = fakeRequest(new Error('bad token'));
    await expect(requirePlatformAuth(request, reply)).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

describe('requirePlatformPermission', () => {
  it('allows a role that holds the permission', async () => {
    const request = fakeRequest(accessPayload('admin'));
    await expect(
      requirePlatformPermission('tenant:suspend')(request, reply),
    ).resolves.toBeUndefined();
  });

  it('forbids a role that lacks the permission', async () => {
    const request = fakeRequest(accessPayload('support'));
    await expect(
      requirePlatformPermission('tenant:suspend')(request, reply),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('requires all listed permissions (AND semantics)', async () => {
    const request = fakeRequest(accessPayload('admin'));
    await expect(
      requirePlatformPermission('tenant:read', 'platform_user:manage')(request, reply),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
