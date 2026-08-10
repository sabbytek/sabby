import { describe, it, expect } from 'vitest';
import {
  canTransition,
  assertTransition,
  type SubscriptionStatus,
} from '../../src/modules/subscriptions/state-machine.js';

describe('canTransition', () => {
  // ─── Valid transitions ────────────────────────────────────────────────────

  it('trial → active', () => expect(canTransition('trial', 'active')).toBe(true));
  it('trial → cancelled', () => expect(canTransition('trial', 'cancelled')).toBe(true));

  it('active → grace', () => expect(canTransition('active', 'grace')).toBe(true));
  it('active → cancelled', () => expect(canTransition('active', 'cancelled')).toBe(true));

  it('grace → active', () => expect(canTransition('grace', 'active')).toBe(true));
  it('grace → lapsed', () => expect(canTransition('grace', 'lapsed')).toBe(true));
  it('grace → cancelled', () => expect(canTransition('grace', 'cancelled')).toBe(true));

  it('lapsed → active', () => expect(canTransition('lapsed', 'active')).toBe(true));
  it('lapsed → cancelled', () => expect(canTransition('lapsed', 'cancelled')).toBe(true));

  // ─── Invalid transitions ──────────────────────────────────────────────────

  it('cancelled is terminal — no outgoing transitions', () => {
    const targets: SubscriptionStatus[] = ['trial', 'active', 'grace', 'lapsed', 'cancelled'];
    for (const target of targets) {
      expect(canTransition('cancelled', target)).toBe(false);
    }
  });

  it('trial → grace is invalid', () => expect(canTransition('trial', 'grace')).toBe(false));
  it('trial → lapsed is invalid', () => expect(canTransition('trial', 'lapsed')).toBe(false));

  it('active → trial is invalid', () => expect(canTransition('active', 'trial')).toBe(false));
  it('active → lapsed is invalid (must go through grace)', () =>
    expect(canTransition('active', 'lapsed')).toBe(false));

  it('lapsed → trial is invalid', () => expect(canTransition('lapsed', 'trial')).toBe(false));
  it('lapsed → grace is invalid', () => expect(canTransition('lapsed', 'grace')).toBe(false));
});

describe('assertTransition', () => {
  it('does not throw on valid transition', () => {
    expect(() => assertTransition('trial', 'active')).not.toThrow();
    expect(() => assertTransition('active', 'grace')).not.toThrow();
    expect(() => assertTransition('grace', 'lapsed')).not.toThrow();
    expect(() => assertTransition('lapsed', 'active')).not.toThrow();
  });

  it('throws ValidationError on invalid transition', () => {
    expect(() => assertTransition('trial', 'lapsed')).toThrow('Invalid subscription status transition');
    expect(() => assertTransition('cancelled', 'active')).toThrow('Invalid subscription status transition');
    expect(() => assertTransition('active', 'trial')).toThrow('Invalid subscription status transition');
  });

  it('error message contains from and to states', () => {
    expect(() => assertTransition('cancelled', 'active'))
      .toThrow(/cancelled.*active/);
  });
});
