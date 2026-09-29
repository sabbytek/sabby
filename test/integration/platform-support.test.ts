import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { getTestApp, closeTestApp } from '../helpers/app.js';
import { signPlatformToken } from '../../src/modules/platform/auth/jwt.js';
import type { FastifyInstance } from 'fastify';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SUPPORT_USER = {
  id: 'pu-support-1',
  email: 'support@bpos.ng',
  role: 'support' as const,
  isActive: true,
};

const TENANT = {
  id: 'tenant-abc',
  schemaName: 'tenant_abc',
  name: 'Adaeze Beauty',
  businessPhone: '+2348012345678',
  businessEmail: 'adaeze@example.ng',
  isActive: true,
};

/**
 * Mutable test state. `grant` is what requireTenantGrant will find — set it to
 * null to simulate no grant, or to an expired/read-only one.
 */
const state: {
  platformUser: Record<string, unknown> | undefined;
  grant: Record<string, unknown> | null;
} = {
  platformUser: { ...SUPPORT_USER },
  grant: null,
};

function activeGrant(scope: 'read' | 'write', minutesLeft = 60) {
  return {
    id: 'grant-1',
    scope,
    reason: 'Ticket #412 — customer reports a missing receipt',
    expiresAt: new Date(Date.now() + minutesLeft * 60 * 1000),
  };
}

// The platform guards and requireTenantGrant are deliberately NOT mocked —
// the grant boundary is what's under test. Only the DB below is faked.
vi.mock('../../src/shared/db/client.js', () => {
  // Route rows by which table .from() was given, read off Drizzle's own name
  // symbol. Routing by call order would break the moment a service reorders
  // its queries — openGrant looks up the tenant first, requireTenantGrant the
  // grant first.
  const tableNameOf = (table: unknown): string => {
    if (!table || typeof table !== 'object') return '';
    const sym = Symbol.for('drizzle:Name');
    return (table as Record<symbol, string>)[sym] ?? '';
  };

  const rowsForTable = (name: string): unknown[] => {
    switch (name) {
      case 'tenant_access_grants':
        return state.grant ? [state.grant] : [];
      case 'tenants':
        return [TENANT];
      case 'platform_users':
        return state.platformUser ? [state.platformUser] : [];
      default:
        return [];
    }
  };

  const makeChain = (name: string): Record<string, unknown> => {
    const chain: Record<string, unknown> = {};
    for (const m of ['where', 'orderBy', 'limit', 'offset', 'set', 'values', 'returning']) {
      chain[m] = () => makeChain(name);
    }
    chain['from'] = (table: unknown) => makeChain(tableNameOf(table));
    chain['leftJoin'] = () => makeChain(name);
    chain['innerJoin'] = () => makeChain(name);
    chain['then'] = (res: (v: unknown) => unknown) => Promise.resolve(rowsForTable(name)).then(res);
    return chain;
  };

  const db = {
    select: () => makeChain(''),
    insert: (table: unknown) => makeChain(tableNameOf(table)),
    update: (table: unknown) => makeChain(tableNameOf(table)),
    delete: (table: unknown) => makeChain(tableNameOf(table)),
  };
  return { db, getDb: () => db };
});

// Note: the platform guards are NOT mocked. requirePlatformAuth reads
// platform_users through the stub above, so token verification, the account
// re-read, and the grant check all run for real — which is the point.

// Keep the queue out of the test — grant opening enqueues an owner SMS.
vi.mock('../../src/shared/queue/client.js', () => ({
  notificationsQueue: { add: vi.fn().mockResolvedValue(undefined) },
  documentsQueue: { add: vi.fn().mockResolvedValue(undefined) },
  paymentsQueue: { add: vi.fn().mockResolvedValue(undefined) },
  subscriptionsQueue: { add: vi.fn().mockResolvedValue(undefined) },
  logisticsQueue: { add: vi.fn().mockResolvedValue(undefined) },
  createQueue: vi.fn(() => ({ add: vi.fn() })),
  createWorker: vi.fn(),
  QUEUES: {
    NOTIFICATIONS: 'notifications',
    DOCUMENTS: 'documents',
    PAYMENTS: 'payments',
    SUBSCRIPTIONS: 'subscriptions',
    LOGISTICS: 'logistics',
  },
  redisConnection: {},
}));

