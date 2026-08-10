import { ValidationError } from '../../shared/errors/types.js';

export type OrderStatus =
  | 'draft'
  | 'confirmed'
  | 'processing'
  | 'fulfilled'
  | 'dispatched'
  | 'cancelled'
  | 'refunded';

const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  draft: ['confirmed', 'cancelled'],
  confirmed: ['processing', 'cancelled'],
  processing: ['fulfilled', 'dispatched', 'cancelled'],
  dispatched: ['fulfilled', 'cancelled'],
  fulfilled: ['refunded'],
  cancelled: [],
  refunded: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return (VALID_TRANSITIONS[from] ?? []).includes(to);
}

export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransition(from, to)) {
    throw new ValidationError(`Cannot transition order from '${from}' to '${to}'`);
  }
}
