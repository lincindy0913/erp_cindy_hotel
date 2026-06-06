import { vi, describe, it, expect, beforeEach } from 'vitest';

// ── Auth mock ────────────────────────────────────────────────────────
vi.mock('@/lib/api-auth', () => ({
  requireAnyPermission: vi.fn().mockResolvedValue({
    ok: true,
    session: { user: { name: 'tester', email: 'test@example.com', id: '1' } },
  }),
}));

vi.mock('@/lib/bnb-lock', () => ({
  assertBnbMonthOpen: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/syncBnbPaymentTx', () => ({
  syncBnbPaymentTx: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/lib/bnb-pay-types', () => ({
  PAY_TYPE_KEYS: [],
  bookingToPaymentEntry: vi.fn().mockReturnValue(null),
  syncPaymentEntry: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    bnbBookingRecord: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    bnbBossWithdraw: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({}),
    },
    bnbSyncFailure: {
      updateMany: vi.fn().mockResolvedValue({}),
      create: vi.fn().mockResolvedValue({}),
    },
  },
}));

import prisma from '@/lib/prisma';
import { syncBnbPaymentTx } from '@/lib/syncBnbPaymentTx';
import { PATCH } from '@/app/api/bnb/batch/route.js';

function makeRequest(body) {
  return { json: async () => body };
}

const EXISTING = {
  paymentLocked: false, payCard: 0, cardFeeRate: 0.015,
  payCash: 0, cashDestination: null, guestName: '王小明',
  warehouse: '麗格', checkInDate: '2026-05-10', checkOutDate: '2026-05-12',
  bossWithdrawNote: null, cashDepositDate: null, cardSettlementDate: null,
  payDeposit: 0, payTransfer: 0, payVoucher: 0, isComplimentary: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  prisma.bnbBookingRecord.findMany.mockResolvedValue([
    { id: 1, importMonth: '2026-05', warehouse: '麗格' },
  ]);
  prisma.bnbBookingRecord.findUnique.mockResolvedValue(EXISTING);
  prisma.bnbBookingRecord.update.mockResolvedValue({});
  prisma.bnbSyncFailure.updateMany.mockResolvedValue({});
  syncBnbPaymentTx.mockResolvedValue({});
});

