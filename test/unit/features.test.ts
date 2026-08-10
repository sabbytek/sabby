import { describe, it, expect } from 'vitest';
import { PLAN_ENTITLEMENTS, PLAN_PRICING_NGN, type PlanTier } from '../../src/config/features.js';

describe('Feature gating configuration', () => {
  const allTiers: PlanTier[] = ['trial', 'entry', 'growth', 'enterprise'];

  it('every plan tier has entitlements defined', () => {
    for (const tier of allTiers) {
      expect(PLAN_ENTITLEMENTS[tier]).toBeDefined();
    }
  });

  it('trial plan cannot access P&L reporting', () => {
    expect(PLAN_ENTITLEMENTS.trial['reporting:pl'].allowed).toBe(false);
  });

  it('entry plan can access P&L reporting', () => {
    expect(PLAN_ENTITLEMENTS.entry['reporting:pl'].allowed).toBe(true);
  });

  it('trial plan has order limit', () => {
    const entitlement = PLAN_ENTITLEMENTS.trial['orders:create'];
    expect(entitlement.allowed).toBe(true);
    expect(entitlement.limit).toBe(20);
  });

  it('growth and enterprise plans have no order limit', () => {
    expect(PLAN_ENTITLEMENTS.growth['orders:create'].limit).toBeUndefined();
    expect(PLAN_ENTITLEMENTS.enterprise['orders:create'].limit).toBeUndefined();
  });

  it('WhatsApp ordering requires growth or enterprise', () => {
    expect(PLAN_ENTITLEMENTS.trial['whatsapp:ordering'].allowed).toBe(false);
    expect(PLAN_ENTITLEMENTS.entry['whatsapp:ordering'].allowed).toBe(false);
    expect(PLAN_ENTITLEMENTS.growth['whatsapp:ordering'].allowed).toBe(true);
    expect(PLAN_ENTITLEMENTS.enterprise['whatsapp:ordering'].allowed).toBe(true);
  });

  it('entry plan price is ₦3,500 (350000 kobo)', () => {
    expect(PLAN_PRICING_NGN.entry).toBe(350000);
  });

  it('all features are defined on every plan tier', () => {
    const featuresOnEnterprise = Object.keys(PLAN_ENTITLEMENTS.enterprise);
    for (const tier of allTiers) {
      const featuresOnTier = Object.keys(PLAN_ENTITLEMENTS[tier]);
      expect(featuresOnTier.sort()).toEqual(featuresOnEnterprise.sort());
    }
  });
});
