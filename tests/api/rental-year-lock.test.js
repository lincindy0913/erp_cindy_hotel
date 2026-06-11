import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@/lib/api-auth', () => ({
  requirePermission: vi.fn().mockResolvedValue({
    ok: true,
    session: { user: { name: 'admin', email: 'admin@example.com' } },
  }),
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    rentalYearLock: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

import prisma from '@/lib/prisma';
import { GET, POST } from '@/app/api/rentals/year-locks/route.js';

function makeGetRequest() {
  return new Request('http://localhost/api/rentals/year-locks');
}
function makePostRequest(body) {
  return new Request('http://localhost/api/rentals/year-locks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => vi.clearAllMocks());

describe('GET /api/rentals/year-locks', () => {
  it('回傳鎖定年份清單', async () => {
    const locks = [{ year: 2025, lockedAt: new Date(), lockedBy: 'admin', note: null }];
    prisma.rentalYearLock.findMany.mockResolvedValue(locks);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].year).toBe(2025);
  });

  it('無鎖定 → 空陣列', async () => {
    prisma.rentalYearLock.findMany.mockResolvedValue([]);
    const res = await GET(makeGetRequest());
    const body = await res.json();
    expect(body).toEqual([]);
  });
});

describe('POST /api/rentals/year-locks', () => {
  it('缺少 year → 400', async () => {
    const res = await POST(makePostRequest({}));
    expect(res.status).toBe(400);
  });

  it('年份已鎖 → 409 CONFLICT', async () => {
    prisma.rentalYearLock.findUnique.mockResolvedValue({ year: 2025 });
    const res = await POST(makePostRequest({ year: 2025 }));
    expect(res.status).toBe(409);
  });

  it('成功鎖定年份 → 200 + 鎖定記錄', async () => {
    prisma.rentalYearLock.findUnique.mockResolvedValue(null);
    const created = { year: 2025, lockedAt: new Date(), lockedBy: 'admin', note: null };
    prisma.rentalYearLock.create.mockResolvedValue(created);
    const res = await POST(makePostRequest({ year: 2025, note: '已報稅' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.year).toBe(2025);
    expect(prisma.rentalYearLock.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ year: 2025 }) })
    );
  });
});
