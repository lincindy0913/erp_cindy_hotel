import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@/lib/api-auth', () => ({
  requirePermission: vi.fn().mockResolvedValue({ ok: true, session: { user: {} } }),
}));

vi.mock('@/lib/calc-balance-delta', () => ({
  calcBalanceDelta: vi.fn().mockResolvedValue(null),
}));

// Prisma: default all counts to 0 (everything done)
vi.mock('@/lib/prisma', () => ({
  default: {
    purchaseMaster:          { count: vi.fn().mockResolvedValue(0) },
    salesMaster:             { count: vi.fn().mockResolvedValue(0) },
    paymentOrder:            { count: vi.fn().mockResolvedValue(0) },
    cashTransaction:         { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]) },
    check:                   { count: vi.fn().mockResolvedValue(0) },
    bankReconciliation:      { count: vi.fn().mockResolvedValue(0) },
    monthEndStatus:          { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
    bnbSyncFailure:          { count: vi.fn().mockResolvedValue(0) },
    cashAccount:             { findMany: vi.fn().mockResolvedValue([]) },
    commonExpenseRecord:     { count: vi.fn().mockResolvedValue(0) },
    pmsIncomeRecord:         { count: vi.fn().mockResolvedValue(0) },
    vatFilingPeriod:         { findFirst: vi.fn().mockResolvedValue(null) },
    warehouse:               { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

import prisma from '@/lib/prisma';
import { GET } from '@/app/api/month-end/checklist/route.js';

function makeRequest(params = {}) {
  const url = new URL('http://localhost/api/month-end/checklist');
  const merged = { year: '2026', month: '5', ...params };
  Object.entries(merged).forEach(([k, v]) => url.searchParams.set(k, v));
  return new Request(url.toString());
}

beforeEach(() => vi.clearAllMocks());

describe('GET /api/month-end/checklist — 基本結構', () => {
  it('缺少年月 → 400', async () => {
    const req = new Request('http://localhost/api/month-end/checklist');
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it('月份超出範圍 → 400', async () => {
    const res = await GET(makeRequest({ month: '13' }));
    expect(res.status).toBe(400);
  });

  it('正常請求 → 200 含 items 陣列', async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('year', 2026);
    expect(body).toHaveProperty('month', 5);
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBeGreaterThan(0);
  });

  it('全部完成時 doneCount 等於 items 數量', async () => {
    const res = await GET(makeRequest());
    const body = await res.json();
    // All counts are 0 → all items should be done
    const doneItems = body.items.filter(i => i.done);
    expect(body.doneCount).toBe(doneItems.length);
  });

  it('每個 item 都有 key, step, label, status', async () => {
    const res = await GET(makeRequest());
    const { items } = await res.json();
    for (const item of items) {
      expect(item).toHaveProperty('key');
      expect(item).toHaveProperty('step');
      expect(item).toHaveProperty('label');
      expect(item).toHaveProperty('status');
    }
  });
});

describe('GET /api/month-end/checklist — 個別項目邏輯', () => {
  it('有待入庫進貨 → pending_purchase.done=false, status=warning', async () => {
    prisma.purchaseMaster.count.mockResolvedValueOnce(3);
    const res = await GET(makeRequest());
    const { items } = await res.json();
    const item = items.find(i => i.key === 'pending_purchase');
    expect(item.done).toBe(false);
    expect(item.status).toBe('warning');
    expect(item.count).toBe(3);
  });

  it('有待出納付款單 → pending_cashier.done=false', async () => {
    prisma.paymentOrder.count.mockResolvedValueOnce(2);
    const res = await GET(makeRequest());
    const { items } = await res.json();
    const item = items.find(i => i.key === 'pending_cashier');
    expect(item?.done).toBe(false);
    expect(item?.count).toBe(2);
  });

  it('有民宿同步失敗 → bnb_sync_failure.done=false', async () => {
    prisma.bnbSyncFailure.count.mockResolvedValueOnce(5);
    const res = await GET(makeRequest());
    const { items } = await res.json();
    const item = items.find(i => i.key === 'bnb_sync_failure');
    expect(item?.done).toBe(false);
    expect(item?.count).toBe(5);
  });

  it('有草稿付款單 → draft_payment_orders 標記警告', async () => {
    // paymentOrder.count is called multiple times; mock specific return for draft check
    prisma.paymentOrder.count
      .mockResolvedValueOnce(0)   // pending_cashier (step 3)
      .mockResolvedValueOnce(4);  // draft_payment_orders (step 13)
    const res = await GET(makeRequest());
    const { items } = await res.json();
    const item = items.find(i => i.key === 'draft_payment_orders');
    expect(item?.done).toBe(false);
    expect(item?.count).toBe(4);
  });

  it('warningCount 正確累計', async () => {
    prisma.purchaseMaster.count.mockResolvedValueOnce(2); // warning
    prisma.paymentOrder.count.mockResolvedValueOnce(1);   // warning
    const res = await GET(makeRequest());
    const { warningCount } = await res.json();
    expect(warningCount).toBeGreaterThanOrEqual(2);
  });
});
