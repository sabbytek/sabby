import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── DB mock ──────────────────────────────────────────────────────────────────
//
// getOverviewKpis issues one grouped query; the rows below stand in for what
// PostgreSQL returns from it, so the cross-tabulation is what is under test.

interface GroupRow {
  subscriptionStatus: string;
  planTier: string;
  isActive: boolean;
  count: number;
  newCount: number;
}

const state = { rows: [] as GroupRow[] };

vi.mock('../../src/shared/db/client.js', () => {
  const makeChain = (): Record<string, unknown> => {
    const chain: Record<string, unknown> = {};
    for (const method of ['from', 'where', 'groupBy', 'orderBy', 'limit', 'offset']) {
      chain[method] = () => makeChain();
    }
    chain['then'] = (res: (v: unknown) => unknown) => Promise.resolve(state.rows).then(res);
    return chain;
  };

  const db = { select: () => makeChain() };
  return { db, getDb: () => db, isNeonUrl: () => false };
});

const row = (over: Partial<GroupRow> = {}): GroupRow => ({
  subscriptionStatus: 'active',
  planTier: 'growth',
  isActive: true,
  count: 1,
  newCount: 0,
  ...over,
});

beforeEach(() => {
  state.rows = [];
});

describe('platform overview KPIs', () => {
  it('reports zeroes for every bucket when there are no tenants', async () => {
    const { getOverviewKpis } = await import('../../src/modules/platform/overview/service.js');
    const kpis = await getOverviewKpis();

    expect(kpis.totalTenants).toBe(0);
    expect(kpis.activeTenants).toBe(0);
    expect(kpis.newLast30Days).toBe(0);
    // The dashboard indexes these directly — a missing key renders as NaN.
    expect(kpis.byStatus).toEqual({ trial: 0, active: 0, grace: 0, lapsed: 0, cancelled: 0 });
    expect(kpis.byPlan).toEqual({ trial: 0, entry: 0, growth: 0, enterprise: 0 });
  });

  it('sums counts across the grouped rows', async () => {
    state.rows = [
      row({ subscriptionStatus: 'active', planTier: 'growth', count: 5 }),
      row({ subscriptionStatus: 'active', planTier: 'entry', count: 3 }),
      row({ subscriptionStatus: 'trial', planTier: 'trial', count: 7 }),
    ];

    const { getOverviewKpis } = await import('../../src/modules/platform/overview/service.js');
    const kpis = await getOverviewKpis();

    expect(kpis.totalTenants).toBe(15);
    expect(kpis.byStatus.active).toBe(8);
    expect(kpis.byStatus.trial).toBe(7);
    expect(kpis.byPlan.growth).toBe(5);
    expect(kpis.byPlan.entry).toBe(3);
    expect(kpis.byPlan.trial).toBe(7);
  });

  it('counts only is_active rows as active, but all rows in the total', async () => {
    state.rows = [
      row({ isActive: true, count: 4 }),
      row({ isActive: false, subscriptionStatus: 'lapsed', count: 6 }),
    ];

    const { getOverviewKpis } = await import('../../src/modules/platform/overview/service.js');
    const kpis = await getOverviewKpis();

    expect(kpis.totalTenants).toBe(10);
    expect(kpis.activeTenants).toBe(4);
    // A suspended tenant still belongs to its status and plan buckets.
    expect(kpis.byStatus.lapsed).toBe(6);
  });

  it('sums the 30-day signups independently of the bucket counts', async () => {
    state.rows = [
      row({ count: 10, newCount: 2 }),
      row({ subscriptionStatus: 'trial', planTier: 'trial', count: 4, newCount: 4 }),
    ];

    const { getOverviewKpis } = await import('../../src/modules/platform/overview/service.js');
    const kpis = await getOverviewKpis();

    expect(kpis.totalTenants).toBe(14);
    expect(kpis.newLast30Days).toBe(6);
  });

  it('keeps an unrecognised enum value out of the buckets but in the total', async () => {
    // Guards the window during a deploy where the database has a new enum
    // value the running build does not know about.
    state.rows = [
      row({ count: 3 }),
      row({ subscriptionStatus: 'paused_future_value', planTier: 'platinum', count: 2 }),
    ];

    const { getOverviewKpis } = await import('../../src/modules/platform/overview/service.js');
    const kpis = await getOverviewKpis();

    expect(kpis.totalTenants).toBe(5);
    expect(Object.keys(kpis.byStatus)).toHaveLength(5);
    expect(Object.keys(kpis.byPlan)).toHaveLength(4);
    expect(Object.values(kpis.byStatus).reduce((a, b) => a + b, 0)).toBe(3);
  });

  it('tolerates counts arriving as strings from the driver', async () => {
    state.rows = [row({ count: '8' as unknown as number, newCount: '2' as unknown as number })];

    const { getOverviewKpis } = await import('../../src/modules/platform/overview/service.js');
    const kpis = await getOverviewKpis();

    expect(kpis.totalTenants).toBe(8);
    expect(kpis.newLast30Days).toBe(2);
    expect(kpis.byStatus.active).toBe(8);
  });
});
