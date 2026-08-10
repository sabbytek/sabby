import { describe, it, expect } from 'vitest';
import {
  assertBalanced,
  orderPaidTemplate,
  paymentFeeTemplate,
  orderRefundedTemplate,
  expenseRecordedTemplate,
} from '../../src/modules/ledger/templates.js';

describe('assertBalanced', () => {
  it('passes when debits equal credits', () => {
    expect(() =>
      assertBalanced([
        { accountCode: '1000', type: 'debit', amountKobo: 10000 },
        { accountCode: '4000', type: 'credit', amountKobo: 10000 },
      ]),
    ).not.toThrow();
  });

  it('throws when debits exceed credits', () => {
    expect(() =>
      assertBalanced([
        { accountCode: '1000', type: 'debit', amountKobo: 10000 },
        { accountCode: '4000', type: 'credit', amountKobo: 5000 },
      ]),
    ).toThrow('Unbalanced journal entry');
  });

  it('throws when credits exceed debits', () => {
    expect(() =>
      assertBalanced([
        { accountCode: '1000', type: 'debit', amountKobo: 3000 },
        { accountCode: '4000', type: 'credit', amountKobo: 9000 },
      ]),
    ).toThrow('Unbalanced journal entry');
  });

  it('passes with multiple balanced lines', () => {
    expect(() =>
      assertBalanced([
        { accountCode: '1000', type: 'debit', amountKobo: 10000 },
        { accountCode: '5100', type: 'debit', amountKobo: 2000 },
        { accountCode: '4000', type: 'credit', amountKobo: 12000 },
      ]),
    ).not.toThrow();
  });

  it('passes with zero-value entry', () => {
    expect(() =>
      assertBalanced([
        { accountCode: '1000', type: 'debit', amountKobo: 0 },
        { accountCode: '4000', type: 'credit', amountKobo: 0 },
      ]),
    ).not.toThrow();
  });
});

describe('orderPaidTemplate', () => {
  it('produces a balanced entry', () => {
    const draft = orderPaidTemplate('payment-1', 'order-1', 100000);
    const debits = draft.lines.filter((l) => l.type === 'debit').reduce((s, l) => s + l.amountKobo, 0);
    const credits = draft.lines.filter((l) => l.type === 'credit').reduce((s, l) => s + l.amountKobo, 0);
    expect(debits).toBe(credits);
  });

  it('debits Cash and credits Revenue', () => {
    const draft = orderPaidTemplate('payment-1', 'order-1', 50000);
    const cashDebit = draft.lines.find((l) => l.accountCode === '1000' && l.type === 'debit');
    const revenueCredit = draft.lines.find((l) => l.accountCode === '4000' && l.type === 'credit');
    expect(cashDebit?.amountKobo).toBe(50000);
    expect(revenueCredit?.amountKobo).toBe(50000);
  });

  it('sets correct referenceType', () => {
    const draft = orderPaidTemplate('payment-1', 'order-1', 10000);
    expect(draft.referenceType).toBe('order_payment');
    expect(draft.referenceId).toBe('payment-1');
  });
});

describe('paymentFeeTemplate', () => {
  it('produces a balanced entry', () => {
    const draft = paymentFeeTemplate('payment-1', 1500);
    const debits = draft.lines.filter((l) => l.type === 'debit').reduce((s, l) => s + l.amountKobo, 0);
    const credits = draft.lines.filter((l) => l.type === 'credit').reduce((s, l) => s + l.amountKobo, 0);
    expect(debits).toBe(credits);
  });

  it('debits Fees and credits Cash', () => {
    const draft = paymentFeeTemplate('payment-1', 1500);
    const feeDebit = draft.lines.find((l) => l.accountCode === '5100' && l.type === 'debit');
    const cashCredit = draft.lines.find((l) => l.accountCode === '1000' && l.type === 'credit');
    expect(feeDebit?.amountKobo).toBe(1500);
    expect(cashCredit?.amountKobo).toBe(1500);
  });

  it('sets correct referenceType', () => {
    const draft = paymentFeeTemplate('payment-1', 1500);
    expect(draft.referenceType).toBe('payment_fee');
  });
});

describe('orderRefundedTemplate', () => {
  it('produces a balanced entry', () => {
    const draft = orderRefundedTemplate('payment-1', 75000);
    const debits = draft.lines.filter((l) => l.type === 'debit').reduce((s, l) => s + l.amountKobo, 0);
    const credits = draft.lines.filter((l) => l.type === 'credit').reduce((s, l) => s + l.amountKobo, 0);
    expect(debits).toBe(credits);
  });

  it('debits Refunds and credits Cash', () => {
    const draft = orderRefundedTemplate('payment-1', 75000);
    const refundDebit = draft.lines.find((l) => l.accountCode === '5300' && l.type === 'debit');
    const cashCredit = draft.lines.find((l) => l.accountCode === '1000' && l.type === 'credit');
    expect(refundDebit?.amountKobo).toBe(75000);
    expect(cashCredit?.amountKobo).toBe(75000);
  });

  it('sets correct referenceType', () => {
    const draft = orderRefundedTemplate('payment-1', 75000);
    expect(draft.referenceType).toBe('refund');
  });
});

describe('expenseRecordedTemplate', () => {
  it('produces a balanced entry', () => {
    const draft = expenseRecordedTemplate('expense-1', 20000, 'Office supplies');
    const debits = draft.lines.filter((l) => l.type === 'debit').reduce((s, l) => s + l.amountKobo, 0);
    const credits = draft.lines.filter((l) => l.type === 'credit').reduce((s, l) => s + l.amountKobo, 0);
    expect(debits).toBe(credits);
  });

  it('debits Operating Expenses and credits Cash', () => {
    const draft = expenseRecordedTemplate('expense-1', 20000, 'Office supplies');
    const opDebit = draft.lines.find((l) => l.accountCode === '5200' && l.type === 'debit');
    const cashCredit = draft.lines.find((l) => l.accountCode === '1000' && l.type === 'credit');
    expect(opDebit?.amountKobo).toBe(20000);
    expect(cashCredit?.amountKobo).toBe(20000);
  });

  it('stores the description', () => {
    const draft = expenseRecordedTemplate('expense-1', 20000, 'Staff transport allowance');
    expect(draft.description).toBe('Staff transport allowance');
  });

  it('sets correct referenceType', () => {
    const draft = expenseRecordedTemplate('expense-1', 20000, 'x');
    expect(draft.referenceType).toBe('expense');
    expect(draft.referenceId).toBe('expense-1');
  });
});

describe('All templates produce integer kobo amounts', () => {
  it('orderPaidTemplate', () => {
    const { lines } = orderPaidTemplate('p', 'o', 99999);
    expect(lines.every((l) => Number.isInteger(l.amountKobo))).toBe(true);
  });

  it('paymentFeeTemplate', () => {
    const { lines } = paymentFeeTemplate('p', 3333);
    expect(lines.every((l) => Number.isInteger(l.amountKobo))).toBe(true);
  });
});
