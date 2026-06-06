import { vi, describe, it, expect, beforeEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────
vi.mock('@/lib/prisma', () => ({
  default: {
    bnbBookingRecord: {
      findUnique: vi.fn(),
      update:     vi.fn(),
    },
    bnbBossWithdraw:    { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
    cashAccount:        { findFirst: vi.fn() },
    cashCategory:       { findFirst: vi.fn() },
    cashTransaction:    { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
  },
}));

vi.mock('@/lib/bnb-lock', () => ({
  assertBnbMonthOpen: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/sequence-generator', () => ({
  nextCashTransactionNo: vi.fn().mockResolvedValue('CT-2026-0001'),
}));

import prisma from '@/lib/prisma';
import { syncBnbPaymentTx } from '@/lib/syncBnbPaymentTx';

const BASE_BOOKING = {
  importMonth: '2026-05',
  warehouse: '麗格',
  guestName: '陳大明',
  checkInDate: '2026-05-10',
  checkOutDate: '2026-05-12',
  cashDestination: null,
  payCash: 0,
  bossWithdrawNote: null,
  depositDate: null, payDeposit: 0, depositCashTxId: null,
  transferDate: null, payTransfer: 0, transferCashTxId: null,
  cashDepositDate: null, cashCashTxId: null,
  cardSettlementDate: null, payCard: 0, cardFee: 0, cardCashTxId: null,
};

const ACCOUNT = { id: 10 };
const CATEGORY = { id: 99 };

beforeEach(() => {
  vi.clearAllMocks();
  prisma.bnbBookingRecord.findUnique.mockResolvedValue(BASE_BOOKING);
  prisma.cashAccount.findFirst.mockResolvedValue(ACCOUNT);
  prisma.cashCategory.findFirst.mockResolvedValue(CATEGORY);
  prisma.cashTransaction.findFirst.mockResolvedValue(null); // no existing tx
  prisma.cashTransaction.create.mockResolvedValue({ id: 1 });
  prisma.bnbBookingRecord.update.mockResolvedValue({});
  prisma.bnbBossWithdraw.findFirst.mockResolvedValue(null);
  prisma.bnbBossWithdraw.deleteMany.mockResolvedValue({ count: 0 });
});

describe('syncBnbPaymentTx', () => {
  it('找不到 booking → 直接回傳空物件，不查帳戶', async () => {
    prisma.bnbBookingRecord.findUnique.mockResolvedValue(null);
    const result = await syncBnbPaymentTx(999);
    expect(result).toEqual({});
    expect(prisma.cashAccount.findFirst).not.toHaveBeenCalled();
  });

  it('找不到銀行帳戶 → throw（觸發 BnbSyncFailure 機制）', async () => {
    prisma.cashAccount.findFirst.mockResolvedValue(null);
    await expect(syncBnbPaymentTx(1)).rejects.toThrow('銀行帳戶');
  });

  it('訂金匯款有日期且金額 > 0 → 建立 bnb_deposit CashTransaction', async () => {
    prisma.bnbBookingRecord.findUnique.mockResolvedValue({
      ...BASE_BOOKING,
      depositDate: '2026-05-01', payDeposit: 3000, depositCashTxId: null,
    });

    const result = await syncBnbPaymentTx(1);

    expect(prisma.cashTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sourceType: 'bnb_deposit', amount: 3000 }),
      })
    );
    expect(result.depositCashTxId).toBe(1);
  });

  it('當天匯款存在時建立 bnb_transfer；清空時刪除舊 tx', async () => {
    // Scenario: booking currently has a transfer tx, now transfer is cleared
    prisma.bnbBookingRecord.findUnique.mockResolvedValue({
      ...BASE_BOOKING,
      transferDate: null, payTransfer: 0, transferCashTxId: 55,
    });

    const result = await syncBnbPaymentTx(1);

    expect(prisma.cashTransaction.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ sourceType: 'bnb_transfer' }) })
    );
    expect(result.transferCashTxId).toBeNull();
  });

  it('刷卡金額存在且有入帳日 → 建立 bnb_card，金額為 payCard − cardFee', async () => {
    prisma.bnbBookingRecord.findUnique.mockResolvedValue({
      ...BASE_BOOKING,
      cardSettlementDate: '2026-05-15', payCard: 5000, cardFee: 100, cardCashTxId: null,
    });

    await syncBnbPaymentTx(1);

    expect(prisma.cashTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sourceType: 'bnb_card', amount: 4900 }),
      })
    );
  });

  it('現金 cashDestination=存帳 且有存帳日 → 建立 bnb_cash', async () => {
    prisma.bnbBookingRecord.findUnique.mockResolvedValue({
      ...BASE_BOOKING,
      cashDestination: '存帳', cashDepositDate: '2026-05-12', payCash: 2000, cashCashTxId: null,
    });

    await syncBnbPaymentTx(1);

    expect(prisma.cashTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sourceType: 'bnb_cash', amount: 2000 }),
      })
    );
  });

  it('現金 cashDestination=老闆收取 → 建立 BnbBossWithdraw，不建 bnb_cash CashTransaction', async () => {
    prisma.bnbBookingRecord.findUnique.mockResolvedValue({
      ...BASE_BOOKING,
      cashDestination: '老闆收取', payCash: 1500,
    });
    prisma.bnbBossWithdraw.findFirst.mockResolvedValue(null);

    await syncBnbPaymentTx(1);

    expect(prisma.bnbBossWithdraw.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ amount: 1500 }) })
    );
    // bnb_cash CashTransaction should NOT be created
    const cashCalls = prisma.cashTransaction.create.mock.calls.filter(
      c => c[0]?.data?.sourceType === 'bnb_cash'
    );
    expect(cashCalls).toHaveLength(0);
  });

  it('既有 tx 金額/日期未變 → 不更新 CashTransaction', async () => {
    prisma.bnbBookingRecord.findUnique.mockResolvedValue({
      ...BASE_BOOKING,
      depositDate: '2026-05-01', payDeposit: 3000, depositCashTxId: 7,
    });
    prisma.cashTransaction.findFirst.mockResolvedValue({ id: 7, amount: 3000, transactionDate: '2026-05-01' });

    await syncBnbPaymentTx(1);

    expect(prisma.cashTransaction.update).not.toHaveBeenCalled();
    expect(prisma.cashTransaction.create).not.toHaveBeenCalled();
  });

  it('既有 tx 金額不同 → 更新 CashTransaction', async () => {
    prisma.bnbBookingRecord.findUnique.mockResolvedValue({
      ...BASE_BOOKING,
      depositDate: '2026-05-01', payDeposit: 5000, depositCashTxId: 7,
    });
    prisma.cashTransaction.findFirst.mockResolvedValue({ id: 7, amount: 3000, transactionDate: '2026-05-01' });

    await syncBnbPaymentTx(1);

    expect(prisma.cashTransaction.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 7 }, data: expect.objectContaining({ amount: 5000 }) })
    );
  });
});
