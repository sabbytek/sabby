/**
 * Platform-wide tenant KPIs for the admin dashboard landing page.
 *
 * Like the rest of this plane, it reads only public.tenants — never a
 * tenant's own schema. The whole payload therefore comes from one grouped
 * query rather than a fan-out across tenant databases, which is what keeps
 * the landing page cheap enough to load on every navigation.
 */

import { sql } from 'drizzle-orm';
import { db } from '../../../shared/db/client.js';
import { tenants, planTierEnum, subscriptionStatusEnum } from '../../../shared/db/schema/public.js';
import type { PlanTier } from '../../../config/features.js';

export type SubscriptionStatus = (typeof subscriptionStatusEnum.enumValues)[number];

export interface OverviewKpis {
  totalTenants: number;
  activeTenants: number;
  newLast30Days: number;
  byStatus: Record<SubscriptionStatus, number>;
  byPlan: Record<PlanTier, number>;
}

/** A window the dashboard labels "New (30 days)". */
const NEW_TENANT_WINDOW_DAYS = 30;

/**
 * Every bucket is pre-seeded with zero: the dashboard indexes byStatus and
 * byPlan directly, so a status nobody is currently in must read 0, not
 * undefined.
 */
function zeroedBuckets() {
  const byStatus = Object.fromEntries(
    subscriptionStatusEnum.enumValues.map((status) => [status, 0]),
  ) as Record<SubscriptionStatus, number>;

  const byPlan = Object.fromEntries(planTierEnum.enumValues.map((plan) => [plan, 0])) as Record<
    PlanTier,
    number
  >;

  return { byStatus, byPlan };
}

export async function getOverviewKpis(): Promise<OverviewKpis> {
  // One pass over the table, grouped on the three dimensions the dashboard
  // slices by. At most 40 rows come back (5 statuses × 4 plans × 2 active
  // states), so the cross-tabulation is cheaper to finish in JS than to run
  // as four separate aggregate queries.
  const rows = await db
    .select({
      subscriptionStatus: tenants.subscriptionStatus,
      planTier: tenants.planTier,
      isActive: tenants.isActive,
      count: sql<number>`count(*)::int`,
      newCount: sql<number>`(count(*) filter (
        where ${tenants.createdAt} >= now() - ${`${NEW_TENANT_WINDOW_DAYS} days`}::interval
      ))::int`,
    })
    .from(tenants)
    .groupBy(tenants.subscriptionStatus, tenants.planTier, tenants.isActive);

  const { byStatus, byPlan } = zeroedBuckets();
  let totalTenants = 0;
  let activeTenants = 0;
  let newLast30Days = 0;

  for (const row of rows) {
    const count = Number(row.count ?? 0);
    totalTenants += count;
    if (row.isActive) activeTenants += count;
    newLast30Days += Number(row.newCount ?? 0);

    // Guard against a row whose enum value predates this build — counting it
    // in the total but skipping the bucket beats writing an undefined key the
    // dashboard would render as NaN.
    if (row.subscriptionStatus in byStatus) byStatus[row.subscriptionStatus] += count;
    if (row.planTier in byPlan) byPlan[row.planTier] += count;
  }

  return { totalTenants, activeTenants, newLast30Days, byStatus, byPlan };
}
