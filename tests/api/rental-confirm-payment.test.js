import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@/lib/api-auth', () => ({
  requirePermission: vi.fn().mockResolvedValue({ ok: true, session: { user: { name: 'tester' } } }),
}));

vi.mock('@/lib/rental-year-lock', () => ({
  assertRentalYearOpen: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/sequence-generator', () => ({
  nextCashTransactionNo: vi.fn().mockResolvedValue('TX-0001'),
}));

vi.mock('@/lib/cash-category-helper', () => ({
  getCategoryId: vi.fn().mockResolvedValue(null), // null → no category lookup
}));

vi.mock('@/lib/recalc-balance', () => ({
  recalcBalance: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/audit', () => ({
  auditFromSession: vi.fn().mockResolvedValue(undefined),
  AUDIT_ACTIONS: { RENTAL_INCOME_UPDATE: 'RENTAL_INCOME_UPDATE' },
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    rentalIncome: { findUnique: vi.fn() },
    rentalIncomePayment: { create: vi.fn() },
    cashTransaction: { create: vi.fn() },
    cashAccount: { findUnique: vi.fn(), update: vi.fn() },
    cashCategory: { findUnique: vi.fn() },
    rentalUtilityIncome: { upsert: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import prisma from '@/lib/prisma';
import { assertRentalYearOpen } from '@/lib/rental-year-lock';
import { POST } from '@/app/api/rentals/income/[id]/confirm/route.js';

const mockIncome = {
  id: 1, propertyId: 10, tenantId: 5,
  incomeYear: 2026, incomeMonth: 5,
  expectedAmount: 15000, cashTransactionId: null,
  property: { id: 10, name: '測試物業' },
  tenant: { fullName: '王大明', companyName: null, tenantType: 'individual' },
  payments: [],
};

function makeRequest(body) {
  return new Request('http://localhost/api/rentals/income/1/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeTxMock(newStatus) {
  prisma.$transaction.mockImplementation(async (fn) => {
    prisma.cashTransaction.create.mockResolvedValue({ id: 99 });
    prisma.rentalIncomePayment.create.mockResolvedValue({ id: 1 });
    prisma.rentalIncome.update = vi.fn().mockResolvedValue({ id: 1 });
    return fn(prisma).then ? fn(prisma) : { rentTxId: 99, utilityTxId: null, newStatus, nextSeq: 1 };
  });
  // Simulate the transaction returning the expected shape
  prisma.$transaction.mockImplementationOnce(async () => ({
    rentTxId: 99, utilityTxId: null, newStatus, nextSeq: 1,
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  prisma.rentalIncome.findUnique.mockResolvedValue(mockIncome);
  prisma.cashCategory.findUnique.mockResolvedValue(null);
});

const validBody = {
  rent: { actualAmount: 15000, actualDate: '2026-05-10', accountId: '1', paymentMethod: '匯款' },
};

describe('POST /api/rentals/income/[id]/confirm', () => {
  it('缺少必填欄位 → 400', async () => {
    const res = await POST(makeRequest({ rent: { actualAmount: 15000 } }), { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(400);
  });

  it('找不到收租紀錄 → 404', async () => {
    prisma.rentalIncome.findUnique.mockResolvedValue(null);
    const res = await POST(makeRequest(validBody), { params: Promise.resolve({ id: '999' }) });
    expect(res.status).toBe(404);
  });

  it('年度已鎖 → assertRentalYearOpen 拋錯', async () => {
    assertRentalYearOpen.mockRejectedValueOnce(new Error('2026 年已鎖定'));
    const res = await POST(makeRequest(validBody), { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('付款日期早於收款年度 → 400 INVALID_DATE (R17)', async () => {
    const body = { rent: { actualAmount: 15000, actualDate: '2025-12-31', accountId: '1', paymentMethod: '匯款' } };
    const res = await POST(makeRequest(body), { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.code).toBe('INVALID_DATE');
  });

  it('正常確認收款（全額）→ 200 + completed 狀態', async () => {
    makeTxMock('completed');
    const res = await POST(makeRequest(validBody), { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('completed');
  });

  it('部分收款（actualAmount < expected）→ 200 + partial 狀態', async () => {
    makeTxMock('partial');
    const body = { rent: { actualAmount: 5000, actualDate: '2026-05-10', accountId: '1', paymentMethod: '現金' } };
    const res = await POST(makeRequest(body), { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('partial');
  });
});
