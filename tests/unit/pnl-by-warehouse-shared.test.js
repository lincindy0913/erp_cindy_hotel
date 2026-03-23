import { describe, it, expect } from 'vitest';
import {
  getPnlSubjectMeta,
  getPnlSubjectKey,
  buildPnlCashflowWhere,
} from '@/lib/pnl-by-warehouse-shared.js';

describe('getPnlSubjectKey', () => {
  it('uses accounting subject code when present', () => {
    const tx = {
      category: {
        accountingSubject: { code: '4100', name: '營收', category: '收入', subcategory: '房務' },
      },
    };
    expect(getPnlSubjectKey(tx)).toBe('4100');
    expect(getPnlSubjectMeta(tx).name).toBe('營收');
  });

  it('uses category name when no formal subject', () => {
    const tx = { category: { name: '雜項收入' }, accountingSubject: null };
    expect(getPnlSubjectKey(tx)).toBe('雜項收入');
  });

  it('uses legacy accountingSubject string', () => {
    const tx = { category: null, accountingSubject: '手動科目' };
    expect(getPnlSubjectKey(tx)).toBe('手動科目');
  });

  it('defaults to 未對應會計科目', () => {
    const tx = { category: null, accountingSubject: null };
    expect(getPnlSubjectKey(tx)).toBe('未對應會計科目');
  });
});

describe('buildPnlCashflowWhere', () => {
  it('adds warehouse when provided', () => {
    const w = buildPnlCashflowWhere('2025-01-01', '2025-01-31', 'A館');
    expect(w.warehouse).toBe('A館');
    expect(w.transactionDate).toEqual({ gte: '2025-01-01', lte: '2025-01-31' });
  });

  it('omits warehouse when null', () => {
    const w = buildPnlCashflowWhere('2025-01-01', '2025-01-31', null);
    expect(w.warehouse).toBeUndefined();
  });
});
