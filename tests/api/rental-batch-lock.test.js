import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@/lib/api-auth', () => ({
  requirePermission: vi.fn().mockResolvedValue({ ok: true, session: { user: { name: 'tester', email: 'test@example.com' } } }),
}));

vi.mock('@/lib/audit', () => ({
  auditFromSession: vi.fn().mockResolvedValue(undefined),
  AUDIT_ACTIONS: { RENTAL_INCOME_UPDATE: 'RENTAL_INCOME_UPDATE' },
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    rentalIncome: { updateMany: vi.fn() },
  },
}));

import prisma from '@/lib/prisma';
import { PATCH } from '@/app/api/rentals/income/batch-lock/route.js';

function makeRequest(body) {
  return new Request('http://localhost/api/rentals/income/batch-lock', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  prisma.rentalIncome.updateMany.mockResolvedValue({ count: 3 });
});

describe('PATCH /api/rentals/income/batch-lock', () => {
  it('缺少 ids → 400', async () => {
    const res = await PATCH(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it('ids 為空陣列 → 400', async () => {
    const res = await PATCH(makeRequest({ ids: [] }));
    expect(res.status).toBe(400);
  });

  it('批次鎖帳 → updateMany 傳入 isLocked: true，回傳 locked count', async () => {
    const res = await PATCH(makeRequest({ ids: [1, 2, 3], lock: true }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.locked).toBe(3);
    expect(prisma.rentalIncome.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: [1, 2, 3] }, isLocked: false }),
        data: expect.objectContaining({ isLocked: true }),
      })
    );
  });

  it('批次解鎖 (lock: false) → updateMany 傳入 isLocked: false', async () => {
    prisma.rentalIncome.updateMany.mockResolvedValue({ count: 2 });
    const res = await PATCH(makeRequest({ ids: [1, 2], lock: false }));
    expect(res.status).toBe(200);
    expect(prisma.rentalIncome.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isLocked: true }),
        data: expect.objectContaining({ isLocked: false, lockedAt: null, lockedBy: null }),
      })
    );
  });

  it('預設 lock = true（未傳 lock 參數）', async () => {
    const res = await PATCH(makeRequest({ ids: [5] }));
    expect(res.status).toBe(200);
    expect(prisma.rentalIncome.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isLocked: true }),
      })
    );
  });
});
