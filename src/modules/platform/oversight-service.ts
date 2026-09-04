import { and, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import { db } from '../../shared/db/client.js';
import { tenants } from '../../shared/db/schema/public.js';
import { users, products, orders, payments } from '../../shared/db/schema/tenant.js';
import { withTenantSchema } from '../../shared/db/tenant.js';
import { NotFoundError } from '../../shared/errors/types.js';
import { getOnboardingStatus } from '../onboarding/service.js';
import { maskEmail, maskPhone } from './mask.js';

type SubscriptionStatus = (typeof tenants.subscriptionStatus.enumValues)[number];
type PlanTier = (typeof tenants.planTier.enumValues)[number];

function countInt(value: string | number | null | undefined): number {
  if (typeof value === 'number') return value;
  return parseInt(value ?? '0', 10) || 0;
}

// ─── Overview KPIs ──────────────────────────────────────────────────────────
// All aggregates run against the denormalised public.tenants table — O(1)-ish,
// never a per-tenant schema scan. Platform-wide GMV is deliberately NOT computed
// here: summing across every tenant schema is O(N) and belongs in a rollup.

export interface OverviewKpis {
  totalTenants: number;
  activeTenants: number;
  newLast30Days: number;
  byStatus: Record<SubscriptionStatus, number>;
  byPlan: Record<PlanTier, number>;
}

export async function getOverviewKpis(): Promise<OverviewKpis> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [totals, statusRows, planRows] = await Promise.all([
    db
      .select({
        total: sql<string>`count(*)`,
        active: sql<string>`count(*) filter (where ${tenants.isActive} = true)`,
        recent: sql<string>`count(*) filter (where ${tenants.createdAt} >= ${thirtyDaysAgo})`,
      })
      .from(tenants),
    db
      .select({ status: tenants.subscriptionStatus, count: sql<string>`count(*)` })
      .from(tenants)
      .groupBy(tenants.subscriptionStatus),
    db
      .select({ plan: tenants.planTier, count: sql<string>`count(*)` })
      .from(tenants)
      .groupBy(tenants.planTier),
  ]);

  const byStatus = { trial: 0, active: 0, grace: 0, lapsed: 0, cancelled: 0 } as Record<
    SubscriptionStatus,
    number
  >;
  for (const row of statusRows) byStatus[row.status] = countInt(row.count);

  const byPlan = { trial: 0, entry: 0, growth: 0, enterprise: 0 } as Record<PlanTier, number>;
  for (const row of planRows) byPlan[row.plan] = countInt(row.count);

  const totalsRow = totals[0];
  return {
    totalTenants: countInt(totalsRow?.total),
    activeTenants: countInt(totalsRow?.active),
    newLast30Days: countInt(totalsRow?.recent),
    byStatus,
    byPlan,
  };
}

// ─── Tenant list ────────────────────────────────────────────────────────────

export interface TenantListItem {
  id: string;
  name: string;
  slug: string;
  planTier: PlanTier;
  subscriptionStatus: SubscriptionStatus;
  isActive: boolean;
  subscriptionExpiresAt: Date | null;
  businessEmail: string | null; // masked
  businessPhone: string | null; // masked
  createdAt: Date;
}

export interface ListTenantsInput {
  page: number;
  limit: number;
  q?: string;
  status?: SubscriptionStatus;
  plan?: PlanTier;
}

export async function listTenants(input: ListTenantsInput): Promise<{
  items: TenantListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}> {
  const conditions: SQL[] = [];
  if (input.q) {
    const term = `%${input.q}%`;
    const search = or(
      ilike(tenants.name, term),
      ilike(tenants.slug, term),
      ilike(tenants.businessEmail, term),
    );
    if (search) conditions.push(search);
  }
  if (input.status) conditions.push(eq(tenants.subscriptionStatus, input.status));
  if (input.plan) conditions.push(eq(tenants.planTier, input.plan));

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const offset = (input.page - 1) * input.limit;

  const [rows, totalRows] = await Promise.all([
    db
      .select({
        id: tenants.id,
        name: tenants.name,
        slug: tenants.slug,
        planTier: tenants.planTier,
        subscriptionStatus: tenants.subscriptionStatus,
        isActive: tenants.isActive,
        subscriptionExpiresAt: tenants.subscriptionExpiresAt,
        businessEmail: tenants.businessEmail,
        businessPhone: tenants.businessPhone,
        createdAt: tenants.createdAt,
      })
      .from(tenants)
      .where(where)
      .orderBy(desc(tenants.createdAt))
      .limit(input.limit)
      .offset(offset),
    db
      .select({ count: sql<string>`count(*)` })
      .from(tenants)
      .where(where),
  ]);

  const total = countInt(totalRows[0]?.count);
  return {
    items: rows.map((row) => ({
      ...row,
      businessEmail: maskEmail(row.businessEmail),
      businessPhone: maskPhone(row.businessPhone),
    })),
    total,
    page: input.page,
    limit: input.limit,
    totalPages: Math.ceil(total / input.limit),
  };
}

// ─── Tenant detail ──────────────────────────────────────────────────────────
// One tenant at a time, so the per-schema drilldown is a single scoped query set.

export interface TenantDetail extends TenantListItem {
  metrics: {
    staffCount: number;
    productCount: number;
    orderCount: number;
    grossPaymentsKobo: number;
  };
  onboarding: {
    percentComplete: number;
    isComplete: boolean;
    completedSteps: string[];
    pendingSteps: string[];
  };
}

export async function getTenantDetail(tenantId: string): Promise<TenantDetail> {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!tenant) throw new NotFoundError('Tenant', tenantId);

  const metrics = await withTenantSchema(tenant.schemaName, async (tenantDb) => {
    const [[staff], [product], [order], [gross]] = await Promise.all([
      tenantDb.select({ c: sql<string>`count(*)` }).from(users),
      tenantDb.select({ c: sql<string>`count(*)` }).from(products),
      tenantDb.select({ c: sql<string>`count(*)` }).from(orders),
      tenantDb
        .select({ sum: sql<string>`coalesce(sum(${payments.amountKobo}), 0)` })
        .from(payments)
        .where(eq(payments.status, 'paid')),
    ]);
    return {
      staffCount: countInt(staff?.c),
      productCount: countInt(product?.c),
      orderCount: countInt(order?.c),
      grossPaymentsKobo: countInt(gross?.sum),
    };
  });

  const onboarding = await getOnboardingStatus(tenant.id, tenant.schemaName);

  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    planTier: tenant.planTier,
    subscriptionStatus: tenant.subscriptionStatus,
    isActive: tenant.isActive,
    subscriptionExpiresAt: tenant.subscriptionExpiresAt,
    businessEmail: maskEmail(tenant.businessEmail),
    businessPhone: maskPhone(tenant.businessPhone),
    createdAt: tenant.createdAt,
    metrics,
    onboarding: {
      percentComplete: onboarding.percentComplete,
      isComplete: onboarding.isComplete,
      completedSteps: onboarding.completedSteps,
      pendingSteps: onboarding.pendingSteps,
    },
  };
}
