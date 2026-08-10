/** Returns true when quantityOnHand is at or below the low-stock threshold. */
export function isLowStock(quantityOnHand: number, threshold: number): boolean {
  return quantityOnHand <= threshold;
}
