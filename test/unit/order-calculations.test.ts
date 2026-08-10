import { describe, it, expect } from 'vitest';
import { calculateOrderTotals } from '../../src/modules/orders/calculations.js';

describe('calculateOrderTotals', () => {
  it('single item with no discount or tax', () => {
    const result = calculateOrderTotals([
      { quantity: 2, unitPriceKobo: 50000 },
    ]);
    expect(result.lineTotalsKobo[0]).toBe(100000);
    expect(result.subtotalKobo).toBe(100000);
    expect(result.totalKobo).toBe(100000);
  });

  it('multiple items sum correctly', () => {
    const result = calculateOrderTotals([
      { quantity: 1, unitPriceKobo: 30000 },
      { quantity: 3, unitPriceKobo: 20000 },
    ]);
    expect(result.lineTotalsKobo[0]).toBe(30000);
    expect(result.lineTotalsKobo[1]).toBe(60000);
    expect(result.subtotalKobo).toBe(90000);
    expect(result.totalKobo).toBe(90000);
  });

  it('applies order-level discount', () => {
    const result = calculateOrderTotals(
      [{ quantity: 1, unitPriceKobo: 100000 }],
      10000, // 10% off on a ₦1000 item
    );
    expect(result.subtotalKobo).toBe(100000);
    expect(result.totalKobo).toBe(90000);
  });

  it('applies order-level tax', () => {
    const result = calculateOrderTotals(
      [{ quantity: 1, unitPriceKobo: 100000 }],
      0,
      7500, // VAT stub
    );
    expect(result.subtotalKobo).toBe(100000);
    expect(result.totalKobo).toBe(107500);
  });

  it('applies line-level discount and tax', () => {
    const result = calculateOrderTotals([
      {
        quantity: 1,
        unitPriceKobo: 100000,
        discountKobo: 5000,
        taxKobo: 2000,
      },
    ]);
    // 100000 - 5000 + 2000 = 97000
    expect(result.lineTotalsKobo[0]).toBe(97000);
    expect(result.subtotalKobo).toBe(97000);
    expect(result.totalKobo).toBe(97000);
  });

  it('clamps negative line totals to zero', () => {
    const result = calculateOrderTotals([
      { quantity: 1, unitPriceKobo: 1000, discountKobo: 5000 },
    ]);
    expect(result.lineTotalsKobo[0]).toBe(0);
    expect(result.subtotalKobo).toBe(0);
  });

  it('clamps negative total to zero when discount exceeds subtotal', () => {
    const result = calculateOrderTotals(
      [{ quantity: 1, unitPriceKobo: 5000 }],
      10000, // order discount larger than item price
    );
    expect(result.subtotalKobo).toBe(5000);
    expect(result.totalKobo).toBe(0);
  });

  it('all arithmetic stays integer (no floats)', () => {
    const result = calculateOrderTotals([
      { quantity: 3, unitPriceKobo: 33333 },
    ]);
    // 3 × 33333 = 99999
    expect(result.subtotalKobo).toBe(99999);
    expect(Number.isInteger(result.subtotalKobo)).toBe(true);
    expect(Number.isInteger(result.totalKobo)).toBe(true);
    expect(result.lineTotalsKobo.every(Number.isInteger)).toBe(true);
  });

  it('returns empty lineTotalsKobo for empty items array', () => {
    const result = calculateOrderTotals([]);
    expect(result.lineTotalsKobo).toHaveLength(0);
    expect(result.subtotalKobo).toBe(0);
    expect(result.totalKobo).toBe(0);
  });
});
