import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@/lib/api-auth', () => ({
  requirePermission: vi.fn().mockResolvedValue({ ok: true, session: { user: { name: 'tester' } } }),
}));

vi.mock('@/lib/rental-year-lock', () => ({
  assertRentalYearOpen: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/audit', () => ({
  auditFromSession: vi.fn().mockResolvedValue(undefined),
  AUDIT_ACTIONS: { RENTAL_INCOME_CREATE: 'RENTAL_INCOME_CREATE' },
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    rentalContract: { findMany: vi.fn() },
    rentalIncome: { findUnique: vi.fn(), create: vi.fn() },
  },
}));

import prisma from '@/lib/prisma';
import { assertRentalYearOpen } from '@/lib/rental-year-lock';
import { POST } from '@/app/api/rentals/income/route.js';

function makeRequest(body) {
  return new Request('http://localhost/api/rentals/income', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const CONTRACT = {
  id: 1, propertyId: 10, tenantId: 5,
  monthlyRent: 15000, paymentDueDay: 5,
  startDate: '2025-01-01', endDate: '2026-12-31',
};

beforeEach(() => {
  vi.clearAllMocks();
  prisma.rentalContract.findMany.mockResolvedValue([CONTRACT]);
  prisma.rentalIncome.findUnique.mockResolvedValue(null); // no existing
  prisma.rentalIncome.create.mockResolvedValue({ id: 99 });
});

describe('POST /api/rentals/income — 批次產生月租', () => {
  it('缺少 year / month → 400', async () => {
    const res = await POST(makeRequest({ year: 2026 }));
    expect(res.status).toBe(400);
  });

  it('年度已鎖 → assertRentalYearOpen 拋錯', async () => {
    assertRentalYearOpen.mockRejectedValueOnce({ message: '2024 年已鎖定' });
    const res = await POST(makeRequest({ year: 2024, month: 1 }));
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('無生效合約 → created=0, skipped=0', async () => {
    prisma.rentalContract.findMany.mockResolvedValue([]);
    const res = await POST(makeRequest({ year: 2026, month: 5 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.created).toBe(0);
    expect(body.total).toBe(0);
  });

  it('正常建立 → created=1, skipped=0', async () => {
    const res = await POST(makeRequest({ year: 2026, month: 5 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.created).toBe(1);
    expect(body.skipped).toBe(0);
    expect(prisma.rentalIncome.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          contractId: 1, incomeYear: 2026, incomeMonth: 5,
          expectedAmount: 15000, status: 'pending',
        }),
      })
    );
  });

  it('已存在紀錄 → skipped=1, create 未呼叫', async () => {
    prisma.rentalIncome.findUnique.mockResolvedValue({ id: 10 }); // already exists
    const res = await POST(makeRequest({ year: 2026, month: 5 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.skipped).toBe(1);
    expect(body.created).toBe(0);
    expect(prisma.rentalIncome.create).not.toHaveBeenCalled();
  });

  it('2 月份 dueDay=31 → 實際為 28 (非閏年)', async () => {
    prisma.rentalContract.findMany.mockResolvedValue([{ ...CONTRACT, paymentDueDay: 31 }]);
    await POST(makeRequest({ year: 2025, month: 2 }));
    const call = prisma.rentalIncome.create.mock.calls[0][0];
    expect(call.data.dueDate).toBe('2025-02-28');
  });

  it('多合約 → 各自建立記錄', async () => {
    prisma.rentalContract.findMany.mockResolvedValue([CONTRACT, { ...CONTRACT, id: 2, propertyId: 20 }]);
    const res = await POST(makeRequest({ year: 2026, month: 6 }));
    const body = await res.json();
    expect(body.created).toBe(2);
    expect(prisma.rentalIncome.create).toHaveBeenCalledTimes(2);
  });
});
