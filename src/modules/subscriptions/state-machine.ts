import { ValidationError } from '../../shared/errors/types.js';

export type SubscriptionStatus = 'trial' | 'active' | 'grace' | 'lapsed' | 'cancelled';

const VALID_TRANSITIONS: Record<SubscriptionStatus, SubscriptionStatus[]> = {
  trial:     ['active', 'cancelled'],
  active:    ['grace', 'cancelled'],
  grace:     ['active', 'lapsed', 'cancelled'],
  lapsed:    ['active', 'cancelled'],
  cancelled: [],
};

export function canTransition(from: SubscriptionStatus, to: SubscriptionStatus): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

export function assertTransition(from: SubscriptionStatus, to: SubscriptionStatus): void {
  if (!canTransition(from, to)) {
    throw new ValidationError(
      `Invalid subscription status transition: ${from} → ${to}`,
    );
  }
}
