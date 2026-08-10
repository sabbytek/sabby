import { describe, it, expect } from 'vitest';
import { canTransition, assertTransition } from '../../src/modules/orders/state-machine.js';
import { ValidationError } from '../../src/shared/errors/types.js';
import type { OrderStatus } from '../../src/modules/orders/state-machine.js';

describe('Order state machine', () => {
  // ─── canTransition ─────────────────────────────────────────────────────────

  describe('canTransition', () => {
    const validTransitions: [OrderStatus, OrderStatus][] = [
      ['draft', 'confirmed'],
      ['draft', 'cancelled'],
      ['confirmed', 'processing'],
      ['confirmed', 'cancelled'],
      ['processing', 'fulfilled'],
      ['processing', 'cancelled'],
      ['fulfilled', 'refunded'],
    ];

    it.each(validTransitions)('allows %s → %s', (from, to) => {
      expect(canTransition(from, to)).toBe(true);
    });

    const invalidTransitions: [OrderStatus, OrderStatus][] = [
      ['draft', 'processing'],
      ['draft', 'fulfilled'],
      ['draft', 'refunded'],
      ['confirmed', 'draft'],
      ['confirmed', 'fulfilled'],
      ['confirmed', 'refunded'],
      ['processing', 'draft'],
      ['processing', 'confirmed'],
      ['processing', 'refunded'],
      ['fulfilled', 'draft'],
      ['fulfilled', 'confirmed'],
      ['fulfilled', 'processing'],
      ['fulfilled', 'cancelled'],
      ['cancelled', 'draft'],
      ['cancelled', 'confirmed'],
      ['cancelled', 'processing'],
      ['cancelled', 'fulfilled'],
      ['cancelled', 'refunded'],
      ['refunded', 'draft'],
      ['refunded', 'confirmed'],
      ['refunded', 'cancelled'],
    ];

    it.each(invalidTransitions)('blocks %s → %s', (from, to) => {
      expect(canTransition(from, to)).toBe(false);
    });
  });

  // ─── assertTransition ──────────────────────────────────────────────────────

  describe('assertTransition', () => {
    it('does not throw for a valid transition', () => {
      expect(() => assertTransition('draft', 'confirmed')).not.toThrow();
      expect(() => assertTransition('confirmed', 'processing')).not.toThrow();
      expect(() => assertTransition('processing', 'fulfilled')).not.toThrow();
    });

    it('throws ValidationError for an invalid transition', () => {
      expect(() => assertTransition('fulfilled', 'draft')).toThrow(ValidationError);
      expect(() => assertTransition('cancelled', 'confirmed')).toThrow(ValidationError);
      expect(() => assertTransition('refunded', 'draft')).toThrow(ValidationError);
    });

    it('throws with a message containing both statuses', () => {
      try {
        assertTransition('cancelled', 'confirmed');
        expect.fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ValidationError);
        expect((err as ValidationError).message).toContain('cancelled');
        expect((err as ValidationError).message).toContain('confirmed');
      }
    });

    it('terminal states have no valid outgoing transitions', () => {
      const terminalStates: OrderStatus[] = ['cancelled', 'refunded'];
      const allStatuses: OrderStatus[] = [
        'draft', 'confirmed', 'processing', 'fulfilled', 'cancelled', 'refunded',
      ];
      for (const from of terminalStates) {
        for (const to of allStatuses) {
          expect(canTransition(from, to)).toBe(false);
        }
      }
    });
  });
});