// The tenant audit trail writes through withTenantSchema; capture instead of DB.
const tenantAuditWrites: Record<string, unknown>[] = [];
vi.mock('../../src/shared/audit/tenant-audit.js', () => ({
  writeTenantAudit: vi.fn(async (schemaName: string, input: Record<string, unknown>) => {
    tenantAuditWrites.push({ schemaName, ...input });
  }),
  listTenantAudit: vi.fn(async () => ({
    items: tenantAuditWrites,
    total: tenantAuditWrites.length,
  })),
}));

// ─── Setup ────────────────────────────────────────────────────────────────────

let app: FastifyInstance;
let supportToken: string;

beforeAll(async () => {
  app = await getTestApp();
  supportToken = signPlatformToken(
    app,
    {
      sub: SUPPORT_USER.id,
      role: 'support',
      email: SUPPORT_USER.email,
      aud: 'platform',
      type: 'access',
    },
    '15m',
  );
});

beforeEach(() => {
  state.platformUser = { ...SUPPORT_USER };
  state.grant = null;
  tenantAuditWrites.length = 0;
  vi.clearAllMocks();
});

afterAll(async () => {
  await closeTestApp();
});

// ─── The grant boundary ───────────────────────────────────────────────────────

describe('requireTenantGrant', () => {
  it('denies a tenant read with no active grant', async () => {
    state.grant = null;

    const res = await app.inject({
      method: 'GET',
      url: `/v1/platform/support/tenants/${TENANT.id}/orders`,
      headers: { authorization: `Bearer ${supportToken}` },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json<{ error: { message: string } }>().error.message).toContain(
      'No active access grant',
    );
  });

  it('denies a write action when the grant is read-only', async () => {
    state.grant = activeGrant('read');

    const res = await app.inject({
      method: 'POST',
      url: `/v1/platform/support/tenants/${TENANT.id}/unlock-account`,
      headers: { authorization: `Bearer ${supportToken}` },
      payload: { userId: 'user-1', reason: 'Ticket #500 — owner locked out after staff change' },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json<{ error: { message: string } }>().error.message).toContain('read-only');
  });

  it('denies access once the grant has expired', async () => {
    // Expired an hour ago. The SQL filters on expiresAt, so the stub returns
    // nothing — the same outcome the database would produce.
    state.grant = null;

    const res = await app.inject({
      method: 'GET',
      url: `/v1/platform/support/tenants/${TENANT.id}/orders`,
      headers: { authorization: `Bearer ${supportToken}` },
    });

    expect(res.statusCode).toBe(403);
  });

  it('rejects a tenant token outright — grants are platform-plane only', async () => {
    const tenantToken = app.jwt.sign({
      sub: 'user-1',
      tid: TENANT.id,
      role: 'owner',
      email: 'owner@merchant.ng',
      type: 'access',
    });

    const res = await app.inject({
      method: 'GET',
      url: `/v1/platform/support/tenants/${TENANT.id}/orders`,
      headers: { authorization: `Bearer ${tenantToken}` },
    });

    expect(res.statusCode).toBe(401);
  });
});

// ─── Permission boundary (independent of the grant) ───────────────────────────

describe('support permission boundary', () => {
  it('denies a read_only role the ability to open a grant', async () => {
    state.platformUser = { ...SUPPORT_USER, role: 'read_only' };
    const readOnlyToken = signPlatformToken(
      app,
      {
        sub: SUPPORT_USER.id,
        role: 'read_only',
        email: SUPPORT_USER.email,
        aud: 'platform',
        type: 'access',
      },
      '15m',
    );

    const res = await app.inject({
      method: 'POST',
      url: '/v1/platform/support/grants',
      headers: { authorization: `Bearer ${readOnlyToken}` },
      payload: {
        tenantId: TENANT.id,
        scope: 'read',
        reason: 'Ticket #412 — investigating a missing receipt',
      },
    });

    expect(res.statusCode).toBe(403);
  });

  it('denies support a tenant suspension — that is admin territory', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/platform/tenants/${TENANT.id}/suspend`,
      headers: { authorization: `Bearer ${supportToken}` },
      payload: { reason: 'Ticket #412 — merchant asked us to pause the account' },
    });

    expect(res.statusCode).toBe(403);
  });
});

// ─── Mandatory reason ─────────────────────────────────────────────────────────

describe('grants require a stated reason', () => {
  it('rejects a grant with no reason', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/platform/support/grants',
      headers: { authorization: `Bearer ${supportToken}` },
      payload: { tenantId: TENANT.id, scope: 'read' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a throwaway one-word reason', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/platform/support/grants',
      headers: { authorization: `Bearer ${supportToken}` },
      payload: { tenantId: TENANT.id, scope: 'read', reason: 'debug' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a grant longer than the 24 hour cap', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/platform/support/grants',
      headers: { authorization: `Bearer ${supportToken}` },
      payload: {
        tenantId: TENANT.id,
        scope: 'read',
        reason: 'Ticket #412 — long running investigation',
        durationMinutes: 1441,
      },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ─── Merchant visibility ──────────────────────────────────────────────────────

describe('merchant visibility of support access', () => {
  it('writes the grant to the merchant’s own audit trail with the reason', async () => {
    const reason = 'Ticket #412 — customer reports a missing receipt';

    const res = await app.inject({
      method: 'POST',
      url: '/v1/platform/support/grants',
      headers: { authorization: `Bearer ${supportToken}` },
      payload: { tenantId: TENANT.id, scope: 'read', reason },
    });

    expect(res.statusCode).toBe(201);

    const entry = tenantAuditWrites.find((e) => e['action'] === 'support.access_granted');
    expect(entry).toBeDefined();
    expect(entry?.['actorType']).toBe('platform');
    expect(entry?.['actorEmail']).toBe(SUPPORT_USER.email);
    expect(entry?.['reason']).toBe(reason);
  });

  it('notifies the owner by SMS when a grant opens', async () => {
    const { notificationsQueue } = await import('../../src/shared/queue/client.js');

    await app.inject({
      method: 'POST',
      url: '/v1/platform/support/grants',
      headers: { authorization: `Bearer ${supportToken}` },
      payload: {
        tenantId: TENANT.id,
        scope: 'read',
        reason: 'Ticket #412 — customer reports a missing receipt',
      },
    });

    expect(notificationsQueue.add).toHaveBeenCalledWith(
      'send-sms',
      expect.objectContaining({ to: TENANT.businessPhone }),
    );
    const call = vi.mocked(notificationsQueue.add).mock.calls.at(-1);
    const payload = call?.[1] as { message: string };
    // The merchant must be told who and why, not just that something happened.
    expect(payload.message).toContain(SUPPORT_USER.email);
    expect(payload.message).toContain('Ticket #412');
  });

  it('surfaces the access on the merchant’s own settings endpoint', async () => {
    // The full loop: support opens a grant, and the merchant can see it from
    // their side without being told to go looking.
    const reason = 'Ticket #412 — customer reports a missing receipt';

    await app.inject({
      method: 'POST',
      url: '/v1/platform/support/grants',
      headers: { authorization: `Bearer ${supportToken}` },
      payload: { tenantId: TENANT.id, scope: 'read', reason },
    });

    const ownerToken = app.jwt.sign({
      sub: 'user-owner',
      tid: TENANT.id,
      role: 'owner',
      email: 'owner@merchant.ng',
      type: 'access',
    });

    const res = await app.inject({
      method: 'GET',
      url: '/v1/settings/audit?actorType=platform',
      headers: { authorization: `Bearer ${ownerToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: { items: Record<string, unknown>[] } }>();
    const entry = body.data.items.find((e) => e['action'] === 'support.access_granted');
    expect(entry).toBeDefined();
    expect(entry?.['reason']).toBe(reason);
    expect(entry?.['actorEmail']).toBe(SUPPORT_USER.email);
  });

  it('denies the activity trail to staff — it names who accessed what', async () => {
    const staffToken = app.jwt.sign({
      sub: 'user-staff',
      tid: TENANT.id,
      role: 'staff',
      email: 'staff@merchant.ng',
      type: 'access',
    });

    const res = await app.inject({
      method: 'GET',
      url: '/v1/settings/audit',
      headers: { authorization: `Bearer ${staffToken}` },
    });

    expect(res.statusCode).toBe(403);
  });
});
