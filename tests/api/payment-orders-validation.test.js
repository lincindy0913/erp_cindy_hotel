import { vi, describe, it, expect, beforeEach } from 'vitest';

// ── Hoisted mock handles ──────────────────────────────────────────────────────
const { mockTx, mockAssertPeriodOpen } = vi.hoisted(() => {
  const mockAssertPeriodOpen = vi.fn().mockResolvedValue(undefined);
  const mockTx = {
    paymentOrder:  { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: 1, orderNo: 'PAY-001' }) },
    cashAccount:   { findUnique: vi.fn().mockResolvedValue(null) },
    check:         { create: vi.fn().mockResolvedValue({ id: 1 }) },
    monthEndStatus:{ findFirst: vi.fn().mockResolvedValue(null) },
    engineeringContractTerm: { findUnique: vi.fn().mockResolvedValue(null) },
  };
  return { mockTx, mockAssertPeriodOpen };
});

// ── Mocks ─────────────────────────────────────────────────────────────────────
vi.mock('@/lib/api-auth', () => ({
  requirePermission: vi.fn().mockResolvedValue({ ok: true, session: { user: { email: 'test@test.com' } } }),
}));

vi.mock('@/lib/warehouse-access', () => ({
  applyWarehouseFilter: vi.fn().mockReturnValue({ ok: true }),
  assertWarehouseAccess: vi.fn().mockReturnValue({ ok: true }),
}));

vi.mock('@/lib/idempotency', () => ({
  checkIdempotency: vi.fn().mockReturnValue(null),
  saveIdempotency: vi.fn(),
  getIdempotencyKey: vi.fn().mockReturnValue('key'),
}));

vi.mock('@/lib/audit', () => ({
  auditFromSession: vi.fn().mockResolvedValue(undefined),
  AUDIT_ACTIONS: { CREATE_PAYMENT_ORDER: 'create_payment_order' },
}));

vi.mock('@/lib/period-lock', () => ({
  assertPeriodOpen: mockAssertPeriodOpen,
}));

vi.mock('@/lib/sequence-generator', () => ({
  nextSequence: vi.fn().mockResolvedValue('PAY-20260611-001'),
}));

vi.mock('@/lib/localDate', () => ({
  localDateStr: vi.fn().mockReturnValue('2026-06-11'),
}));

vi.mock('next-auth', () => ({
  getServerSession: vi.fn().mockResolvedValue({ user: { email: 'test@test.com' } }),
}));

vi.mock('@/app/api/auth/[...nextauth]/route', () => ({ authOptions: {} }));

vi.mock('@/lib/prisma', () => ({
  default: {
    $transaction:  vi.fn().mockImplementation(fn => fn(mockTx)),
    cashAccount:   { findUnique: vi.fn().mockResolvedValue(null) },
    paymentOrder:  { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

// ── Import under test ─────────────────────────────────────────────────────────
import { POST } from '@/app/api/payment-orders/route.js';

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeRequest(body) {
  return new Request('http://localhost/api/payment-orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const validBody = {
  invoiceIds:   [1, 2],
  paymentMethod:'匯款',
  netAmount:    10000,
  warehouse:    '麗格',
  supplierId:   1,
  supplierName: '測試廠商',
  dueDate:      '2026-07-01',
};

beforeEach(() => vi.clearAllMocks());

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('POST /api/payment-orders — body validation', () => {
  it('缺少 invoiceIds → 400', async () => {
    const { invoiceIds: _, ...body } = validBody;
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe('VALIDATION_FAILED');
  });

  it('缺少 paymentMethod → 400', async () => {
    const { paymentMethod: _, ...body } = validBody;
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(400);
  });

  it('缺少 netAmount → 400', async () => {
    const { netAmount: _, ...body } = validBody;
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(400);
  });

  it('netAmount 為負數 → 400', async () => {
    const res = await POST(makeRequest({ ...validBody, netAmount: -500 }));
    expect(res.status).toBe(400);
  });

  it('netAmount 超過上限 → 400', async () => {
    const res = await POST(makeRequest({ ...validBody, netAmount: 99999999999 }));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/payment-orders — 期間鎖', () => {
  it('期間已結帳 → 423 且 code = PERIOD_LOCKED', async () => {
    mockAssertPeriodOpen.mockRejectedValueOnce(
      new Error('PERIOD_LOCKED:2026年7月已結帳，無法新增或修改交易。')
    );
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(423);
    const json = await res.json();
    expect(json.code).toBe('PERIOD_LOCKED');
    expect(json.error).toContain('已結帳');
  });
});
