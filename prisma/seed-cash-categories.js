// 系統預設現金類別種子資料
// 使用方式: node prisma/seed-cash-categories.js

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const categories = [
  { name: '貸款還本', type: '支出', systemCode: 'LOAN_PRINCIPAL' },
  { name: '貸款利息', type: '支出', systemCode: 'LOAN_INTEREST' },
  { name: '支票兌現', type: '支出', systemCode: 'CHECK_CLEAR' },
  { name: '出納付款', type: '支出', systemCode: 'CASHIER_PAY' },
  { name: '租金收入', type: '收入', systemCode: 'RENTAL_INCOME' },
  { name: '租金退還', type: '支出', systemCode: 'RENTAL_REFUND' },
  { name: 'PMS 營收', type: '收入', systemCode: 'PMS_REVENUE' },
  { name: '沖銷', type: '支出', systemCode: 'REVERSAL' },
  { name: '雜項收入', type: '收入', systemCode: 'MISC_INCOME' },
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
