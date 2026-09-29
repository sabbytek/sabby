import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { getTestApp, closeTestApp } from '../helpers/app.js';
import { signPlatformToken } from '../../src/modules/platform/auth/jwt.js';
import type { FastifyInstance } from 'fastify';

// ─── DB mock ──────────────────────────────────────────────────────────────────
//
// Two different queries run per request: the guard's platform-user lookup and
// the overview's grouped aggregate. The chain switches to aggregate rows once
// .groupBy() is called, which only the aggregate does.

const platformUserRow = {
  id: 'pu-admin-1',
  email: 'admin@bpos.ng',
  role: 'admin' as const,
  isActive: true,
};

const state = {
  platformUser: { ...platformUserRow } as Record<string, unknown> | undefined,
  aggregate: [
    { subscriptionStatus: 'active', planTier: 'growth', isActive: true, count: 5, newCount: 1 },
    { subscriptionStatus: 'trial', planTier: 'trial', isActive: true, count: 2, newCount: 2 },
    { subscriptionStatus: 'lapsed', planTier: 'entry', isActive: false, count: 3, newCount: 0 },
  ] as unknown[],
};

vi.mock('../../src/shared/db/client.js', () => {
  const makeChain = (rows: () => unknown[]): Record<string, unknown> => {
    const chain: Record<string, unknown> = {};
    for (const method of ['from', 'where', 'orderBy', 'limit', 'offset', 'set', 'values']) {
      chain[method] = () => makeChain(rows);
    }
    chain['groupBy'] = () => makeChain(() => state.aggregate);
    chain['then'] = (res: (v: unknown) => unknown) => Promise.resolve(rows()).then(res);
    return chain;
  };

  const userRows = () => (state.platformUser ? [state.platformUser] : []);
  const db = {
    select: () => makeChain(userRows),
    insert: () => makeChain(() => []),
    update: () => makeChain(() => []),
  };
  return { db, getDb: () => db, isNeonUrl: () => false };
});

let app: FastifyInstance;
let adminToken: string;

const tokenFor = (role: string): string =>
  signPlatformToken(
    app,
    { sub: platformUserRow.id, role, email: platformUserRow.email, aud: 'platform', type: 'access' } as never,
    '15m',
  );

beforeAll(async () => {
  app = await getTestApp();
  adminToken = tokenFor('admin');
});

afterAll(async () => {
  await closeTestApp();
});

describe('GET /v1/platform/overview', () => {
  it('requires authentication', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/platform/overview' });
    expect(res.statusCode).toBe(401);
  });

  it('rejects a tenant-plane token', async () => {
    const tenantToken = app.jwt.sign({
      sub: 'user-1',
      tid: 'tenant-test',
      role: 'owner',
      email: 'owner@merchant.ng',
      type: 'access',
    });

    const res = await app.inject({
      method: 'GET',
      url: '/v1/platform/overview',
      headers: { authorization: `Bearer ${tenantToken}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns the KPI payload the dashboard expects', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/platform/overview',
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ success: boolean; data: Record<string, unknown> }>();
    expect(body.success).toBe(true);
    expect(body.data).toEqual({
      totalTenants: 10,
      activeTenants: 7,
      newLast30Days: 3,
      byStatus: { trial: 2, active: 5, grace: 0, lapsed: 3, cancelled: 0 },
      byPlan: { trial: 2, entry: 3, growth: 5, enterprise: 0 },
    });
  });

  it('is readable by a read_only role', async () => {
    // The landing page is the first thing every operator sees — gating it
    // above read_only would make the dashboard unusable for auditors.
    state.platformUser = { ...platformUserRow, role: 'read_only' };

    const res = await app.inject({
      method: 'GET',
      url: '/v1/platform/overview',
      headers: { authorization: `Bearer ${tokenFor('read_only')}` },
    });

    state.platformUser = { ...platformUserRow };
    expect(res.statusCode).toBe(200);
  });

  it('rejects a deactivated account holding a valid token', async () => {
    state.platformUser = { ...platformUserRow, isActive: false };

    const res = await app.inject({
      method: 'GET',
      url: '/v1/platform/overview',
      headers: { authorization: `Bearer ${adminToken}` },
    });

    state.platformUser = { ...platformUserRow };
    expect(res.statusCode).toBe(401);
  });
});
