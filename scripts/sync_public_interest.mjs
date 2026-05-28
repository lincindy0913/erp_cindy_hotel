// 將 RentalRentFiling.isPublicInterest=true 的物業同步到 RentalProperty.publicInterestLandlord=true
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // 找出所有有公益申報紀錄的 propertyId
  const filings = await prisma.rentalRentFiling.findMany({
    where: { isPublicInterest: true },
    select: { propertyId: true },
    distinct: ['propertyId'],
  });

  const propertyIds = filings.map(f => f.propertyId);
  console.log(`找到 ${propertyIds.length} 個物業有公益申報紀錄:`, propertyIds);

  if (propertyIds.length === 0) {
    console.log('沒有需要更新的物業');
    return;
  }

  // 先查詢目前狀態
  const before = await prisma.rentalProperty.findMany({
    where: { id: { in: propertyIds } },
    select: { id: true, name: true, publicInterestLandlord: true },
  });
  console.log('\n更新前狀態:');
  before.forEach(p => console.log(`  [${p.id}] ${p.name} - publicInterestLandlord: ${p.publicInterestLandlord}`));

  // 更新
  const result = await prisma.rentalProperty.updateMany({
    where: { id: { in: propertyIds } },
    data: { publicInterestLandlord: true },
  });

  console.log(`\n✅ 已更新 ${result.count} 筆物業為公益出租人`);

  // 確認結果
  const after = await prisma.rentalProperty.findMany({
    where: { id: { in: propertyIds } },
    select: { id: true, name: true, publicInterestLandlord: true },
  });
  console.log('\n更新後確認:');
  after.forEach(p => console.log(`  [${p.id}] ${p.name} - publicInterestLandlord: ${p.publicInterestLandlord}`));
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
