// 系統預設現金類別種子資料
// 使用方式: node prisma/seed-cash-categories.js

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const categories = [
  // === 收入類 ===
  { name: 'PMS 營收', type: '收入', systemCode: 'PMS_REVENUE' },
  { name: 'PMS 代訂佣金', type: '收入', systemCode: 'PMS_COMMISSION' },
  { name: '租金收入', type: '收入', systemCode: 'RENTAL_INCOME' },
  { name: '租金押金收取', type: '收入', systemCode: 'RENTAL_DEPOSIT_IN' },
  { name: '支票收款', type: '收入', systemCode: 'CHECK_RECEIPT' },
  { name: '現金盤點盈餘', type: '收入', systemCode: 'CASH_COUNT_SURPLUS' },
  { name: '雜項收入', type: '收入', systemCode: 'MISC_INCOME' },
  // === 支出類 ===
  { name: 'PMS 手續費', type: '支出', systemCode: 'PMS_FEE' },
  { name: '租金退還', type: '支出', systemCode: 'RENTAL_REFUND' },
  { name: '租金押金退還', type: '支出', systemCode: 'RENTAL_DEPOSIT_OUT' },
  { name: '租金維修費', type: '支出', systemCode: 'RENTAL_MAINTENANCE' },
  { name: '房屋稅款', type: '支出', systemCode: 'RENTAL_TAX' },
  { name: '貸款還本', type: '支出', systemCode: 'LOAN_PRINCIPAL' },
  { name: '貸款利息', type: '支出', systemCode: 'LOAN_INTEREST' },
  { name: '支票兌現', type: '支出', systemCode: 'CHECK_CLEAR' },
  { name: '出納付款', type: '支出', systemCode: 'CASHIER_PAY' },
  { name: '固定費用', type: '支出', systemCode: 'FIXED_EXPENSE' },
  { name: '進貨費用', type: '支出', systemCode: 'PURCHASE_EXPENSE' },
  { name: '現金盤點短缺', type: '支出', systemCode: 'CASH_COUNT_SHORTAGE' },
  { name: '沖銷', type: '支出', systemCode: 'REVERSAL' },
  { name: '雜項支出', type: '支出', systemCode: 'MISC_EXPENSE' },
];

async function main() {
  console.log('開始建立系統預設現金類別...');

  for (const cat of categories) {
    // 先查找是否有相同 systemCode 的記錄
    const existing = await prisma.cashCategory.findFirst({
      where: { systemCode: cat.systemCode }
    });

    if (existing) {
      // 更新現有記錄
      await prisma.cashCategory.update({
        where: { id: existing.id },
        data: {
          name: cat.name,
          type: cat.type,
          isSystemDefault: true,
          isActive: true,
        }
      });
      console.log(`  更新: ${cat.name} (${cat.systemCode})`);
    } else {
      // 建立新記錄
      await prisma.cashCategory.create({
        data: {
          name: cat.name,
          type: cat.type,
          isSystemDefault: true,
          systemCode: cat.systemCode,
          isActive: true,
        }
      });
      console.log(`  建立: ${cat.name} (${cat.systemCode})`);
    }
  }

  console.log(`完成！共處理 ${categories.length} 個系統預設類別。`);
}

main()
  .catch((error) => {
    console.error('建立系統預設現金類別失敗:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
