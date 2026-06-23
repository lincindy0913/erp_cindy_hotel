import { vi, describe, it, expect, beforeEach } from 'vitest';
import {
  getCategoryId,
  getCategoryIdByCode,
  invalidateCategoryCache,
} from '@/lib/cash-category-helper.js';

// ── Mock DB helper ─────────────────────────────────────────────────────────────
function makeDb(categories = []) {
  return {
    cashCategory: {
      findMany: vi.fn().mockResolvedValue(categories),
    },
  };
}

// 標準測試分類資料
const STANDARD_CATEGORIES = [
  { id: 10, systemCode: 'CASHIER_PAY' },
  { id: 20, systemCode: 'RENTAL_INCOME' },
  { id: 30, systemCode: 'LOAN_PRINCIPAL' },
  { id: 40, systemCode: 'FIXED_EXPENSE' },
  { id: 50, systemCode: 'MISC_INCOME' },
  { id: 60, systemCode: 'REVERSAL' },
];

// 每次測試前清快取，確保各測試彼此獨立
beforeEach(() => {
  vi.clearAllMocks();
  invalidateCategoryCache();
});

// ── 邊界情況 ──────────────────────────────────────────────────────────────────
describe('getCategoryId — 邊界情況', () => {
  it('sourceType = null → 直接回傳 null，不查 DB', async () => {
    const db = makeDb(STANDARD_CATEGORIES);
    const result = await getCategoryId(db, null);
    expect(result).toBeNull();
    expect(db.cashCategory.findMany).not.toHaveBeenCalled();
  });

  it('sourceType = "" → 直接回傳 null，不查 DB', async () => {
    const db = makeDb(STANDARD_CATEGORIES);
    const result = await getCategoryId(db, '');
    expect(result).toBeNull();
    expect(db.cashCategory.findMany).not.toHaveBeenCalled();
  });

  it('未知 sourceType → 回傳 null（不拋錯）', async () => {
    const db = makeDb(STANDARD_CATEGORIES);
    const result = await getCategoryId(db, 'totally_unknown_type');
    expect(result).toBeNull();
  });
});

// ── sourceType → categoryId 映射正確性 ────────────────────────────────────────
describe('getCategoryId — sourceType 映射', () => {
  it('cashier_payment → CASHIER_PAY → id 10', async () => {
    const db = makeDb(STANDARD_CATEGORIES);
    expect(await getCategoryId(db, 'cashier_payment')).toBe(10);
  });

  it('rental_income → RENTAL_INCOME → id 20', async () => {
    const db = makeDb(STANDARD_CATEGORIES);
    expect(await getCategoryId(db, 'rental_income')).toBe(20);
  });

  it('rental_utility_income → RENTAL_INCOME → id 20（多對一映射）', async () => {
    const db = makeDb(STANDARD_CATEGORIES);
    expect(await getCategoryId(db, 'rental_utility_income')).toBe(20);
  });

  it('loan_principal → LOAN_PRINCIPAL → id 30', async () => {
    const db = makeDb(STANDARD_CATEGORIES);
    expect(await getCategoryId(db, 'loan_principal')).toBe(30);
  });

  it('fixed_expense → FIXED_EXPENSE → id 40', async () => {
    const db = makeDb(STANDARD_CATEGORIES);
    expect(await getCategoryId(db, 'fixed_expense')).toBe(40);
  });

  it('purchase_allowance → MISC_INCOME → id 50', async () => {
    const db = makeDb(STANDARD_CATEGORIES);
    expect(await getCategoryId(db, 'purchase_allowance')).toBe(50);
  });

  it('reversal → REVERSAL → id 60', async () => {
    const db = makeDb(STANDARD_CATEGORIES);
    expect(await getCategoryId(db, 'reversal')).toBe(60);
  });

  it('systemCode 不在 DB 中 → 回傳 null（不拋錯）', async () => {
    const db = makeDb([]); // 空分類表
    const result = await getCategoryId(db, 'cashier_payment');
    expect(result).toBeNull();
  });
});

// ── 快取行為 ──────────────────────────────────────────────────────────────────
describe('getCategoryId — 快取', () => {
  it('第一次查詢後快取：後續不重複查 DB', async () => {
    const db = makeDb(STANDARD_CATEGORIES);
    await getCategoryId(db, 'cashier_payment');
    await getCategoryId(db, 'rental_income');
    await getCategoryId(db, 'reversal');
    // 三次查詢，但 DB 只被呼叫一次
    expect(db.cashCategory.findMany).toHaveBeenCalledOnce();
  });

  it('invalidateCategoryCache() 後重新查 DB', async () => {
    const db = makeDb(STANDARD_CATEGORIES);
    await getCategoryId(db, 'cashier_payment');
    invalidateCategoryCache();
    await getCategoryId(db, 'cashier_payment');
    expect(db.cashCategory.findMany).toHaveBeenCalledTimes(2);
  });

  it('快取過期（TTL 模擬）後重新查 DB', async () => {
    const db = makeDb(STANDARD_CATEGORIES);
    // 第一次填充快取
    await getCategoryId(db, 'cashier_payment');
    // 手動失效快取（模擬過期）
    invalidateCategoryCache();
    // 再次查詢，應重新載入
    const result = await getCategoryId(db, 'cashier_payment');
    expect(result).toBe(10);
    expect(db.cashCategory.findMany).toHaveBeenCalledTimes(2);
  });
});

// ── getCategoryIdByCode ───────────────────────────────────────────────────────
describe('getCategoryIdByCode — 直接用 systemCode 查詢', () => {
  it('null → 直接回傳 null', async () => {
    const db = makeDb(STANDARD_CATEGORIES);
    expect(await getCategoryIdByCode(db, null)).toBeNull();
    expect(db.cashCategory.findMany).not.toHaveBeenCalled();
  });

  it('CASHIER_PAY → id 10', async () => {
    const db = makeDb(STANDARD_CATEGORIES);
    expect(await getCategoryIdByCode(db, 'CASHIER_PAY')).toBe(10);
  });

  it('不存在的 systemCode → 回傳 null', async () => {
    const db = makeDb(STANDARD_CATEGORIES);
    expect(await getCategoryIdByCode(db, 'DOES_NOT_EXIST')).toBeNull();
  });

  it('與 getCategoryId 共享同一快取', async () => {
    const db = makeDb(STANDARD_CATEGORIES);
    // getCategoryId 先填快取
    await getCategoryId(db, 'cashier_payment');
    // getCategoryIdByCode 不應重查 DB
    await getCategoryIdByCode(db, 'RENTAL_INCOME');
    expect(db.cashCategory.findMany).toHaveBeenCalledOnce();
  });
});
