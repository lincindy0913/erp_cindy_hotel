// 系統預設現金類別種子資料
// 使用方式: node prisma/seed-cash-categories.js

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const categories = [
  // === 收入類 === (accountingCode: 建議對應會計科目代碼)
  { name: 'PMS 營收', type: '收入', systemCode: 'PMS_REVENUE', accountingCode: '4111' },
  { name: 'PMS 代訂佣金', type: '收入', systemCode: 'PMS_COMMISSION', accountingCode: '4199' },
  { name: '租金收入', type: '收入', systemCode: 'RENTAL_INCOME', accountingCode: '4211' },
  { name: '租金押金收取', type: '收入', systemCode: 'RENTAL_DEPOSIT_IN', accountingCode: '2191' },
  { name: '支票收款', type: '收入', systemCode: 'CHECK_RECEIPT', accountingCode: '1131' },
  { name: '現金盤點盈餘', type: '收入', systemCode: 'CASH_COUNT_SURPLUS', accountingCode: '4991' },
  { name: '雜項收入', type: '收入', systemCode: 'MISC_INCOME', accountingCode: '4991' },
  // === 支出類 ===
  { name: 'PMS 手續費', type: '支出', systemCode: 'PMS_FEE', accountingCode: '5221' },
  { name: '租金退還', type: '支出', systemCode: 'RENTAL_REFUND', accountingCode: '4211' },
  { name: '租金押金退還', type: '支出', systemCode: 'RENTAL_DEPOSIT_OUT', accountingCode: '2191' },
  { name: '租金維修費', type: '支出', systemCode: 'RENTAL_MAINTENANCE', accountingCode: '5251' },
  { name: '房屋稅款', type: '支出', systemCode: 'RENTAL_TAX', accountingCode: '5241' },
  { name: '貸款還本', type: '支出', systemCode: 'LOAN_PRINCIPAL', accountingCode: '2111' },
  { name: '貸款利息', type: '支出', systemCode: 'LOAN_INTEREST', accountingCode: '5311' },
  { name: '支票兌現', type: '支出', systemCode: 'CHECK_CLEAR', accountingCode: '1121' },
  { name: '出納付款', type: '支出', systemCode: 'CASHIER_PAY', accountingCode: '5199' },
  { name: '固定費用', type: '支出', systemCode: 'FIXED_EXPENSE', accountingCode: '5211' },
  { name: '進貨費用', type: '支出', systemCode: 'PURCHASE_EXPENSE', accountingCode: '5111' },
  { name: '現金盤點短缺', type: '支出', systemCode: 'CASH_COUNT_SHORTAGE', accountingCode: '5991' },
  { name: '沖銷', type: '支出', systemCode: 'REVERSAL', accountingCode: null },
  { name: '雜項支出', type: '支出', systemCode: 'MISC_EXPENSE', accountingCode: '5991' },
];

async function main() {
  console.log('開始建立系統預設現金類別...');

  // Load accounting subjects for linking
  const subjects = await prisma.accountingSubject.findMany();
  const codeToSubjectId = {};
  for (const s of subjects) {
    codeToSubjectId[s.code] = s.id;
  }
  console.log(`已載入 ${subjects.length} 個會計科目`);

  for (const cat of categories) {
    const accountingSubjectId = cat.accountingCode ? (codeToSubjectId[cat.accountingCode] || null) : null;

    // 先查找是否有相同 systemCode 的記錄
    const existing = await prisma.cashCategory.findFirst({
      where: { systemCode: cat.systemCode }
    });

    if (existing) {
      // 更新現有記錄
      const updateData = {
        name: cat.name,
        type: cat.type,
        isSystemDefault: true,
        isActive: true,
      };
      // Only set accountingSubjectId if not already set by user
      if (!existing.accountingSubjectId && accountingSubjectId) {
        updateData.accountingSubjectId = accountingSubjectId;
      }
      await prisma.cashCategory.update({
        where: { id: existing.id },
        data: updateData
      });
      console.log(`  更新: ${cat.name} (${cat.systemCode})${accountingSubjectId ? ` → ${cat.accountingCode}` : ''}`);
    } else {
      // 建立新記錄
      await prisma.cashCategory.create({
        data: {
          name: cat.name,
          type: cat.type,
          isSystemDefault: true,
          systemCode: cat.systemCode,
          isActive: true,
          accountingSubjectId,
        }
      });
      console.log(`  建立: ${cat.name} (${cat.systemCode})${accountingSubjectId ? ` → ${cat.accountingCode}` : ''}`);
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
