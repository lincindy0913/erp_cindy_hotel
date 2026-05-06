/**
 * One-off import script: guest資料設定-麗格.xlsx → TenantMaster, RentalProperty, RentalContract
 * Run: node prisma/import-rental-data.js
 */
const xlsx = require('xlsx');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const path = require('path');

const XLSX_PATH = path.join(__dirname, '..', 'guest資料設定-麗格.xlsx');
const NOW = new Date();
const YYYYMM = `${NOW.getFullYear()}${String(NOW.getMonth() + 1).padStart(2, '0')}`;
const TODAY = `${NOW.getFullYear()}${String(NOW.getMonth() + 1).padStart(2, '0')}${String(NOW.getDate()).padStart(2, '0')}`;

// ROC date (e.g. 1120125) → AD string (e.g. 2023-01-25)
function rocToAD(roc) {
  if (!roc) return null;
  const s = String(Math.round(Number(roc))).padStart(7, '0');
  const year = parseInt(s.slice(0, 3)) + 1911;
  const month = s.slice(3, 5);
  const day = s.slice(5, 7);
  if (isNaN(year) || parseInt(month) < 1 || parseInt(month) > 12) return null;
  if (parseInt(day) < 1 || parseInt(day) > 31) return null;
  return `${year}-${month}-${day}`;
}

// Normalize phone: strip dashes/spaces
function normalizePhone(p) {
  if (!p) return '';
  return String(p).replace(/[-\s]/g, '').trim();
}

