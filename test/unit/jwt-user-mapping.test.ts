import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestApp, closeTestApp } from '../helpers/app.js';
import type { FastifyInstance } from 'fastify';

/**
 * Regression guard for a live bug: the access token carries short claim names
 * (`sub`, `tid`) to keep it small, but resolveTenant, /auth/me, logout and the
 * Sentry request context all read `request.user.userId` / `.tenantId`.
 *
 * Nothing populated those aliases, so every authenticated tenant request failed
 * with "Tenant context missing from token". It went unnoticed because the
 * integration suite mocks resolveTenant. app.ts now maps them via the
 * @fastify/jwt `formatUser` hook.
 */

let app: FastifyInstance;

beforeAll(async () => {
  app = await getTestApp();
});

afterAll(async () => {
  await closeTestApp();
});

describe('JWT user mapping', () => {
  it('populates userId and tenantId aliases from sub and tid', async () => {
    const token = app.jwt.sign({
      sub: 'user-42',
      tid: 'tenant-99',
      role: 'owner',
      email: 'owner@merchant.ng',
      type: 'access',
    });

    // /v1/auth/me echoes straight from request.user, so it shows the mapping.
    const res = await app.inject({
      method: 'GET',
      url: '/v1/auth/me',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: { userId: string; tenantId: string; role: string } }>();
    expect(body.data.userId).toBe('user-42');
    expect(body.data.tenantId).toBe('tenant-99');
    expect(body.data.role).toBe('owner');
  });

  it('preserves the original short claims alongside the aliases', async () => {
    const token = app.jwt.sign({
      sub: 'user-1',
      tid: 'tenant-1',
      role: 'staff',
      email: 'staff@merchant.ng',
      type: 'access',
    });

    const decoded = app.jwt.verify<Record<string, unknown>>(token);
    expect(decoded['sub']).toBe('user-1');
    expect(decoded['tid']).toBe('tenant-1');
  });

  it('still rejects an unauthenticated request', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/auth/me' });
    expect(res.statusCode).toBe(401);
  });
});
