import { describe, it, expect } from 'vitest';
import { calcBalanceDelta } from '@/lib/calc-balance-delta.js';

// ── 基本型別 ───────────────────────────────────────────────────────────────────
describe('calcBalanceDelta — 基本型別', () => {
  it('空陣列 → 0', () => {
    expect(calcBalanceDelta([])).toBe(0);
  });

  it('收入 → 正數', () => {
    expect(calcBalanceDelta([{ type: '收入', amount: 1000 }])).toBe(1000);
  });

  it('移轉入 → 正數（與收入相同方向）', () => {
    expect(calcBalanceDelta([{ type: '移轉入', amount: 500 }])).toBe(500);
  });

  it('支出 → 負數', () => {
    expect(calcBalanceDelta([{ type: '支出', amount: 300 }])).toBe(-300);
  });

  it('移轉 → 負數（與支出相同方向）', () => {
    expect(calcBalanceDelta([{ type: '移轉', amount: 200 }])).toBe(-200);
  });

  it('未知型別 → 貢獻 0，不影響其他', () => {
    const txs = [
      { type: '收入',   amount: 1000 },
      { type: '未知型別', amount: 9999 },
    ];
    expect(calcBalanceDelta(txs)).toBe(1000);
  });
});

// ── 費用（hasFee）─────────────────────────────────────────────────────────────
describe('calcBalanceDelta — 費用路徑', () => {
  it('支出 + hasFee=true → 從餘額扣 amount + fee', () => {
    const tx = { type: '支出', amount: 1000, fee: 50, hasFee: true };
    expect(calcBalanceDelta([tx])).toBe(-1050);
  });

  it('移轉 + hasFee=true → 從餘額扣 amount + fee', () => {
    const tx = { type: '移轉', amount: 2000, fee: 100, hasFee: true };
    expect(calcBalanceDelta([tx])).toBe(-2100);
  });

  it('支出 + hasFee=false → 不扣 fee（即使 fee 有值）', () => {
    const tx = { type: '支出', amount: 1000, fee: 50, hasFee: false };
    expect(calcBalanceDelta([tx])).toBe(-1000);
  });

  it('支出 + hasFee 未定義 → 不扣 fee', () => {
    const tx = { type: '支出', amount: 1000, fee: 50 };
    expect(calcBalanceDelta([tx])).toBe(-1000);
  });

  it('收入 + hasFee=true → fee 對收入方向無效', () => {
    const tx = { type: '收入', amount: 1000, fee: 50, hasFee: true };
    expect(calcBalanceDelta([tx])).toBe(1000);
  });

  it('fee 為 null → 視為 0', () => {
    const tx = { type: '支出', amount: 500, fee: null, hasFee: true };
    expect(calcBalanceDelta([tx])).toBe(-500);
  });
});

// ── 浮點數精度（分位整數算法驗證）────────────────────────────────────────────
describe('calcBalanceDelta — 浮點數精度', () => {
  it('0.1 × 3 筆收入 = 0.3（無浮點誤差）', () => {
    const txs = [
      { type: '收入', amount: 0.1 },
      { type: '收入', amount: 0.1 },
      { type: '收入', amount: 0.1 },
    ];
    expect(calcBalanceDelta(txs)).toBe(0.3);
  });

  it('1.005 支出 + fee 0.005 = -1.01（正確四捨五入）', () => {
    const tx = { type: '支出', amount: 1.005, fee: 0.005, hasFee: true };
    expect(calcBalanceDelta([tx])).toBe(-1.01);
  });

  it('大量小額交易不累積誤差', () => {
    const txs = Array.from({ length: 100 }, () => ({ type: '收入', amount: 0.01 }));
    expect(calcBalanceDelta(txs)).toBe(1);
  });
});

// ── 混合情境 ──────────────────────────────────────────────────────────────────
describe('calcBalanceDelta — 混合情境', () => {
  it('收入 + 支出 + 費用 → 正確合計', () => {
    const txs = [
      { type: '收入', amount: 5000 },
      { type: '支出', amount: 2000 },
      { type: '支出', amount: 500, fee: 20, hasFee: true },
    ];
    // 5000 - 2000 - 520 = 2480
    expect(calcBalanceDelta(txs)).toBe(2480);
  });

  it('amount 為字串型別也能正確計算', () => {
    const txs = [
      { type: '收入', amount: '1000' },
      { type: '支出', amount: '300' },
    ];
    expect(calcBalanceDelta(txs)).toBe(700);
  });

  it('amount 為 0 → 不影響結果', () => {
    const txs = [
      { type: '收入', amount: 100 },
      { type: '支出', amount: 0 },
    ];
    expect(calcBalanceDelta(txs)).toBe(100);
  });
});
