/**
 * Order total calculation — pure integer kobo arithmetic, no external dependencies.
 * Exportable independently of the service so unit tests have no env/DB imports.
 */

export interface LineInput {
  quantity: number;
  unitPriceKobo: number;
  discountKobo?: number;
  taxKobo?: number;
}

export interface OrderTotals {
  subtotalKobo: number;
  totalKobo: number;
  lineTotalsKobo: number[];
}

/**
 * Calculates order line totals, subtotal, and grand total — all in kobo (integer).
 *
 * lineTotal = (quantity × unitPrice) − lineDiscount + lineTax  (clamped ≥ 0)
 * subtotal  = Σ lineTotals
 * total     = subtotal − orderDiscount + orderTax              (clamped ≥ 0)
 */
export function calculateOrderTotals(
  lines: LineInput[],
  orderDiscountKobo = 0,
  orderTaxKobo = 0,
  deliveryFeeKobo = 0,
): OrderTotals {
  const lineTotalsKobo = lines.map((line) =>
    Math.max(
      0,
      line.quantity * line.unitPriceKobo - (line.discountKobo ?? 0) + (line.taxKobo ?? 0),
    ),
  );
  const subtotalKobo = lineTotalsKobo.reduce((sum, t) => sum + t, 0);
  const totalKobo = Math.max(0, subtotalKobo - orderDiscountKobo + orderTaxKobo + deliveryFeeKobo);
  return { subtotalKobo, totalKobo, lineTotalsKobo };
}
