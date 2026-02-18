const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// CSV 分類對應到系統類型
const TYPE_MAP = {
  '現金': '現金',
  '銀行帳戶': '銀行存款',
  '信用卡': '信用卡',
  '代墊款': '代墊款',
};

const DATA = [
  { accountCode: 'P001', type: '現金', name: '會計' },
  { accountCode: 'P002', type: '現金', name: '零用金' },
  { accountCode: 'B001', type: '銀行帳戶', name: '土格(總)' },
  { accountCode: 'B002', type: '銀行帳戶', name: '土格分' },
  { accountCode: 'B003', type: '銀行帳戶', name: '土軒(總)' },
  { accountCode: 'B004', type: '銀行帳戶', name: '土軒分' },
  { accountCode: 'B005', type: '銀行帳戶', name: '土林' },
  { accountCode: 'B006', type: '銀行帳戶', name: '土頂' },
  { accountCode: 'B007', type: '銀行帳戶', name: '土月' },
  { accountCode: 'B008', type: '銀行帳戶', name: '土慶' },
  { accountCode: 'B009', type: '銀行帳戶', name: '土瑋' },
  { accountCode: 'B010', type: '銀行帳戶', name: '土合瑩' },
  { accountCode: 'B011', type: '銀行帳戶', name: '土佩' },
  { accountCode: 'B012', type: '銀行帳戶', name: '土音' },
  { accountCode: 'B013', type: '銀行帳戶', name: '土達(舊)薪資' },
  { accountCode: 'B014', type: '銀行帳戶', name: '土達(新)' },
  { accountCode: 'B015', type: '銀行帳戶', name: '土海' },
  { accountCode: 'B016', type: '銀行帳戶', name: '土花' },
  { accountCode: 'B017', type: '銀行帳戶', name: '世軒分' },
  { accountCode: 'B018', type: '銀行帳戶', name: '世麗分' },
  { accountCode: 'B019', type: '銀行帳戶', name: '世月' },
  { accountCode: 'B020', type: '銀行帳戶', name: '世林' },
  { accountCode: 'B021', type: '銀行帳戶', name: '世佩' },
  { accountCode: 'B022', type: '銀行帳戶', name: '一信格(復)' },
  { accountCode: 'B023', type: '銀行帳戶', name: '一信翰瑋' },
  { accountCode: 'B024', type: '銀行帳戶', name: '一信月' },
  { accountCode: 'B025', type: '銀行帳戶', name: '一信佩' },
  { accountCode: 'B026', type: '銀行帳戶', name: '臺企格(總)' },
  { accountCode: 'B027', type: '銀行帳戶', name: '臺企軒' },
  { accountCode: 'B028', type: '銀行帳戶', name: '臺企音' },
  { accountCode: 'B029', type: '銀行帳戶', name: '兆豐月' },
  { accountCode: 'B030', type: '銀行帳戶', name: '兆豐頂' },
  { accountCode: 'B031', type: '銀行帳戶', name: '兆豐達' },
  { accountCode: 'B032', type: '銀行帳戶', name: '兆豐林' },
  { accountCode: 'B033', type: '銀行帳戶', name: '合庫格' },
  { accountCode: 'B034', type: '銀行帳戶', name: '合庫軒' },
  { accountCode: 'B035', type: '銀行帳戶', name: '合庫海' },
  { accountCode: 'B036', type: '銀行帳戶', name: '合庫花' },
  { accountCode: 'B037', type: '銀行帳戶', name: '合庫林' },
  { accountCode: 'B038', type: '銀行帳戶', name: '合庫達' },
  { accountCode: 'B039', type: '銀行帳戶', name: '合庫佩' },
  { accountCode: 'B040', type: '銀行帳戶', name: '市農林' },
  { accountCode: 'B041', type: '銀行帳戶', name: '陽信格(總)' },
  { accountCode: 'B042', type: '銀行帳戶', name: '陽信軒(總)' },
  { accountCode: 'B043', type: '銀行帳戶', name: '陽信佩' },
  { accountCode: 'B044', type: '銀行帳戶', name: '陽信廣揚' },
  { accountCode: 'B045', type: '銀行帳戶', name: '陽信瑋' },
  { accountCode: 'B046', type: '銀行帳戶', name: '陽信音' },
  { accountCode: 'B047', type: '銀行帳戶', name: '陽信頂' },
  { accountCode: 'B048', type: '銀行帳戶', name: '陽信慶' },
  { accountCode: 'B049', type: '銀行帳戶', name: '陽信林' },
  { accountCode: 'B050', type: '銀行帳戶', name: '陽信月' },
  { accountCode: 'B051', type: '銀行帳戶', name: '台北富湯快珠' },
  { accountCode: 'B052', type: '銀行帳戶', name: '元大林' },
  { accountCode: 'C001', type: '現金', name: '現金' },
  { accountCode: 'D001', type: '信用卡', name: '信用卡佩樺' },
  { accountCode: 'D002', type: '代墊款', name: '代墊款' },
];

async function main() {
  console.log('開始匯入資金帳戶...');

  for (const item of DATA) {
    const systemType = TYPE_MAP[item.type] || item.type;
    await prisma.cashAccount.upsert({
      where: { accountCode: item.accountCode },
      update: {
        name: item.name,
        type: systemType,
      },
      create: {
        accountCode: item.accountCode,
        name: item.name,
        type: systemType,
        warehouse: null,
        openingBalance: 0,
        currentBalance: 0,
        isActive: true,
      },
    });
  }

  console.log(`成功匯入 ${DATA.length} 個資金帳戶`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