async function main() {
  const wb = xlsx.readFile(XLSX_PATH);

  // ── Sheet 1: 租客 ─────────────────────────────────────────────
  const ws1 = wb.Sheets['租客'];
  const sheet1 = xlsx.utils.sheet_to_json(ws1, { header: 1 });

  // Build map: roomName → { fullName, phone }
  // Col 0 = room key, Col 1 = name, Col 2 = phone
  const tenantByRoom = new Map();
  const uniqueTenants = []; // for createMany

  for (let i = 1; i < sheet1.length; i++) {
    const row = sheet1[i];
    const room = row[0] ? String(row[0]).trim() : '';
    const name = row[1] ? String(row[1]).trim() : '';
    const phone = normalizePhone(row[2]);
    if (!name || !phone) continue;
    tenantByRoom.set(room, { fullName: name, phone });
    uniqueTenants.push({ room, fullName: name, phone });
  }

  console.log(`Sheet1 valid tenants: ${uniqueTenants.length}`);

  // ── Sheet 2: 物業和合約管理 ────────────────────────────────────
  const ws2 = wb.Sheets['物業和合約管理'];
  const sheet2 = xlsx.utils.sheet_to_json(ws2, { header: 1 });

  // Headers start at row index 1 (row 2 in Excel), data from row index 2
  const propertyRows = [];
  for (let i = 2; i < sheet2.length; i++) {
    const row = sheet2[i];
    const room = row[1] ? String(row[1]).trim() : '';
    if (!room) continue;
    propertyRows.push({
      room,                                                         // col B
      tenantName: row[2] ? String(row[2]).trim() : '',             // col C
      phone: normalizePhone(row[3]),                               // col D
      deposit: row[5] ? parseFloat(row[5]) || 0 : 0,              // col F
      monthlyRent: row[6] ? parseFloat(row[6]) || 0 : 0,          // col G
      payMethod: row[7] ? String(row[7]).trim() : '',              // col H
      startDateRoc: row[8],                                        // col I (ROC)
      endDateRoc: row[9],                                          // col J (ROC)
      status: row[13] ? String(row[13]).trim() : '',               // col N
    });
  }

  console.log(`Sheet2 valid property rows: ${propertyRows.length}`);

  // ── Step 0: Create missing CashAccounts ───────────────────────
  const missingAccounts = ['土月', '土瑋', '台企音', '土達'];
  const newAccountIds = {};

  for (const name of missingAccounts) {
    const existing = await prisma.cashAccount.findFirst({ where: { name } });
    if (existing) {
      newAccountIds[name] = existing.id;
      console.log(`CashAccount '${name}' already exists (id: ${existing.id})`);
    } else {
      const created = await prisma.cashAccount.create({
        data: { name, type: '現金', openingBalance: 0, currentBalance: 0 },
      });
      newAccountIds[name] = created.id;
      console.log(`Created CashAccount '${name}' (id: ${created.id})`);
    }
  }

  // ── Payment method → rentAccountId map ────────────────────────
  const PAY_MAP = {
    '湯三姐收現金': 18,
    '土格': 1,
    '土佩': 10,
    '土音': 24,
    '土月': newAccountIds['土月'],
    '土瑋': newAccountIds['土瑋'],
    '台企音': newAccountIds['台企音'],
    '土達': newAccountIds['土達'],
  };
  const DEFAULT_ACCOUNT = 18;

  function getRentAccountId(method) {
    return PAY_MAP[method] || DEFAULT_ACCOUNT;
  }

  // ── Step 1: Insert TenantMaster ───────────────────────────────
  const tenantData = uniqueTenants.map((t, i) => ({
    tenantCode: `RENT-${YYYYMM}-${String(i + 1).padStart(3, '0')}`,
    tenantType: 'individual',
    fullName: t.fullName,
    phone: t.phone,
  }));

  const tenantResult = await prisma.tenantMaster.createMany({
    data: tenantData,
    skipDuplicates: true,
  });
  console.log(`TenantMaster inserted: ${tenantResult.count}`);

  // ── Step 2: Insert RentalProperty ─────────────────────────────
  const uniqueRooms = [...new Map(propertyRows.map(r => [r.room, r])).values()];
  const propertyData = uniqueRooms.map(r => ({
    name: r.room,
    status: r.status === '已租' ? 'rented' : 'available',
  }));

  const propResult = await prisma.rentalProperty.createMany({
    data: propertyData,
    skipDuplicates: true,
  });
  console.log(`RentalProperty inserted: ${propResult.count}`);

  // ── Step 3: Re-fetch ids ───────────────────────────────────────
  const allTenants = await prisma.tenantMaster.findMany({ select: { id: true, fullName: true, phone: true } });
  const allProperties = await prisma.rentalProperty.findMany({ select: { id: true, name: true } });

  // Build lookup maps
  const tenantByName = new Map(allTenants.map(t => [t.fullName, t.id]));
  const propertyByName = new Map(allProperties.map(p => [p.name, p.id]));

  // ── Step 4: Insert RentalContract ─────────────────────────────
  let contractInserted = 0, contractSkipped = 0;

  for (let i = 0; i < propertyRows.length; i++) {
    const row = propertyRows[i];

    // Find property
    const propertyId = propertyByName.get(row.room);
    if (!propertyId) { contractSkipped++; continue; }

    // Find tenant: first try Sheet1 room→tenant map, fallback to tenantName from Sheet2
    const tenantFromSheet1 = tenantByRoom.get(row.room);
    const tenantName = tenantFromSheet1?.fullName || row.tenantName;
    const tenantId = tenantByName.get(tenantName);
    if (!tenantId) { contractSkipped++; continue; }

    // Dates
    const startDate = rocToAD(row.startDateRoc);
    const endDate = rocToAD(row.endDateRoc);
    if (!startDate || !endDate) { contractSkipped++; continue; }
    if (startDate >= endDate) { contractSkipped++; continue; }

    const contractNo = `RC-${TODAY}-${String(i + 1).padStart(3, '0')}`;
    const status = row.status === '已租' ? 'active' : 'pending';
    const rentAccountId = getRentAccountId(row.payMethod);

    try {
      await prisma.rentalContract.create({
        data: {
          contractNo,
          propertyId,
          tenantId,
          startDate,
          endDate,
          monthlyRent: row.monthlyRent || 0,
          depositAmount: row.deposit || 0,
          preferredPayMethod: row.payMethod || null,
          rentAccountId,
          accountingSubjectId: 229,
          paymentDueDay: 5,
          status,
        },
      });
      contractInserted++;
    } catch (e) {
      console.warn(`Skipped contract for ${row.room}: ${e.message}`);
      contractSkipped++;
    }
  }

  console.log(`RentalContract inserted: ${contractInserted} | skipped: ${contractSkipped}`);
  console.log('Import complete.');
  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e.message);
  prisma.$disconnect();
  process.exit(1);
});
