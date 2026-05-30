import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  default: {
    bnbMonthlyReport: { findUnique: vi.fn() },
  },
}));

import prisma from '@/lib/prisma';
import { assertBnbMonthOpen, getBnbLockStatus } from '@/lib/bnb-lock.js';

describe('getBnbLockStatus', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reportMonth 為空 → 直接回 null，不查 DB', async () => {
    const result = await getBnbLockStatus(null, '民宿');
    expect(result).toBeNull();
    expect(prisma.bnbMonthlyReport.findUnique).not.toHaveBeenCalled();
  });

  it('找不到月報 → 回 null', async () => {
    prisma.bnbMonthlyReport.findUnique.mockResolvedValue(null);
    expect(await getBnbLockStatus('2026-03', '民宿')).toBeNull();
  });

  it('月報存在但 lockedAt=null → 回 null', async () => {
    prisma.bnbMonthlyReport.findUnique.mockResolvedValue({ lockedAt: null, lockedBy: null });
    expect(await getBnbLockStatus('2026-03', '民宿')).toBeNull();
  });

  it('已鎖帳 → 回 { lockedAt, lockedBy }', async () => {
    const lock = { lockedAt: new Date('2026-03-31'), lockedBy: 'admin' };
    prisma.bnbMonthlyReport.findUnique.mockResolvedValue(lock);
    expect(await getBnbLockStatus('2026-03', '民宿')).toEqual(lock);
  });

  it('warehouse 預設 fallback 為「民宿」', async () => {
    prisma.bnbMonthlyReport.findUnique.mockResolvedValue(null);
    await getBnbLockStatus('2026-03', undefined);
    expect(prisma.bnbMonthlyReport.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { reportMonth_warehouse: { reportMonth: '2026-03', warehouse: '民宿' } },
      })
    );
  });
});

describe('assertBnbMonthOpen', () => {
  beforeEach(() => vi.clearAllMocks());

  it('未鎖帳 → resolve undefined', async () => {
    prisma.bnbMonthlyReport.findUnique.mockResolvedValue(null);
    await expect(assertBnbMonthOpen('2026-03', '民宿')).resolves.toBeUndefined();
  });

  it('已鎖帳 → throw，message 含 BNB_MONTH_LOCKED', async () => {
    prisma.bnbMonthlyReport.findUnique.mockResolvedValue(
      { lockedAt: new Date(), lockedBy: 'admin' }
    );
    await expect(assertBnbMonthOpen('2026-03', '民宿')).rejects.toMatchObject({
      message: expect.stringContaining('BNB_MONTH_LOCKED'),
      statusCode: 423,
    });
  });

  it('已鎖帳 → error message 含館別名稱', async () => {
    prisma.bnbMonthlyReport.findUnique.mockResolvedValue(
      { lockedAt: new Date(), lockedBy: 'admin' }
    );
    await expect(assertBnbMonthOpen('2026-03', '花蓮館')).rejects.toThrow('花蓮館');
  });

  it('reportMonth 為空 → resolve undefined（早期返回，不查 DB）', async () => {
    await expect(assertBnbMonthOpen(null, '民宿')).resolves.toBeUndefined();
    expect(prisma.bnbMonthlyReport.findUnique).not.toHaveBeenCalled();
  });

  it('lockedAt=null → 不 throw', async () => {
    prisma.bnbMonthlyReport.findUnique.mockResolvedValue({ lockedAt: null });
    await expect(assertBnbMonthOpen('2026-03', '民宿')).resolves.toBeUndefined();
  });
});