describe('PATCH /api/bnb/batch — savePayment', () => {
  it('鎖定的記錄被跳過', async () => {
    prisma.bnbBookingRecord.findUnique.mockResolvedValue({ ...EXISTING, paymentLocked: true });

    const res = await PATCH(makeRequest({
      action: 'savePayment',
      records: [{ id: 1, payDeposit: 5000, depositDate: '2026-05-01' }],
    }));
    const body = await res.json();

    expect(body.skipped).toBe(1);
    expect(body.saved).toBe(0);
    expect(prisma.bnbBookingRecord.update).not.toHaveBeenCalled();
  });

  it('payDeposit + depositDate 儲存成功後呼叫 syncBnbPaymentTx', async () => {
    const res = await PATCH(makeRequest({
      action: 'savePayment',
      records: [{ id: 1, payDeposit: 3000, depositDate: '2026-05-01' }],
    }));
    const body = await res.json();

    expect(body.saved).toBe(1);
    expect(syncBnbPaymentTx).toHaveBeenCalledWith(1);
  });

  it('cardSettlementDate 和 cashDepositDate 可以透過 batch 更新', async () => {
    await PATCH(makeRequest({
      action: 'savePayment',
      records: [{ id: 1, payCard: 2000, cardSettlementDate: '2026-05-15', payCash: 1000, cashDepositDate: '2026-05-12', cashDestination: '存帳' }],
    }));

    const callArg = prisma.bnbBookingRecord.update.mock.calls[0][0];
    expect(callArg.data.cardSettlementDate).toBe('2026-05-15');
    expect(callArg.data.cashDepositDate).toBe('2026-05-12');
  });

  it('cardFeeRate 可以透過 batch 更新，並重算 cardFee', async () => {
    await PATCH(makeRequest({
      action: 'savePayment',
      records: [{ id: 1, payCard: 10000, cardFeeRate: 0.02 }],
    }));

    const callArg = prisma.bnbBookingRecord.update.mock.calls[0][0];
    expect(callArg.data.cardFeeRate).toBeCloseTo(0.02);
    expect(callArg.data.cardFee).toBeCloseTo(200);
  });

  it('paymentFilled 依付款總額自動計算', async () => {
    await PATCH(makeRequest({
      action: 'savePayment',
      records: [{ id: 1, payDeposit: 5000 }],
    }));

    const callArg = prisma.bnbBookingRecord.update.mock.calls[0][0];
    expect(callArg.data.paymentFilled).toBe(true);
  });

  it('syncBnbPaymentTx 失敗時寫入 BnbSyncFailure，仍回傳 ok:true', async () => {
    syncBnbPaymentTx.mockRejectedValueOnce(new Error('no bank account'));

    const res = await PATCH(makeRequest({
      action: 'savePayment',
      records: [{ id: 1, payDeposit: 1000, depositDate: '2026-05-01' }],
    }));
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(prisma.bnbSyncFailure.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ bookingId: 1 }) })
    );
  });

  it('不含付款欄位的 patch 不呼叫 syncBnbPaymentTx', async () => {
    await PATCH(makeRequest({
      action: 'savePayment',
      records: [{ id: 1, bossWithdrawNote: '已轉交' }],
    }));

    expect(syncBnbPaymentTx).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/bnb/batch — lockAllFilled', () => {
  const ELIGIBLE = [
    { id: 10, guestName: '李美麗', importMonth: '2026-05', warehouse: '麗格',
      payDeposit: 5000, payTransfer: 0, payCard: 0, payCash: 0, payVoucher: 0,
      roomCharge: 5000, otherCharge: 0, isComplimentary: false },
    { id: 11, guestName: '張大文', importMonth: '2026-05', warehouse: '麗格',
      payDeposit: 3000, payTransfer: 0, payCard: 0, payCash: 0, payVoucher: 0,
      roomCharge: 3000, otherCharge: 0, isComplimentary: false },
  ];

  beforeEach(() => {
    prisma.bnbBookingRecord.findMany.mockResolvedValue(ELIGIBLE);
    prisma.bnbBookingRecord.updateMany.mockResolvedValue({ count: 2 });
  });

  it('無符合記錄時回傳 locked:0', async () => {
    prisma.bnbBookingRecord.findMany.mockResolvedValue([]);

    const res = await PATCH(makeRequest({ action: 'lockAllFilled', importMonth: '2026-05' }));
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(body.locked).toBe(0);
    expect(prisma.bnbBookingRecord.updateMany).not.toHaveBeenCalled();
  });

  it('所有記錄金額相符 → 直接鎖帳', async () => {
    const res = await PATCH(makeRequest({ action: 'lockAllFilled', importMonth: '2026-05', warehouse: '麗格' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.locked).toBe(2);
    expect(body.mismatches).toHaveLength(0);
    expect(prisma.bnbBookingRecord.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ paymentLocked: true }) })
    );
  });

  it('有金額不符但未 confirmMismatch → 回 409 + requireConfirm:true', async () => {
    const mismatchRecord = { ...ELIGIBLE[0], payDeposit: 4000 }; // 4000 ≠ 5000
    prisma.bnbBookingRecord.findMany.mockResolvedValue([mismatchRecord, ELIGIBLE[1]]);

    const res = await PATCH(makeRequest({ action: 'lockAllFilled', importMonth: '2026-05' }));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.requireConfirm).toBe(true);
    expect(body.mismatches).toHaveLength(1);
    expect(body.mismatches[0].guestName).toBe('李美麗');
    expect(prisma.bnbBookingRecord.updateMany).not.toHaveBeenCalled();
  });

  it('confirmMismatch:true → 強制鎖帳', async () => {
    const mismatchRecord = { ...ELIGIBLE[0], payDeposit: 4000 };
    prisma.bnbBookingRecord.findMany.mockResolvedValue([mismatchRecord, ELIGIBLE[1]]);

    const res = await PATCH(makeRequest({ action: 'lockAllFilled', importMonth: '2026-05', confirmMismatch: true }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.locked).toBe(2);
    expect(prisma.bnbBookingRecord.updateMany).toHaveBeenCalled();
  });

  it('缺少 importMonth → 400', async () => {
    const res = await PATCH(makeRequest({ action: 'lockAllFilled' }));
    expect(res.status).toBe(400);
  });
});
