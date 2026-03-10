// 回填既有 CashTransaction 的 categoryId
// 使用方式: node scripts/backfill-category-id.js

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// sourceType → systemCode 對照表
const SOURCE_TYPE_TO_SYSTEM_CODE = {
  cashier_payment: 'CASHIER_PAY',
  loan_payment: 'LOAN_PRINCIPAL', // default; interest handled separately below
  rental_income: 'RENTAL_INCOME',
  rental_deposit_in: 'RENTAL_DEPOSIT_IN',
  rental_deposit_out: 'RENTAL_DEPOSIT_OUT',
  rental_maintenance: 'RENTAL_MAINTENANCE',
  rental_tax: 'RENTAL_TAX',
  fixed_expense: 'FIXED_EXPENSE',
  common_expense: 'PURCHASE_EXPENSE',
  purchase_expense: 'PURCHASE_EXPENSE',
  check_payment: 'CHECK_CLEAR',
  check_receipt: 'CHECK_RECEIPT',
  check_bounce: 'CHECK_CLEAR',
  cash_count_adjustment: 'CASH_COUNT_SURPLUS',
  cash_count_shortage: 'CASH_COUNT_SHORTAGE',
  pms_income_settlement: 'PMS_REVENUE',
  pms_income_fee: 'PMS_FEE',
  pms_manual_commission: 'PMS_COMMISSION',
  reversal: 'REVERSAL',
  reconciliation_adjustment: 'MISC_EXPENSE',
};

async function main() {
  console.log('開始回填 CashTransaction categoryId...');

  // 1. Load all system categories
  const categories = await prisma.cashCategory.findMany({
    where: { isSystemDefault: true, isActive: true },
  });
  const codeToId = {};
  for (const cat of categories) {
    if (cat.systemCode) codeToId[cat.systemCode] = cat.id;
  }
  console.log(`已載入 ${Object.keys(codeToId).length} 個系統類別`);

  // 2. Find all transactions without categoryId
  const transactions = await prisma.cashTransaction.findMany({
    where: { categoryId: null },
    select: { id: true, sourceType: true, description: true },
  });
  console.log(`找到 ${transactions.length} 筆無類別的交易`);

  let updated = 0;
  let skipped = 0;

  for (const tx of transactions) {
    let systemCode = null;

    if (tx.sourceType) {
      // Special handling for loan_payment: check description for 利息 vs 本金
      if (tx.sourceType === 'loan_payment') {
        if (tx.description && tx.description.includes('利息')) {
          systemCode = 'LOAN_INTEREST';
        } else {
          systemCode = 'LOAN_PRINCIPAL';
        }
      } else {
        systemCode = SOURCE_TYPE_TO_SYSTEM_CODE[tx.sourceType];
      }
    }

    if (!systemCode || !codeToId[systemCode]) {
      skipped++;
      continue;
    }

    await prisma.cashTransaction.update({
      where: { id: tx.id },
      data: { categoryId: codeToId[systemCode] },
    });
    updated++;
  }

  console.log(`完成！更新 ${updated} 筆，跳過 ${skipped} 筆（無對應類別或手動建立）`);
}

main()
  .catch((error) => {
    console.error('回填失敗:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
