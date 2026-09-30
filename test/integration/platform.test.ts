import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { getTestApp, closeTestApp } from '../helpers/app.js';
import { signPlatformToken } from '../../src/modules/platform/auth/jwt.js';
import type { FastifyInstance } from 'fastify';

// ─── DB mock ──────────────────────────────────────────────────────────────────
//
// The platform guards are deliberately NOT mocked — cross-plane isolation is
// the thing under test, so requirePlatformAuth must run for real. Only the
// database beneath it is faked.

const platformUserRow = {
  id: 'pu-admin-1',
  email: 'admin@bpos.ng',
  role: 'admin' as const,
  isActive: true,
};

const state = {
  platformUser: { ...platformUserRow } as Record<string, unknown> | undefined,
};

vi.mock('../../src/shared/db/client.js', () => {
  // Minimal chainable stub matching the Drizzle calls the platform code makes.
  // Every builder method returns the chain, and the chain is thenable — so it
  // resolves to rows at whatever point the caller stops chaining
  // (.limit(), .limit().offset(), or awaiting the builder directly).
  const makeChain = (rows: unknown[]): Record<string, unknown> => {
    const chain: Record<string, unknown> = {};
    for (const method of [
      'from',
      'where',
      'orderBy',
      'limit',
      'offset',
      'set',
      'values',
      'returning',
      'onConflictDoUpdate',
    ]) {
      chain[method] = () => makeChain(rows);
    }
    chain['then'] = (res: (v: unknown) => unknown) => Promise.resolve(rows).then(res);
    return chain;
  };

  const db = {
    select: () => makeChain(state.platformUser ? [state.platformUser] : []),
    insert: () => makeChain([]),
    update: () => makeChain([]),
    delete: () => makeChain([]),
  };

  return { db, getDb: () => db };
});

// ─── Setup ────────────────────────────────────────────────────────────────────

let app: FastifyInstance;
let tenantToken: string;
let platformToken: string;

beforeAll(async () => {
  app = await getTestApp();

  // A perfectly valid TENANT token — signed with JWT_ACCESS_SECRET.
  tenantToken = app.jwt.sign({
    sub: 'user-1',
    tid: 'tenant-test',
    role: 'owner',
    email: 'owner@merchant.ng',
    type: 'access',
  });

  // A valid PLATFORM token — signed with JWT_PLATFORM_SECRET.
  platformToken = signPlatformToken(
    app,
    {
      sub: platformUserRow.id,
      role: 'admin',
      email: platformUserRow.email,
      aud: 'platform',
      type: 'access',
    },
    '15m',
  );
});

afterAll(async () => {
  await closeTestApp();
});

// ─── Cross-plane isolation ────────────────────────────────────────────────────
//
// These are the tests that matter most: they prove the two identity planes
// cannot be used against each other.

describe('cross-plane isolation', () => {
  it('rejects a tenant token on the platform plane', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/platform/tenants',
      headers: { authorization: `Bearer ${tenantToken}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects a platform token on the tenant plane', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/orders',
      headers: { authorization: `Bearer ${platformToken}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects an unauthenticated request to the platform plane', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/platform/tenants' });
    expect(res.statusCode).toBe(401);
  });

  it('rejects a platform-shaped token signed with the TENANT secret', async () => {
    // The forgery this design is meant to stop: right claims, wrong key.
    const forged = app.jwt.sign({
      sub: platformUserRow.id,
      role: 'super_admin',
      email: 'attacker@evil.example',
      aud: 'platform',
      type: 'access',
    } as never);

    const res = await app.inject({
      method: 'GET',
      url: '/v1/platform/tenants',
      headers: { authorization: `Bearer ${forged}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects a platform token missing the platform audience', async () => {
    const wrongAudience = signPlatformToken(
      app,
      {
        sub: platformUserRow.id,
        role: 'admin',
        email: platformUserRow.email,
        type: 'access',
      } as never,
      '15m',
    );

    const res = await app.inject({
      method: 'GET',
      url: '/v1/platform/tenants',
      headers: { authorization: `Bearer ${wrongAudience}` },
    });
    expect(res.statusCode).toBe(401);
  });
});

// ─── Account state is re-checked per request ──────────────────────────────────

describe('platform account state', () => {
  it('rejects a valid token whose account has been deactivated', async () => {
    state.platformUser = { ...platformUserRow, isActive: false };

    const res = await app.inject({
      method: 'GET',
      url: '/v1/platform/tenants',
      headers: { authorization: `Bearer ${platformToken}` },
    });

    state.platformUser = { ...platformUserRow };
    expect(res.statusCode).toBe(401);
  });

  it('rejects a valid token whose account no longer exists', async () => {
    state.platformUser = undefined;

    const res = await app.inject({
      method: 'GET',
      url: '/v1/platform/tenants',
      headers: { authorization: `Bearer ${platformToken}` },
    });

    state.platformUser = { ...platformUserRow };
    expect(res.statusCode).toBe(401);
  });
});

// ─── Permission enforcement ───────────────────────────────────────────────────

describe('platform permission enforcement', () => {
  it('allows an admin to read tenants', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/platform/tenants',
      headers: { authorization: `Bearer ${platformToken}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it('denies a read_only role a tenant suspension (403, not 401)', async () => {
    state.platformUser = { ...platformUserRow, role: 'read_only' };
    const readOnlyToken = signPlatformToken(
      app,
      {
        sub: platformUserRow.id,
        role: 'read_only',
        email: platformUserRow.email,
        aud: 'platform',
        type: 'access',
      },
      '15m',
    );

    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/platform/tenants/tenant-abc/suspend',
      headers: { authorization: `Bearer ${readOnlyToken}` },
      payload: { reason: 'Investigating a chargeback pattern' },
    });

    state.platformUser = { ...platformUserRow };
    expect(res.statusCode).toBe(403);
  });

  it('denies a support role a tenant plan change', async () => {
    state.platformUser = { ...platformUserRow, role: 'support' };
    const supportToken = signPlatformToken(
      app,
      {
        sub: platformUserRow.id,
        role: 'support',
        email: platformUserRow.email,
        aud: 'platform',
        type: 'access',
      },
      '15m',
    );

    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/platform/tenants/tenant-abc/plan',
      headers: { authorization: `Bearer ${supportToken}` },
      payload: { planTier: 'growth', reason: 'Merchant asked to upgrade on a call' },
    });

    state.platformUser = { ...platformUserRow };
    expect(res.statusCode).toBe(403);
  });
});

