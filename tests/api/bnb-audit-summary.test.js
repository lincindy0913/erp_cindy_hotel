import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@/lib/api-auth', () => ({
  requirePermission: vi.fn().mockResolvedValue({ ok: true, session: { user: {} } }),
}));

vi.mock('@/lib/localDate', () => ({
  todayStr: vi.fn().mockReturnValue('2026-06-01'),
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    bnbBookingRecord: {
      findMany: vi.fn(),
    },
  },
}));

import prisma from '@/lib/prisma';
import { GET } from '@/app/api/bnb/audit-summary/route.js';

function makeRequest(params = {}) {
  const url = new URL('http://localhost/api/bnb/audit-summary');
  Object.entries({ month: '2026-05', ...params }).forEach(([k, v]) => url.searchParams.set(k, v));
  return new Request(url.toString());
}

const BASE = {
  roomCharge: 5000, otherCharge: 0,
  payDeposit: 5000, payTransfer: 0, payCard: 0, payCash: 0, payVoucher: 0,
  cardFee: 0, paymentFilled: true, paymentLocked: false, isComplimentary: false,
  cardSettlementDate: null, status: '已退房', checkOutDate: '2026-05-15',
};

beforeEach(() => vi.clearAllMocks());

describe('GET /api/bnb/audit-summary — 聚合邏輯', () => {
  it('無記錄 → 所有數字為 0', async () => {
    prisma.bnbBookingRecord.findMany.mockResolvedValue([]);
    const res = await GET(makeRequest());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.totalCount).toBe(0);
    expect(body.revenue).toBe(0);
    expect(body.unfilled).toBe(0);
    expect(body.mismatch).toBe(0);
  });

  it('正常已填款記錄 → revenue 正確，unfilled / mismatch = 0', async () => {
    prisma.bnbBookingRecord.findMany.mockResolvedValue([{ ...BASE }]);
    const body = await (await GET(makeRequest())).json();
    expect(body.totalCount).toBe(1);
    expect(body.revenue).toBe(5000);
    expect(body.payDeposit).toBe(5000);
    expect(body.unfilled).toBe(0);
    expect(body.mismatch).toBe(0);
  });

  it('未填款 + 非招待 → unfilled=1', async () => {
    prisma.bnbBookingRecord.findMany.mockResolvedValue([
      { ...BASE, paymentFilled: false, payDeposit: 0 },
    ]);
    const body = await (await GET(makeRequest())).json();
    expect(body.unfilled).toBe(1);
  });

  it('招待（isComplimentary）→ 不計入 unfilled', async () => {
    prisma.bnbBookingRecord.findMany.mockResolvedValue([
      { ...BASE, paymentFilled: false, isComplimentary: true, payDeposit: 0 },
    ]);
    const body = await (await GET(makeRequest())).json();
    expect(body.unfilled).toBe(0);
    expect(body.complimentary).toBe(1);
  });

  it('已退房 + 未填款 + checkOutDate < today → overdueUnpaid=1', async () => {
    prisma.bnbBookingRecord.findMany.mockResolvedValue([
      { ...BASE, paymentFilled: false, payDeposit: 0, status: '已退房', checkOutDate: '2026-05-01' },
    ]);
    const body = await (await GET(makeRequest())).json();
    expect(body.overdueUnpaid).toBe(1);
  });

  it('未退房（在住）→ overdueUnpaid 不增加', async () => {
    prisma.bnbBookingRecord.findMany.mockResolvedValue([
      { ...BASE, paymentFilled: false, payDeposit: 0, status: '住宿中', checkOutDate: '2026-05-31' },
    ]);
    const body = await (await GET(makeRequest())).json();
    expect(body.overdueUnpaid).toBe(0);
  });

  it('付款總額 ≠ 應收金額 (差 > 0.01) → mismatch=1', async () => {
    prisma.bnbBookingRecord.findMany.mockResolvedValue([
      { ...BASE, payDeposit: 4999, roomCharge: 5000, paymentFilled: true },
    ]);
    const body = await (await GET(makeRequest())).json();
    expect(body.mismatch).toBe(1);
  });

  it('付款差距 ≤ 0.01 → mismatch=0（浮點容差）', async () => {
    prisma.bnbBookingRecord.findMany.mockResolvedValue([
      { ...BASE, payDeposit: 5000.005, roomCharge: 5000, paymentFilled: true },
    ]);
    const body = await (await GET(makeRequest())).json();
    expect(body.mismatch).toBe(0);
  });

  it('刷卡但無入帳日 → cardDateMissing=1', async () => {
    prisma.bnbBookingRecord.findMany.mockResolvedValue([
      { ...BASE, payCard: 3000, cardSettlementDate: null },
    ]);
    const body = await (await GET(makeRequest())).json();
    expect(body.cardDateMissing).toBe(1);
  });

  it('刷卡且有入帳日 → cardDateMissing=0', async () => {
    prisma.bnbBookingRecord.findMany.mockResolvedValue([
      { ...BASE, payCard: 3000, cardSettlementDate: '2026-05-20' },
    ]);
    const body = await (await GET(makeRequest())).json();
    expect(body.cardDateMissing).toBe(0);
  });

  it('多筆記錄 → 各指標獨立累計', async () => {
    prisma.bnbBookingRecord.findMany.mockResolvedValue([
      { ...BASE },                                                               // 正常
      { ...BASE, paymentFilled: false, payDeposit: 0 },                         // unfilled
      { ...BASE, payCard: 2000, cardSettlementDate: null, payDeposit: 3000 },   // cardDateMissing + mismatch
    ]);
    const body = await (await GET(makeRequest())).json();
    expect(body.totalCount).toBe(3);
    expect(body.revenue).toBe(15000); // 3 × 5000
    expect(body.unfilled).toBe(1);
    expect(body.cardDateMissing).toBe(1);
  });
});

describe('GET /api/bnb/audit-summary — 參數驗證', () => {
  it('缺少 month → 400', async () => {
    const res = await GET(makeRequest({ month: undefined }));
    // overwrite: request without month
    const url = new URL('http://localhost/api/bnb/audit-summary');
    const res2 = await GET(new Request(url.toString()));
    expect(res2.status).toBe(400);
  });
});
