// ─── Journal entry templates ──────────────────────────────────────────────────
// Pure functions — no DB, no env. Fully unit-testable.
// Each template produces a balanced double-entry (debits = credits).
//
// Chart of accounts used (seeded on tenant provisioning):
//   1000  Cash                    (asset)
//   4000  Revenue                 (revenue)
//   5100  Payment Processing Fees (expense)
//   5200  Operating Expenses      (expense)
//   5300  Refunds                 (expense)
//   5400  Logistics Costs         (expense)

export interface JournalLine {
  accountCode: string;
  type: 'debit' | 'credit';
  amountKobo: number;
}

export interface JournalEntryDraft {
  referenceId: string;
  referenceType: string;
  description: string;
  lines: JournalLine[];
}

// Throws if the entry is not balanced (debits ≠ credits).
// Called internally by each template — also exported for unit testing.
export function assertBalanced(lines: JournalLine[]): void {
  const debits = lines.filter((l) => l.type === 'debit').reduce((s, l) => s + l.amountKobo, 0);
  const credits = lines.filter((l) => l.type === 'credit').reduce((s, l) => s + l.amountKobo, 0);
  if (debits !== credits) {
    throw new Error(`Unbalanced journal entry: debits=${debits} credits=${credits}`);
  }
}

// When Paystack confirms a payment: cash received = revenue earned.
export function orderPaidTemplate(
  paymentId: string,
  orderId: string,
  amountKobo: number,
): JournalEntryDraft {
  const lines: JournalLine[] = [
    { accountCode: '1000', type: 'debit', amountKobo },   // Cash ↑
    { accountCode: '4000', type: 'credit', amountKobo },  // Revenue ↑
  ];
  assertBalanced(lines);
  return {
    referenceId: paymentId,
    referenceType: 'order_payment',
    description: `Payment received for order ${orderId}`,
    lines,
  };
}

// When a payment gateway fee is deducted from the settlement.
export function paymentFeeTemplate(paymentId: string, feeKobo: number): JournalEntryDraft {
  const lines: JournalLine[] = [
    { accountCode: '5100', type: 'debit', amountKobo: feeKobo },   // Fee expense ↑
    { accountCode: '1000', type: 'credit', amountKobo: feeKobo },  // Cash ↓
  ];
  assertBalanced(lines);
  return {
    referenceId: paymentId,
    referenceType: 'payment_fee',
    description: `Payment processing fee for payment ${paymentId}`,
    lines,
  };
}

// When a refund is issued to a customer.
export function orderRefundedTemplate(
  paymentId: string,
  amountKobo: number,
): JournalEntryDraft {
  const lines: JournalLine[] = [
    { accountCode: '5300', type: 'debit', amountKobo },   // Refund expense ↑
    { accountCode: '1000', type: 'credit', amountKobo },  // Cash ↓
  ];
  assertBalanced(lines);
  return {
    referenceId: paymentId,
    referenceType: 'refund',
    description: `Refund issued for payment ${paymentId}`,
    lines,
  };
}

// When a business expense is recorded.
export function expenseRecordedTemplate(
  expenseId: string,
  amountKobo: number,
  description: string,
): JournalEntryDraft {
  const lines: JournalLine[] = [
    { accountCode: '5200', type: 'debit', amountKobo },   // Operating expense ↑
    { accountCode: '1000', type: 'credit', amountKobo },  // Cash ↓
  ];
  assertBalanced(lines);
  return {
    referenceId: expenseId,
    referenceType: 'expense',
    description,
    lines,
  };
}

// When a delivery fee is collected from the customer (revenue for the merchant).
export function deliveryFeeCollectedTemplate(
  orderId: string,
  feeKobo: number,
): JournalEntryDraft {
  const lines: JournalLine[] = [
    { accountCode: '1000', type: 'debit', amountKobo: feeKobo },   // Cash ↑
    { accountCode: '4000', type: 'credit', amountKobo: feeKobo },  // Revenue ↑
  ];
  assertBalanced(lines);
  return {
    referenceId: orderId,
    referenceType: 'delivery_fee',
    description: `Delivery fee collected for order ${orderId}`,
    lines,
  };
}

// When the merchant pays the logistics provider for dispatch.
export function logisticsCostTemplate(
  orderId: string,
  costKobo: number,
): JournalEntryDraft {
  const lines: JournalLine[] = [
    { accountCode: '5400', type: 'debit', amountKobo: costKobo },   // Logistics cost ↑
    { accountCode: '1000', type: 'credit', amountKobo: costKobo },  // Cash ↓
  ];
  assertBalanced(lines);
  return {
    referenceId: orderId,
    referenceType: 'logistics_cost',
    description: `Logistics dispatch cost for order ${orderId}`,
    lines,
  };
}
