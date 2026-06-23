import { vi, describe, it, expect, beforeEach } from 'vitest';
import { assertPeriodOpen } from '@/lib/period-lock.js';

// ── Mock DB helper ─────────────────────────────────────────────────────────────
function makeDb({ warehouseLock = null, globalLock = null } = {}) {
  // getPeriodLockStatus calls findFirst twice (warehouse-specific, then global)
  const findFirst = vi.fn()
    .mockResolvedValueOnce(warehouseLock)   // warehouse-specific query
    .mockResolvedValueOnce(globalLock);     // global query
  return { monthEndStatus: { findFirst } };
}

const LOCKED_RECORD = { id: 1, status: '已結帳' };

beforeEach(() => vi.clearAllMocks());

// ── dateStr 解析 ───────────────────────────────────────────────────────────────
describe('assertPeriodOpen — dateStr 解析', () => {
  it('dateStr = null → 直接回傳，不查 DB', async () => {
    const db = makeDb();
    await expect(assertPeriodOpen(db, null)).resolves.toBeUndefined();
    expect(db.monthEndStatus.findFirst).not.toHaveBeenCalled();
  });

  it('dateStr = "" → 直接回傳，不查 DB', async () => {
    const db = makeDb();
    await expect(assertPeriodOpen(db, '')).resolves.toBeUndefined();
    expect(db.monthEndStatus.findFirst).not.toHaveBeenCalled();
  });

  it('YYYY-MM-DD 格式正確解析', async () => {
    const db = makeDb({ globalLock: null });
    await expect(assertPeriodOpen(db, '2026-06-11')).resolves.toBeUndefined();
    const call = db.monthEndStatus.findFirst.mock.calls.at(-1)[0];
    expect(call.where.year).toBe(2026);
    expect(call.where.month).toBe(6);
  });

  it('YYYYMMDD（8 碼）格式也能正確解析', async () => {
    const db = makeDb({ globalLock: null });
    await expect(assertPeriodOpen(db, '20260101')).resolves.toBeUndefined();
    const call = db.monthEndStatus.findFirst.mock.calls.at(-1)[0];
    expect(call.where.year).toBe(2026);
    expect(call.where.month).toBe(1);
  });
});

// ── 期間開放 ──────────────────────────────────────────────────────────────────
describe('assertPeriodOpen — 期間開放', () => {
  it('無任何鎖定記錄 → resolves 不拋錯', async () => {
    const db = makeDb({ warehouseLock: null, globalLock: null });
    await expect(assertPeriodOpen(db, '2026-06-11', '麗格')).resolves.toBeUndefined();
  });

  it('無館別、無全域鎖 → resolves', async () => {
    // When warehouse=null, only global query is made (one findFirst call)
    const findFirst = vi.fn().mockResolvedValueOnce(null);
    const db = { monthEndStatus: { findFirst } };
    await expect(assertPeriodOpen(db, '2026-06-11', null)).resolves.toBeUndefined();
  });
});

// ── 期間鎖定 ──────────────────────────────────────────────────────────────────
describe('assertPeriodOpen — 期間鎖定', () => {
  it('館別鎖優先：有館別鎖 → 拋出 PERIOD_LOCKED', async () => {
    const db = makeDb({ warehouseLock: LOCKED_RECORD, globalLock: null });
    await expect(assertPeriodOpen(db, '2026-06-11', '麗格'))
      .rejects.toThrow(/^PERIOD_LOCKED:/);
  });

  it('全域鎖：無館別鎖但有全域鎖 → 拋出 PERIOD_LOCKED', async () => {
    const db = makeDb({ warehouseLock: null, globalLock: LOCKED_RECORD });
    await expect(assertPeriodOpen(db, '2026-06-11', '麗格'))
      .rejects.toThrow(/^PERIOD_LOCKED:/);
  });

  it('錯誤訊息包含年月', async () => {
    // 無 warehouse → getPeriodLockStatus 只呼叫一次 findFirst（全域鎖）
    const findFirst = vi.fn().mockResolvedValueOnce(LOCKED_RECORD);
    const db = { monthEndStatus: { findFirst } };
    await expect(assertPeriodOpen(db, '2026-06-11'))
      .rejects.toThrow('2026年6月');
  });

  it('錯誤訊息包含館別名稱', async () => {
    const db = makeDb({ warehouseLock: LOCKED_RECORD });
    await expect(assertPeriodOpen(db, '2026-06-11', '麗格'))
      .rejects.toThrow('麗格');
  });

  it('「已鎖定」狀態也會阻擋', async () => {
    // 無 warehouse → 只查全域鎖（一次 findFirst）
    const findFirst = vi.fn().mockResolvedValueOnce({ id: 2, status: '已鎖定' });
    const db = { monthEndStatus: { findFirst } };
    await expect(assertPeriodOpen(db, '2026-06-11'))
      .rejects.toThrow(/^PERIOD_LOCKED:/);
  });

  it('館別鎖存在時不再查全域鎖（short-circuit）', async () => {
    const findFirst = vi.fn().mockResolvedValueOnce(LOCKED_RECORD); // warehouse hit
    const db = { monthEndStatus: { findFirst } };
    await expect(assertPeriodOpen(db, '2026-06-11', '麗格')).rejects.toThrow();
    expect(findFirst).toHaveBeenCalledOnce(); // only the warehouse query
  });
});
