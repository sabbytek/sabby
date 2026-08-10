import { describe, it, expect } from 'vitest';
import { isLowStock } from '../../src/modules/inventory/utils.js';

describe('isLowStock', () => {
  it('returns true when quantity is below threshold', () => {
    expect(isLowStock(2, 5)).toBe(true);
    expect(isLowStock(0, 5)).toBe(true);
    expect(isLowStock(1, 10)).toBe(true);
  });

  it('returns true when quantity equals the threshold', () => {
    expect(isLowStock(5, 5)).toBe(true);
    expect(isLowStock(0, 0)).toBe(true);
  });

  it('returns false when quantity is above threshold', () => {
    expect(isLowStock(6, 5)).toBe(false);
    expect(isLowStock(100, 5)).toBe(false);
    expect(isLowStock(1, 0)).toBe(false);
  });

  it('zero threshold means always low stock when qty is zero', () => {
    expect(isLowStock(0, 0)).toBe(true);
  });

  it('handles large quantities correctly', () => {
    expect(isLowStock(999, 1000)).toBe(true);
    expect(isLowStock(1001, 1000)).toBe(false);
  });
});