// ─── Audit reason is mandatory ────────────────────────────────────────────────

describe('mandatory audit reason', () => {
  it('rejects a suspension with no reason', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/platform/tenants/tenant-abc/suspend',
      headers: { authorization: `Bearer ${platformToken}` },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a throwaway one-word reason', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/platform/tenants/tenant-abc/suspend',
      headers: { authorization: `Bearer ${platformToken}` },
      payload: { reason: 'spam' },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ─── Authorisation precedes validation ────────────────────────────────────────
//
// The guards run as onRequest, which is before Fastify validates the body.
// If they slip back to preHandler these tests fail: an unauthorised caller
// would get a 400 describing the schema instead of the 401/403 it is owed.

describe('authorisation runs before body validation', () => {
  it('answers 401, not 400, for an unauthenticated request with a bad body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/platform/tenants',
      payload: { nonsense: true },
    });
    expect(res.statusCode).toBe(401);
  });

  it('answers 401, not 400, for a tenant-plane token with a bad body', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/platform/tenants/tenant-abc/plan',
      headers: { authorization: `Bearer ${tenantToken}` },
      payload: { planTier: 'not-a-tier' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('answers 403, not 400, when the role lacks the permission', async () => {
    state.platformUser = { ...platformUserRow, role: 'read_only' };
    const readOnlyToken = signPlatformToken(
      app,
      {
        sub: platformUserRow.id,
        role: 'read_only',
        email: platformUserRow.email,
        aud: 'platform',
        type: 'access',
      },
      '15m',
    );

    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/platform/tenants/tenant-abc/suspend',
      headers: { authorization: `Bearer ${readOnlyToken}` },
      payload: {},
    });

    state.platformUser = { ...platformUserRow };
    expect(res.statusCode).toBe(403);
  });

  it('still validates the body once the caller is authorised', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/platform/tenants/tenant-abc/plan',
      headers: { authorization: `Bearer ${platformToken}` },
      payload: { planTier: 'not-a-tier', reason: 'Merchant asked to upgrade on a call' },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ─── Public tenant signup ─────────────────────────────────────────────────────

describe('POST /v1/tenants (public signup)', () => {
  it('no longer 500s on a valid body', async () => {
    // Regression guard: this route used to call createContext(), which
    // dereferences request.tenant — undefined on an unauthenticated route —
    // so every signup attempt returned 500.
    const res = await app.inject({
      method: 'POST',
      url: '/v1/tenants',
      payload: {
        name: 'Adaeze Beauty',
        slug: 'adaeze-beauty',
        businessEmail: 'adaeze@example.ng',
        ownerFirstName: 'Adaeze',
        ownerLastName: 'Okafor',
        ownerPassword: 'a-strong-password',
      },
    });
    expect(res.statusCode).not.toBe(500);
  });

  it('still validates the request body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/tenants',
      payload: { name: 'X' },
    });
    expect(res.statusCode).toBe(400);
  });
});
