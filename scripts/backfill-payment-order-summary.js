// 回填既有 PaymentOrder 的 summary 欄位（從 note 擷取摘要）
// 使用方式: node scripts/backfill-payment-order-summary.js

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('開始回填 PaymentOrder summary...');

  const orders = await prisma.paymentOrder.findMany({
    where: { summary: null },
    select: { id: true, note: true, supplierName: true, warehouse: true }
  });

  console.log(`找到 ${orders.length} 筆無 summary 的付款單`);

  let updated = 0;
  for (const order of orders) {
    if (!order.note) continue;

    // Extract summary from note — take the main description before any brackets/parentheses details
    let summary = order.note;

    // For loan auto-push: "貸款還款預存 — CODE YYYY/MM (暫估...) [自動推送]"
    if (summary.includes('貸款還款預存')) {
      summary = summary.replace(/\s*\(暫估.*?\)/, '').replace(/\s*\[自動推送\]/, '');
    }
    // For PMS commission: "YYYY/MM AgencyName 代訂佣金（應付）- 來源：PMS佣金管理"
    else if (summary.includes('代訂佣金')) {
      summary = summary.replace(/\s*-\s*來源：.*$/, '');
    }
    // For fixed expense: "固定費用 - YYYY-MM" — enhance with supplier/warehouse
    else if (summary.startsWith('固定費用')) {
      if (order.supplierName) {
        summary = `${order.supplierName} ${summary}`;
      }
    }

    // Truncate to 500 chars
    if (summary.length > 500) summary = summary.substring(0, 497) + '...';

    await prisma.paymentOrder.update({
      where: { id: order.id },
      data: { summary }
    });
    updated++;
  }

  console.log(`完成！更新 ${updated} 筆`);
}

main()
  .catch((error) => {
    console.error('回填失敗:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
