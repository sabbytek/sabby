import { eq, sql } from 'drizzle-orm';
import { withTenantSchema } from '../../shared/db/tenant.js';
import { db } from '../../shared/db/client.js';
import {
  users,
  products,
  payments,
  locations,
} from '../../shared/db/schema/tenant.js';
import { tenants } from '../../shared/db/schema/public.js';

export interface OnboardingStatus {
  tenantId: string;
  tenantName: string;
  planTier: string;
  completedSteps: string[];
  pendingSteps: string[];
  percentComplete: number;
  isComplete: boolean;
}

interface StepCheck {
  key: string;
  label: string;
  check: () => Promise<boolean>;
}

export async function getOnboardingStatus(
  tenantId: string,
  schemaName: string,
): Promise<OnboardingStatus> {
  const [tenant] = await db
    .select({ name: tenants.name, planTier: tenants.planTier })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  const steps: StepCheck[] = [
    {
      key: 'staff_invited',
      label: 'Invite at least one staff member',
      check: async () => {
        const [row] = await withTenantSchema(schemaName, (db) =>
          db.select({ count: sql<string>`count(*)` }).from(users),
        );
        return parseInt(row?.count ?? '0') >= 2; // owner + at least 1 staff
      },
    },
    {
      key: 'location_created',
      label: 'Add your first location',
      check: async () => {
        const [row] = await withTenantSchema(schemaName, (db) =>
          db.select({ count: sql<string>`count(*)` }).from(locations),
        );
        return parseInt(row?.count ?? '0') > 0;
      },
    },
    {
      key: 'product_created',
      label: 'Add your first product',
      check: async () => {
        const [row] = await withTenantSchema(schemaName, (db) =>
          db.select({ count: sql<string>`count(*)` }).from(products),
        );
        return parseInt(row?.count ?? '0') > 0;
      },
    },
    {
      key: 'payment_received',
      label: 'Receive your first payment',
      check: async () => {
        const [row] = await withTenantSchema(schemaName, (db) =>
          db
            .select({ count: sql<string>`count(*)` })
            .from(payments)
            .where(eq(payments.status, 'paid')),
        );
        return parseInt(row?.count ?? '0') > 0;
      },
    },
    {
      key: 'subscription_active',
      label: 'Activate a subscription plan',
      check: async () => {
        const [row] = await db
          .select({ status: tenants.subscriptionStatus })
          .from(tenants)
          .where(eq(tenants.id, tenantId))
          .limit(1);
        return row?.status === 'active' || row?.status === 'grace';
      },
    },
  ];

  const results = await Promise.all(
    steps.map(async (step) => ({ key: step.key, label: step.label, done: await step.check() })),
  );

  const completed = results.filter((r) => r.done).map((r) => r.label);
  const pending = results.filter((r) => !r.done).map((r) => r.label);
  const percent = Math.round((completed.length / steps.length) * 100);

  return {
    tenantId,
    tenantName: tenant?.name ?? '',
    planTier: tenant?.planTier ?? 'trial',
    completedSteps: completed,
    pendingSteps: pending,
    percentComplete: percent,
    isComplete: pending.length === 0,
  };
}
