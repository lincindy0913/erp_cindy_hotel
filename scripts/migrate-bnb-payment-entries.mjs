/**
 * B16 資料搬移腳本：BnbBookingRecord 寬表 → BnbPaymentEntry 子表
 *
 * 執行方式（乾跑）:
 *   node scripts/migrate-bnb-payment-entries.mjs --dry-run
 *
 * 正式執行:
 *   node scripts/migrate-bnb-payment-entries.mjs
 *
 * 此腳本是冪等的（使用 upsert），可重複執行。
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');

const PAY_TYPES = [
  {
    payType: 'deposit',
    amountField:   'payDeposit',
    dateField:     'depositDate',
    last5Field:    'depositLast5',
    bankLineField: 'depositBankLineId',
    matchedAtField:'depositMatchedAt',
    matchedByField:'depositMatchedBy',
    skipField:     'depositMatchSkip',
    skipNoteField: 'depositMatchSkipNote',
    cashTxField:   'depositCashTxId',
  },
  {
    payType: 'transfer',
    amountField:   'payTransfer',
    dateField:     'transferDate',
    last5Field:    'transferLast5',
    bankLineField: 'transferBankLineId',
    matchedAtField:'transferMatchedAt',
    matchedByField:'transferMatchedBy',
    skipField:     'transferMatchSkip',
    skipNoteField: 'transferMatchSkipNote',
    cashTxField:   'transferCashTxId',
  },
  {
    payType: 'card',
    amountField:    'payCard',
    dateField:      'cardSettlementDate',
    last5Field:     null,
    bankLineField:  'cardBankLineId',
    matchedAtField: 'cardMatchedAt',
    matchedByField: 'cardMatchedBy',
    skipField:      'cardMatchSkip',
    skipNoteField:  'cardMatchSkipNote',
    cashTxField:    'cardCashTxId',
    feeRateField:   'cardFeeRate',
    feeField:       'cardFee',
    settlementDateField: 'cardSettlementDate',
  },
  {
    payType: 'cash',
    amountField:    'payCash',
    dateField:      'cashDepositDate',
    last5Field:     null,
    bankLineField:  'cashBankLineId',
    matchedAtField: 'cashMatchedAt',
    matchedByField: 'cashMatchedBy',
    skipField:      'cashMatchSkip',
    skipNoteField:  'cashMatchSkipNote',
    cashTxField:    'cashCashTxId',
    cashDestinationField: 'cashDestination',
    withdrawNoteField:    'bossWithdrawNote',
  },
  {
    payType: 'voucher',
    amountField: 'payVoucher',
    dateField:   null,
    last5Field:  null,
    bankLineField: null,
    matchedAtField: null,
    matchedByField: null,
    skipField:      null,
    skipNoteField:  null,
    cashTxField:    null,
  },
];

async function main() {
  console.log(`B16 BnbPaymentEntry 資料搬移${DRY_RUN ? '（乾跑模式，不寫入）' : ''}`);

  const total = await prisma.bnbBookingRecord.count();
  console.log(`共 ${total} 筆訂房記錄`);

  let migrated = 0;
  let skipped  = 0;
  const BATCH = 200;

  for (let skip = 0; skip < total; skip += BATCH) {
    const bookings = await prisma.bnbBookingRecord.findMany({
      skip,
      take: BATCH,
      select: {
        id: true,
        payDeposit: true, depositDate: true, depositLast5: true,
        depositBankLineId: true, depositMatchedAt: true, depositMatchedBy: true,
        depositMatchSkip: true, depositMatchSkipNote: true, depositCashTxId: true,
        payTransfer: true, transferDate: true, transferLast5: true,
        transferBankLineId: true, transferMatchedAt: true, transferMatchedBy: true,
        transferMatchSkip: true, transferMatchSkipNote: true, transferCashTxId: true,
        payCard: true, cardFeeRate: true, cardFee: true, cardSettlementDate: true,
        cardBankLineId: true, cardMatchedAt: true, cardMatchedBy: true,
        cardMatchSkip: true, cardMatchSkipNote: true, cardCashTxId: true,
        payCash: true, cashDepositDate: true, cashDestination: true, bossWithdrawNote: true,
        cashBankLineId: true, cashMatchedAt: true, cashMatchedBy: true,
        cashMatchSkip: true, cashMatchSkipNote: true, cashCashTxId: true,
        payVoucher: true,
      },
    });

    for (const b of bookings) {
      for (const cfg of PAY_TYPES) {
        const amount = Number(b[cfg.amountField] ?? 0);
        // skip zero-amount entries that have no other data
        const hasBankLine = cfg.bankLineField && b[cfg.bankLineField];
        const hasCashTx   = cfg.cashTxField   && b[cfg.cashTxField];
        if (amount === 0 && !hasBankLine && !hasCashTx) { skipped++; continue; }

        const entryData = {
          amount,
          date:      cfg.dateField      ? (b[cfg.dateField]      ?? null) : null,
          last5:     cfg.last5Field      ? (b[cfg.last5Field]     ?? null) : null,
          bankLineId: cfg.bankLineField  ? (b[cfg.bankLineField]  ?? null) : null,
          matchedAt:  cfg.matchedAtField ? (b[cfg.matchedAtField] ?? null) : null,
          matchedBy:  cfg.matchedByField ? (b[cfg.matchedByField] ?? null) : null,
          skipReason: cfg.skipField      ? (b[cfg.skipField]      ?? null) : null,
          skipNote:   cfg.skipNoteField  ? (b[cfg.skipNoteField]  ?? null) : null,
          cashTxId:   cfg.cashTxField    ? (b[cfg.cashTxField]    ?? null) : null,
          // card-specific
          feeRate:         cfg.feeRateField        ? Number(b[cfg.feeRateField] ?? 0) : null,
          fee:             cfg.feeField            ? Number(b[cfg.feeField]     ?? 0) : null,
          settlementDate:  cfg.settlementDateField ? (b[cfg.settlementDateField] ?? null) : null,
          // cash-specific
          cashDestination: cfg.cashDestinationField ? (b[cfg.cashDestinationField] ?? null) : null,
          withdrawNote:    cfg.withdrawNoteField    ? (b[cfg.withdrawNoteField]    ?? null) : null,
        };

        if (!DRY_RUN) {
          await prisma.bnbPaymentEntry.upsert({
            where: { bookingId_payType: { bookingId: b.id, payType: cfg.payType } },
            create: { bookingId: b.id, payType: cfg.payType, ...entryData },
            update: entryData,
          });
        }
        migrated++;
      }
    }

    process.stdout.write(`\r  進度：${Math.min(skip + BATCH, total)} / ${total}`);
  }

  console.log(`\n完成：搬移 ${migrated} 筆，略過 ${skipped} 筆（零金額且無核對記錄）`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
