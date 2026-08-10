/**
 * Configuration-driven feature gating.
 * Plan entitlements are defined here — never in application logic.
 * Adding or changing a gate never requires a code change in business modules.
 */

export type PlanTier = 'trial' | 'entry' | 'growth' | 'enterprise';

export type FeatureKey =
  | 'orders:create'
  | 'orders:export'
  | 'inventory:track'
  | 'inventory:alerts'
  | 'customers:manage'
  | 'payments:accept'
  | 'payments:refund'
  | 'ledger:view'
  | 'reporting:pl'
  | 'reporting:margin'
  | 'reporting:staff_sales'
  | 'reporting:revenue_by_location'
  | 'reporting:cash_recon'
  | 'invoicing:generate'
  | 'expenses:track'
  | 'staff:invite'
  | 'staff:limit'
  | 'locations:manage'
  | 'whatsapp:ordering'
  | 'subscriptions:manage'
  | 'pos:use'
  | 'logistics:dispatch'
  | 'shipping:manage';

export interface FeatureLimit {
  allowed: boolean;
  limit?: number;
}

export type PlanEntitlements = Record<FeatureKey, FeatureLimit>;

export const PLAN_ENTITLEMENTS: Record<PlanTier, PlanEntitlements> = {
  trial: {
    'orders:create': { allowed: true, limit: 20 },
    'orders:export': { allowed: false },
    'inventory:track': { allowed: true },
    'inventory:alerts': { allowed: false },
    'customers:manage': { allowed: true, limit: 50 },
    'payments:accept': { allowed: true },
    'payments:refund': { allowed: false },
    'ledger:view': { allowed: true },
    'reporting:pl': { allowed: false },
    'reporting:margin': { allowed: false },
    'reporting:staff_sales': { allowed: false },
    'reporting:revenue_by_location': { allowed: false },
    'reporting:cash_recon': { allowed: false },
    'invoicing:generate': { allowed: false },
    'expenses:track': { allowed: false },
    'staff:invite': { allowed: false },
    'staff:limit': { allowed: true, limit: 1 },
    'locations:manage': { allowed: false },
    'whatsapp:ordering': { allowed: false },
    'subscriptions:manage': { allowed: true },
    'pos:use': { allowed: true },
    'logistics:dispatch': { allowed: false },
    'shipping:manage': { allowed: true },
  },
  entry: {
    'orders:create': { allowed: true },
    'orders:export': { allowed: true },
    'inventory:track': { allowed: true },
    'inventory:alerts': { allowed: true },
    'customers:manage': { allowed: true },
    'payments:accept': { allowed: true },
    'payments:refund': { allowed: true },
    'ledger:view': { allowed: true },
    'reporting:pl': { allowed: true },
    'reporting:margin': { allowed: true },
    'reporting:staff_sales': { allowed: true },
    'reporting:revenue_by_location': { allowed: false },
    'reporting:cash_recon': { allowed: true },
    'invoicing:generate': { allowed: true },
    'expenses:track': { allowed: true },
    'staff:invite': { allowed: true },
    'staff:limit': { allowed: true, limit: 5 },
    'locations:manage': { allowed: false },
    'whatsapp:ordering': { allowed: false },
    'subscriptions:manage': { allowed: true },
    'pos:use': { allowed: true },
    'logistics:dispatch': { allowed: false },
    'shipping:manage': { allowed: true },
  },
  growth: {
    'orders:create': { allowed: true },
    'orders:export': { allowed: true },
    'inventory:track': { allowed: true },
    'inventory:alerts': { allowed: true },
    'customers:manage': { allowed: true },
    'payments:accept': { allowed: true },
    'payments:refund': { allowed: true },
    'ledger:view': { allowed: true },
    'reporting:pl': { allowed: true },
    'reporting:margin': { allowed: true },
    'reporting:staff_sales': { allowed: true },
    'reporting:revenue_by_location': { allowed: true },
    'reporting:cash_recon': { allowed: true },
    'invoicing:generate': { allowed: true },
    'expenses:track': { allowed: true },
    'staff:invite': { allowed: true },
    'staff:limit': { allowed: true, limit: 20 },
    'locations:manage': { allowed: true },
    'whatsapp:ordering': { allowed: true },
    'subscriptions:manage': { allowed: true },
    'pos:use': { allowed: true },
    'logistics:dispatch': { allowed: true },
    'shipping:manage': { allowed: true },
  },
  enterprise: {
    'orders:create': { allowed: true },
    'orders:export': { allowed: true },
    'inventory:track': { allowed: true },
    'inventory:alerts': { allowed: true },
    'customers:manage': { allowed: true },
    'payments:accept': { allowed: true },
    'payments:refund': { allowed: true },
    'ledger:view': { allowed: true },
    'reporting:pl': { allowed: true },
    'reporting:margin': { allowed: true },
    'reporting:staff_sales': { allowed: true },
    'reporting:revenue_by_location': { allowed: true },
    'reporting:cash_recon': { allowed: true },
    'invoicing:generate': { allowed: true },
    'expenses:track': { allowed: true },
    'staff:invite': { allowed: true },
    'staff:limit': { allowed: true },
    'locations:manage': { allowed: true },
    'whatsapp:ordering': { allowed: true },
    'subscriptions:manage': { allowed: true },
    'pos:use': { allowed: true },
    'logistics:dispatch': { allowed: true },
    'shipping:manage': { allowed: true },
  },
};

export const PLAN_PRICING_NGN: Record<Exclude<PlanTier, 'trial'>, number> = {
  entry: 350000,    // ₦3,500 in kobo
  growth: 1000000,  // ₦10,000 in kobo
  enterprise: 0,    // custom pricing
};
