import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@/lib/api-auth', () => ({
  requirePermission: vi.fn().mockResolvedValue({ ok: true, session: { user: {} } }),
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    cashAccount: { findMany: vi.fn() },
    bankReconciliation: { findMany: vi.fn() },
  },
}));

import prisma from '@/lib/prisma';
import { GET } from '@/app/api/reconciliation/dashboard/route.js';

function makeRequest(params = {}) {
  const url = new URL('http://localhost/api/reconciliation/dashboard');
  const merged = { year: '2026', month: '5', ...params };
  Object.entries(merged).forEach(([k, v]) => url.searchParams.set(k, v));
  return new Request(url.toString());
}

const ACCOUNT_A = { id: 1, name: '麗格帳戶', accountCode: '1112-01', warehouse: '麗格', currentBalance: 100000, type: '銀行存款', isActive: true };
const ACCOUNT_B = { id: 2, name: '金旭帳戶', accountCode: '1112-02', warehouse: '金旭', currentBalance: 50000,  type: '銀行存款', isActive: true };

beforeEach(() => {
  vi.clearAllMocks();
  prisma.bankReconciliation.findMany.mockResolvedValue([]);
});

describe('GET /api/reconciliation/dashboard — 帳戶清單', () => {
  it('無帳戶 → 空 items，所有計數為 0', async () => {
    prisma.cashAccount.findMany.mockResolvedValue([]);
    const body = await (await GET(makeRequest())).json();
    expect(body.items).toHaveLength(0);
    expect(body.summary.totalAccounts).toBe(0);
    expect(body.summary.completedCount).toBe(0);
    expect(body.summary.notStartedCount).toBe(0);
  });

  it('帳戶無對應對帳記錄 → status=not_started', async () => {
    prisma.cashAccount.findMany.mockResolvedValue([ACCOUNT_A]);
    const body = await (await GET(makeRequest())).json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].status).toBe('not_started');
    expect(body.items[0].difference).toBe(0);
    expect(body.items[0].reconciliationId).toBeNull();
  });

  it('帳戶有 draft 對帳 → status=draft', async () => {
    prisma.cashAccount.findMany.mockResolvedValue([ACCOUNT_A]);
    prisma.bankReconciliation.findMany.mockResolvedValue([
      { id: 10, accountId: 1, status: 'draft', difference: 500, statementYear: 2026, statementMonth: 5 },
    ]);
    const body = await (await GET(makeRequest())).json();
    expect(body.items[0].status).toBe('draft');
    expect(body.items[0].reconciliationId).toBe(10);
    expect(body.summary.inProgressCount).toBe(1);
  });

  it('帳戶有 confirmed 對帳且差異=0 → status=confirmed, hasDifferenceCount=0', async () => {
    prisma.cashAccount.findMany.mockResolvedValue([ACCOUNT_A]);
    prisma.bankReconciliation.findMany.mockResolvedValue([
      { id: 11, accountId: 1, status: 'confirmed', difference: 0, statementYear: 2026, statementMonth: 5 },
    ]);
    const body = await (await GET(makeRequest())).json();
    expect(body.items[0].status).toBe('confirmed');
    expect(body.summary.completedCount).toBe(1);
    expect(body.summary.hasDifferenceCount).toBe(0);
  });

  it('confirmed 且差異非零 → hasDifferenceCount=1', async () => {
    prisma.cashAccount.findMany.mockResolvedValue([ACCOUNT_A]);
    prisma.bankReconciliation.findMany.mockResolvedValue([
      { id: 12, accountId: 1, status: 'confirmed', difference: 300, statementYear: 2026, statementMonth: 5 },
    ]);
    const body = await (await GET(makeRequest())).json();
    expect(body.summary.hasDifferenceCount).toBe(1);
  });

  it('多帳戶混合狀態 → summary 分別計數', async () => {
    prisma.cashAccount.findMany.mockResolvedValue([ACCOUNT_A, ACCOUNT_B]);
    prisma.bankReconciliation.findMany.mockResolvedValue([
      { id: 13, accountId: 1, status: 'confirmed', difference: 0, statementYear: 2026, statementMonth: 5 },
      // ACCOUNT_B has no reconciliation → not_started
    ]);
    const body = await (await GET(makeRequest())).json();
    expect(body.summary.totalAccounts).toBe(2);
    expect(body.summary.completedCount).toBe(1);
    expect(body.summary.notStartedCount).toBe(1);
    expect(body.summary.inProgressCount).toBe(0);
  });

  it('items 包含 currentBalance 欄位', async () => {
    prisma.cashAccount.findMany.mockResolvedValue([ACCOUNT_A]);
    const body = await (await GET(makeRequest())).json();
    expect(body.items[0].currentBalance).toBe(100000);
    expect(body.items[0].accountName).toBe('麗格帳戶');
    expect(body.items[0].warehouse).toBe('麗格');
  });

  it('回傳 year / month 原樣', async () => {
    prisma.cashAccount.findMany.mockResolvedValue([]);
    const body = await (await GET(makeRequest({ year: '2025', month: '12' }))).json();
    expect(body.year).toBe(2025);
    expect(body.month).toBe(12);
  });
});
