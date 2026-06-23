import { vi, describe, it, expect, beforeEach } from 'vitest';
import { recalcBalance } from '@/lib/recalc-balance.js';

// ── Mock DB helper ─────────────────────────────────────────────────────────────
function makeDb({ account = null, transactions = [] } = {}) {
  return {
    cashAccount: {
      findUnique: vi.fn().mockResolvedValue(account),
      update:     vi.fn().mockResolvedValue(account),
    },
    cashTransaction: {
      findMany: vi.fn().mockResolvedValue(transactions),
    },
  };
}

const BASE_ACCOUNT = { id: 1, name: '測試帳戶', openingBalance: 10000, currentBalance: 10000 };

beforeEach(() => vi.clearAllMocks());

// ── 帳戶不存在 ─────────────────────────────────────────────────────────────────
describe('recalcBalance — 帳戶不存在', () => {
  it('找不到帳戶 → 回傳 null，不更新 DB', async () => {
    const db = makeDb({ account: null });
    const result = await recalcBalance(db, 999);
    expect(result).toBeNull();
    expect(db.cashAccount.update).not.toHaveBeenCalled();
  });
});

// ── 餘額計算 ──────────────────────────────────────────────────────────────────
describe('recalcBalance — 餘額計算', () => {
  it('無交易 → 新餘額 = 開帳餘額', async () => {
    const db = makeDb({ account: BASE_ACCOUNT, transactions: [] });
    const result = await recalcBalance(db, 1);
    expect(result.newBalance).toBe(10000);
    expect(result.transactionCount).toBe(0);
  });

  it('有收入 → 新餘額 = 開帳餘額 + 收入', async () => {
    const db = makeDb({
      account: BASE_ACCOUNT,
      transactions: [{ type: '收入', amount: 5000, fee: 0, hasFee: false }],
    });
    const result = await recalcBalance(db, 1);
    expect(result.newBalance).toBe(15000);
  });

  it('有支出（含費用）→ 新餘額 = 開帳餘額 - (amount + fee)', async () => {
    const db = makeDb({
      account: BASE_ACCOUNT,
      transactions: [{ type: '支出', amount: 3000, fee: 100, hasFee: true }],
    });
    const result = await recalcBalance(db, 1);
    expect(result.newBalance).toBe(6900); // 10000 - 3100
  });

  it('複合交易：收入 + 支出', async () => {
    const db = makeDb({
      account: { ...BASE_ACCOUNT, openingBalance: 0, currentBalance: 0 },
      transactions: [
        { type: '收入', amount: 10000, hasFee: false },
        { type: '支出', amount: 3000, hasFee: false },
        { type: '支出', amount: 500,  fee: 20, hasFee: true },
      ],
    });
    const result = await recalcBalance(db, 1);
    // 0 + 10000 - 3000 - 520 = 6480
    expect(result.newBalance).toBe(6480);
  });
});

// ── 回傳值結構 ────────────────────────────────────────────────────────────────
describe('recalcBalance — 回傳值結構', () => {
  it('回傳 { previousBalance, newBalance, transactionCount, drift }', async () => {
    const db = makeDb({
      account: { ...BASE_ACCOUNT, currentBalance: 9000 },
      transactions: [{ type: '收入', amount: 1000, hasFee: false }],
    });
    const result = await recalcBalance(db, 1);
    expect(result).toMatchObject({
      previousBalance:  9000,
      newBalance:       11000,
      transactionCount: 1,
    });
    expect(typeof result.drift).toBe('number');
  });

  it('drift 是 |previousBalance - newBalance| 的絕對值', async () => {
    const db = makeDb({
      account: { ...BASE_ACCOUNT, currentBalance: 5000 },
      transactions: [{ type: '收入', amount: 2000, hasFee: false }],
    });
    const result = await recalcBalance(db, 1);
    // newBalance = 10000 + 2000 = 12000, previousBalance = 5000, drift = 7000
    expect(result.drift).toBe(7000);
  });

  it('帳務正確時 drift = 0', async () => {
    const db = makeDb({
      account: { ...BASE_ACCOUNT, currentBalance: 12000, openingBalance: 10000 },
      transactions: [{ type: '收入', amount: 2000, hasFee: false }],
    });
    const result = await recalcBalance(db, 1);
    expect(result.drift).toBe(0);
  });
});

// ── DB 寫入 ──────────────────────────────────────────────────────────────────
describe('recalcBalance — DB 寫入', () => {
  it('以計算後的餘額呼叫 cashAccount.update', async () => {
    const db = makeDb({
      account: BASE_ACCOUNT,
      transactions: [{ type: '支出', amount: 1000, hasFee: false }],
    });
    await recalcBalance(db, 1);
    expect(db.cashAccount.update).toHaveBeenCalledOnce();
    const updateCall = db.cashAccount.update.mock.calls[0][0];
    expect(updateCall.where.id).toBe(1);
    expect(updateCall.data.currentBalance).toBe(9000); // 10000 - 1000
  });
});
