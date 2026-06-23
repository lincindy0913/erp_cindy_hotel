import { vi, describe, it, expect, beforeEach } from 'vitest';

// ── Hoisted mock handles ──────────────────────────────────────────────────────
const { cashTxCreate, poFindUnique, poUpdate, executionCreate } = vi.hoisted(() => {
  const cashTxCreate     = vi.fn();
  const poFindUnique     = vi.fn();
  const poUpdate         = vi.fn();
  const executionCreate  = vi.fn();
  return { cashTxCreate, poFindUnique, poUpdate, executionCreate };
});

// ── Mocks ─────────────────────────────────────────────────────────────────────
vi.mock('@/lib/api-auth', () => ({
  requirePermission: vi.fn().mockResolvedValue({ ok: true, session: { user: { email: 'cashier@test.com' } } }),
}));

vi.mock('@/lib/period-lock', () => ({
  assertPeriodOpen: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/recalc-balance', () => ({
  recalcBalance: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/cash-category-helper', () => ({
  getCategoryId: vi.fn().mockResolvedValue(1),
}));

vi.mock('@/lib/sequence-generator', () => ({
  nextSequence: vi.fn().mockImplementation((_tx, _m, _f, prefix) => `${prefix}001`),
}));

vi.mock('@/lib/idempotency', () => ({
  checkIdempotency: vi.fn().mockReturnValue(null),
  saveIdempotency:  vi.fn(),
  getIdempotencyKey:vi.fn().mockReturnValue('key'),
}));

vi.mock('@/lib/audit', () => ({
  auditFromSession: vi.fn().mockResolvedValue(undefined),
  AUDIT_ACTIONS:    { CASHIER_EXECUTE: 'cashier_execute' },
}));

vi.mock('@/lib/validate-body', () => ({
  validateBody: vi.fn().mockImplementation((body, _schema) => ({ ok: true, data: body })),
}));

vi.mock('@/lib/safe-parse', () => ({
  requireMoney: vi.fn().mockImplementation(v => v),
  requireInt:   vi.fn().mockImplementation(v => v),
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    $transaction: vi.fn().mockImplementation(fn => fn({
      paymentOrder:    { findUnique: poFindUnique, update: poUpdate },
      cashTransaction: { create: cashTxCreate },
      cashierExecution:{ create: executionCreate },
      supplier:        { findUnique: vi.fn().mockResolvedValue(null) },
      check:           { findFirst: vi.fn().mockResolvedValue(null) },
      loanMonthlyRecord:{ findFirst: vi.fn().mockResolvedValue(null) },
      rentalMaintenance:{ findFirst: vi.fn().mockResolvedValue(null) },
      propertyTax:     { findFirst: vi.fn().mockResolvedValue(null) },
      employeeAdvance: { create: vi.fn().mockResolvedValue({}) },
    })),
    paymentOrder: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

// ── Import under test ─────────────────────────────────────────────────────────
import { POST } from '@/app/api/cashier/execute/route.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────
const mockOrder = {
  id: 1,
  status: '待出納',
  warehouse: '麗格',
  orderNo: 'PAY-001',
  supplierId: 1,
  supplierName: '測試廠商',
  sourceType: null,
  sourceRecordId: null,
  paymentMethod: '匯款',
  createdBy: 'someone@test.com',
  summary: '測試付款單',
};

const validBody = {
  paymentOrderId: 1,
  executionDate:  '2026-06-11',
  actualAmount:   5000,
  accountId:      1,
  paymentMethod:  '匯款',
};

function makeRequest(body) {
  return new Request('http://localhost/api/cashier/execute', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  poFindUnique.mockResolvedValue(mockOrder);
  cashTxCreate.mockResolvedValue({ id: 1, transactionNo: 'CF-20260611-001' });
  executionCreate.mockResolvedValue({ id: 1, executionNo: 'CSH-20260611-001' });
  poUpdate.mockResolvedValue({ ...mockOrder, status: '已執行' });
});

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('POST /api/cashier/execute — 成功路徑', () => {
  it('→ 201 且回傳 executionNo', async () => {
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json).toHaveProperty('executionNo');
    expect(json).toHaveProperty('cashTransactionNo');
  });

  it('→ CashTransaction 以 type=支出 建立', async () => {
    await POST(makeRequest(validBody));
    expect(cashTxCreate).toHaveBeenCalledOnce();
    const callArgs = cashTxCreate.mock.calls[0][0].data;
    expect(callArgs.type).toBe('支出');
    expect(callArgs.sourceType).toBe('cashier_payment');
    expect(callArgs.status).toBe('已確認');
  });

  it('→ PaymentOrder 狀態更新為已執行', async () => {
    await POST(makeRequest(validBody));
    expect(poUpdate).toHaveBeenCalledOnce();
    expect(poUpdate.mock.calls[0][0].data.status).toBe('已執行');
  });
});

describe('POST /api/cashier/execute — 錯誤路徑', () => {
  it('付款單已執行（非待出納）→ 409', async () => {
    poFindUnique.mockResolvedValueOnce({ ...mockOrder, status: '已執行' });
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.code).toBe('IDEMPOTENT');
  });

  it('付款單不存在 → 404', async () => {
    poFindUnique.mockResolvedValueOnce(null);
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(404);
  });
});
