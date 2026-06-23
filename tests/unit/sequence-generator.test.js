import { vi, describe, it, expect, beforeEach } from 'vitest';
// CJS 模組透過 vite interop — named exports 可直接解構
import { nextSequence } from '@/lib/sequence-generator.js';

// ── 測試用 tx factory ──────────────────────────────────────────────────────────
function makeTx({ rawRows = [], rawThrows = false, findManyRows = [] } = {}) {
  return {
    $queryRawUnsafe: rawThrows
      ? vi.fn().mockRejectedValue(new Error('DB FOR UPDATE 不支援'))
      : vi.fn().mockResolvedValue(rawRows),
    // model accessor (用於 fallback 路徑)
    paymentOrder:     { findMany: vi.fn().mockResolvedValue(findManyRows) },
    cashTransaction:  { findMany: vi.fn().mockResolvedValue(findManyRows) },
    cashierExecution: { findMany: vi.fn().mockResolvedValue(findManyRows) },
  };
}

beforeEach(() => vi.clearAllMocks());

// ── 白名單驗證（SQL Injection 防護）──────────────────────────────────────────
describe('nextSequence — 白名單驗證', () => {
  it('不允許的表名 → 立即拋錯', async () => {
    const tx = makeTx();
    await expect(nextSequence(tx, 'users', 'orderNo', 'PAY-'))
      .rejects.toThrow('不允許的表名');
    expect(tx.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it('不允許的欄位名 → 立即拋錯', async () => {
    const tx = makeTx();
    await expect(nextSequence(tx, 'paymentOrder', 'password', 'PAY-'))
      .rejects.toThrow('不允許的欄位名');
    expect(tx.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it('合法表名 + 合法欄位名 → 不拋白名單錯誤', async () => {
    const tx = makeTx({ rawRows: [] });
    await expect(nextSequence(tx, 'paymentOrder', 'orderNo', 'PAY-TEST-'))
      .resolves.toBeDefined();
  });
});

// ── 主路徑（$queryRawUnsafe 成功）────────────────────────────────────────────
describe('nextSequence — 主路徑（FOR UPDATE 成功）', () => {
  it('無現有記錄 → prefix + 0001', async () => {
    const tx = makeTx({ rawRows: [] });
    const result = await nextSequence(tx, 'paymentOrder', 'orderNo', 'PAY-20260612-');
    expect(result).toBe('PAY-20260612-0001');
  });

  it('有現有記錄 → max + 1，補零 4 位', async () => {
    // $queryRawUnsafe 回傳 snake_case 欄位（order_no）
    const tx = makeTx({
      rawRows: [
        { order_no: 'PAY-20260612-0003' },
        { order_no: 'PAY-20260612-0010' },
        { order_no: 'PAY-20260612-0001' },
      ],
    });
    const result = await nextSequence(tx, 'paymentOrder', 'orderNo', 'PAY-20260612-');
    expect(result).toBe('PAY-20260612-0011');
  });

  it('自訂 padWidth=6 → 補零 6 位', async () => {
    const tx = makeTx({ rawRows: [] });
    const result = await nextSequence(tx, 'paymentOrder', 'orderNo', 'PAY-', 6);
    expect(result).toBe('PAY-000001');
  });

  it('跨日日期前綴不會干擾昨日序號', async () => {
    // 昨日記錄 prefix 不同，不應被計入
    const tx = makeTx({
      rawRows: [], // 今日 prefix 無記錄（LIKE 只匹配今日 prefix）
    });
    const result = await nextSequence(tx, 'paymentOrder', 'orderNo', 'PAY-20260612-');
    expect(result).toBe('PAY-20260612-0001');
  });
});

// ── fallback 路徑（$queryRawUnsafe 失敗，改用 Prisma findMany）────────────────
describe('nextSequence — fallback 路徑', () => {
  it('$queryRawUnsafe 拋錯 → 改用 findMany，無記錄 → 0001', async () => {
    const tx = makeTx({ rawThrows: true, findManyRows: [] });
    const result = await nextSequence(tx, 'paymentOrder', 'orderNo', 'PAY-20260612-');
    expect(result).toBe('PAY-20260612-0001');
    expect(tx.paymentOrder.findMany).toHaveBeenCalledOnce();
  });

  it('fallback：有現有記錄 → max + 1', async () => {
    const tx = makeTx({
      rawThrows: true,
      findManyRows: [
        { orderNo: 'PAY-20260612-0005' },
        { orderNo: 'PAY-20260612-0002' },
      ],
    });
    const result = await nextSequence(tx, 'paymentOrder', 'orderNo', 'PAY-20260612-');
    expect(result).toBe('PAY-20260612-0006');
  });

  it('fallback：camelCase 欄位名也能正確讀取序號', async () => {
    const tx = makeTx({
      rawThrows: true,
      findManyRows: [{ orderNo: 'PAY-TEST-0099' }],
    });
    const result = await nextSequence(tx, 'paymentOrder', 'orderNo', 'PAY-TEST-');
    expect(result).toBe('PAY-TEST-0100');
  });
});

// ── 不同模型/欄位組合 ─────────────────────────────────────────────────────────
describe('nextSequence — 不同模型', () => {
  it('cashierExecution / executionNo', async () => {
    const tx = makeTx({ rawRows: [] });
    const result = await nextSequence(tx, 'cashierExecution', 'executionNo', 'CSH-20260612-');
    expect(result).toBe('CSH-20260612-0001');
  });

  it('cashTransaction / transactionNo', async () => {
    const tx = makeTx({ rawRows: [{ transaction_no: 'CF-20260612-0042' }] });
    const result = await nextSequence(tx, 'cashTransaction', 'transactionNo', 'CF-20260612-');
    expect(result).toBe('CF-20260612-0043');
  });
});
