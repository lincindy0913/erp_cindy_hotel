import { describe, it, expect } from 'vitest';
import { resolveCashTransactionSource } from '@/lib/resolve-cash-transaction-source.js';

describe('resolveCashTransactionSource', () => {
  it('returns hint when no record id', () => {
    const r = resolveCashTransactionSource('common_expense', null);
    expect(r.path).toBeNull();
    expect(r.hint).toContain('sourceRecordId');
  });

  it('resolves common_expense path', () => {
    const r = resolveCashTransactionSource('common_expense', 12);
    expect(r.path).toContain('/expenses');
    expect(r.label).toContain('12');
  });

  it('resolves loan_payment', () => {
    const r = resolveCashTransactionSource('loan_payment', 3);
    expect(r.path).toBe('/loans');
  });
});
