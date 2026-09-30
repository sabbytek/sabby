import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { getTestApp, closeTestApp } from '../helpers/app.js';
import { signPlatformToken } from '../../src/modules/platform/auth/jwt.js';
import type { PlatformRole } from '../../src/config/platform-permissions.js';
import type { FastifyInstance } from 'fastify';

// The guards run for real; only the database beneath them is faked. `actor` is
// the row requirePlatformAuth re-reads for the token under test — set it to the
// role we are exercising before each request.
const state: { actor: Record<string, unknown> } = {
  actor: { id: 'pu-1', email: 'a@bpos.ng', role: 'super_admin', isActive: true },
};

vi.mock('../../src/shared/db/client.js', () => {
  const chain = (rows: unknown[]): Record<string, unknown> => {
    const c: Record<string, unknown> = {};
    for (const m of ['from', 'where', 'orderBy', 'limit', 'offset', 'set', 'values', 'returning']) {
      c[m] = () => chain(rows);
    }
    c['then'] = (res: (v: unknown) => unknown) => Promise.resolve(rows).then(res);
    return c;
  };
  const db = {
    select: () => chain([state.actor]),
    update: () => chain([]),
    insert: () => chain([]),
    delete: () => chain([]),
  };
  return { db, getDb: () => db };
});

let app: FastifyInstance;

function tokenFor(role: PlatformRole): string {
  return signPlatformToken(
    app,
    { sub: 'pu-1', role, email: 'a@bpos.ng', aud: 'platform', type: 'access' },
    '15m',
  );
}

function auth(role: PlatformRole) {
  return { authorization: `Bearer ${tokenFor(role)}` };
}

beforeAll(async () => {
  app = await getTestApp();
});

afterAll(async () => {
  await closeTestApp();
});

describe('platform users — permission boundary', () => {
  // Fastify validates the body before the guard preHandler runs, so each route
  // gets a body that passes validation — otherwise a 400 would mask the 403 we
  // are actually testing.
  const manageRoutes: {
    method: 'POST' | 'PATCH' | 'DELETE';
    url: string;
    payload: Record<string, unknown>;
  }[] = [
    {
      method: 'POST',
      url: '/v1/platform/users',
      payload: {
        email: 'new@bpos.ng',
        firstName: 'New',
        lastName: 'Staff',
        role: 'support',
        temporaryPassword: 'temp-password-123',
        reason: 'permission boundary check',
      },
    },
    {
      method: 'PATCH',
      url: '/v1/platform/users/pu-2',
      payload: { role: 'support', reason: 'permission boundary check' },
    },
    {
      method: 'DELETE',
      url: '/v1/platform/users/pu-2',
      payload: { reason: 'permission boundary check' },
    },
    {
      method: 'POST',
      url: '/v1/platform/users/pu-2/reset-password',
      payload: { reason: 'permission boundary check' },
    },
  ];

  it('lets admin (platform_users:read) list users', async () => {
    state.actor = { id: 'pu-1', email: 'a@bpos.ng', role: 'admin', isActive: true };
    const res = await app.inject({
      method: 'GET',
      url: '/v1/platform/users',
      headers: auth('admin'),
    });
    expect(res.statusCode).toBe(200);
  });

  it('forbids read_only, support and admin from the manage routes', async () => {
    for (const role of ['read_only', 'support', 'admin'] as const) {
      state.actor = { id: 'pu-1', email: 'a@bpos.ng', role, isActive: true };
      for (const route of manageRoutes) {
        const res = await app.inject({
          method: route.method,
          url: route.url,
          headers: auth(role),
          payload: route.payload,
        });
        expect(res.statusCode, `${role} ${route.method} ${route.url}`).toBe(403);
      }
    }
  });

  it('lets super_admin past the manage guard', async () => {
    state.actor = { id: 'pu-1', email: 'a@bpos.ng', role: 'super_admin', isActive: true };
    for (const route of manageRoutes) {
      const res = await app.inject({
        method: route.method,
        url: route.url,
        headers: auth('super_admin'),
        payload: route.payload,
      });
      // The guard let it through — it is no longer a 403 (nor a 401).
      expect(res.statusCode, `${route.method} ${route.url}`).not.toBe(403);
      expect(res.statusCode).not.toBe(401);
    }
  });

  it('rejects a tenant token on the platform users plane', async () => {
    const tenantToken = app.jwt.sign({
      sub: 'user-1',
      tid: 'tenant-test',
      role: 'owner',
      email: 'owner@merchant.ng',
      type: 'access',
    });
    const res = await app.inject({
      method: 'GET',
      url: '/v1/platform/users',
      headers: { authorization: `Bearer ${tenantToken}` },
    });
    expect(res.statusCode).toBe(401);
  });
});
