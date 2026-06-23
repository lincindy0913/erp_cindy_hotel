import { vi, describe, it, expect, beforeEach } from 'vitest';

// ── Hoisted mock handles ──────────────────────────────────────────────────────
const { detailUpdate, detailFindMany, masterUpdate, poFindFirst, poCreate, detailFindFirst } = vi.hoisted(() => {
  const detailUpdate   = vi.fn();
  const detailFindMany = vi.fn();
  const masterUpdate   = vi.fn();
  const poFindFirst    = vi.fn();
  const poCreate       = vi.fn();
  const detailFindFirst= vi.fn();
  return { detailUpdate, detailFindMany, masterUpdate, poFindFirst, poCreate, detailFindFirst };
});

// ── Mocks ─────────────────────────────────────────────────────────────────────
vi.mock('@/lib/api-auth', () => ({
  requirePermission: vi.fn().mockResolvedValue({ ok: true, session: { user: { email: 'test@test.com' } } }),
}));

vi.mock('@/lib/warehouse-access', () => ({
  assertWarehouseAccess: vi.fn().mockReturnValue({ ok: true }),
  applyWarehouseFilter:  vi.fn().mockReturnValue({ ok: true }),
}));

vi.mock('@/lib/audit', () => ({
  auditFromSession: vi.fn().mockResolvedValue(undefined),
  AUDIT_ACTIONS:    { PURCHASING_INBOUND: 'purchasing_inbound' },
}));

vi.mock('@/lib/sequence-generator', () => ({
  nextSequence: vi.fn().mockResolvedValue('PAY-20260611-001'),
}));

vi.mock('@/lib/localDate', () => ({
  todayStr: vi.fn().mockReturnValue('2026-06-11'),
}));

vi.mock('@/lib/period-lock', () => ({
  assertPeriodOpen: vi.fn().mockResolvedValue(undefined),
}));

// ── Fixture ───────────────────────────────────────────────────────────────────
const mockMaster = {
  id:          5,
  purchaseNo:  'PO-001',
  supplierId:  1,
  warehouse:   '麗格',
  purchaseDate:'2026-06-01',
  totalAmount: 50000,
  paymentTerms:'月結',
  status:      '待入庫',
};

vi.mock('@/lib/prisma', () => ({
  default: {
    purchaseDetail: { findFirst: detailFindFirst },
    $transaction: vi.fn().mockImplementation(fn => fn({
      purchaseDetail:  { update: detailUpdate, findMany: detailFindMany },
      purchaseMaster:  { update: masterUpdate },
      paymentOrder:    { findFirst: poFindFirst, create: poCreate },
      supplier:        { findUnique: vi.fn().mockResolvedValue({ name: '測試廠商' }) },
    })),
  },
}));

// ── Import under test ─────────────────────────────────────────────────────────
import { PATCH } from '@/app/api/purchasing/[id]/route.js';

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeRequest(body) {
  return new Request('http://localhost/api/purchasing/5', {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
}

const mockDetail = {
  id: 10,
  purchaseMaster: mockMaster,
  product: { name: '測試商品' },
};

const updatedDetail = { id: 10, status: '已入庫', inventoryWarehouse: '麗格', product: { name: '測試商品' } };

beforeEach(() => {
  vi.clearAllMocks();
  detailFindFirst.mockResolvedValue(mockDetail);
  detailUpdate.mockResolvedValue(updatedDetail);
  poFindFirst.mockResolvedValue(null);
  poCreate.mockResolvedValue({ id: 1, orderNo: 'PAY-20260611-001', status: '草稿' });
  masterUpdate.mockResolvedValue({ ...mockMaster, status: '已入庫' });
});

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('PATCH /api/purchasing/[id] — 入庫：最後一筆品項', () => {
  beforeEach(() => {
    // 所有明細都已入庫
    detailFindMany.mockResolvedValue([{ status: '已入庫' }]);
  });

  it('→ 200', async () => {
    const res = await PATCH(makeRequest({ detailId: 10, status: '已入庫' }), { params: { id: '5' } });
    expect(res.status).toBe(200);
  });

  it('→ purchaseMaster.status 更新為已入庫', async () => {
    await PATCH(makeRequest({ detailId: 10, status: '已入庫' }), { params: { id: '5' } });
    expect(masterUpdate).toHaveBeenCalledOnce();
    expect(masterUpdate.mock.calls[0][0].data.status).toBe('已入庫');
  });

  it('→ 自動建立草稿付款單', async () => {
    await PATCH(makeRequest({ detailId: 10, status: '已入庫' }), { params: { id: '5' } });
    expect(poCreate).toHaveBeenCalledOnce();
    const created = poCreate.mock.calls[0][0].data;
    expect(created.status).toBe('草稿');
    expect(created.sourceType).toBe('Purchase');
    expect(created.sourceRecordId).toBe(5);
  });

  it('→ 已存在付款單時不重複建立', async () => {
    poFindFirst.mockResolvedValueOnce({ id: 99 });
    await PATCH(makeRequest({ detailId: 10, status: '已入庫' }), { params: { id: '5' } });
    expect(poCreate).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/purchasing/[id] — 入庫：尚有其他待入庫品項', () => {
  beforeEach(() => {
    // 還有一筆待入庫
    detailFindMany.mockResolvedValue([{ status: '已入庫' }, { status: '待入庫' }]);
  });

  it('→ 不更新主單狀態', async () => {
    await PATCH(makeRequest({ detailId: 10, status: '已入庫' }), { params: { id: '5' } });
    expect(masterUpdate).not.toHaveBeenCalled();
  });

  it('→ 不建立付款單', async () => {
    await PATCH(makeRequest({ detailId: 10, status: '已入庫' }), { params: { id: '5' } });
    expect(poCreate).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/purchasing/[id] — 驗證', () => {
  it('缺少 detailId → 400', async () => {
    const res = await PATCH(makeRequest({ status: '已入庫' }), { params: { id: '5' } });
    expect(res.status).toBe(400);
  });

  it('無效狀態值 → 400', async () => {
    const res = await PATCH(makeRequest({ detailId: 10, status: '無效狀態' }), { params: { id: '5' } });
    expect(res.status).toBe(400);
  });

  it('找不到明細 → 404', async () => {
    detailFindFirst.mockResolvedValueOnce(null);
    const res = await PATCH(makeRequest({ detailId: 99, status: '已入庫' }), { params: { id: '5' } });
    expect(res.status).toBe(404);
  });
});
