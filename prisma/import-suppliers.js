/**
 * One-off import script: supplier 資料設定-麗格.xlsx → Supplier
 * Run: node prisma/import-suppliers.js
 */
const xlsx = require('xlsx');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const path = require('path');

const XLSX_PATH = path.join(__dirname, '..', 'supplier 資料設定-麗格.xlsx');
const NOW = new Date();
const YYYYMM = `${NOW.getFullYear()}${String(NOW.getMonth() + 1).padStart(2, '0')}`;

async function main() {
  // ── Step 1: Delete FK-dependent records then demo suppliers ──────
  console.log('Fetching existing supplier IDs...');
  const existing = await prisma.supplier.findMany({ select: { id: true } });
  const supplierIds = existing.map(s => s.id);
  console.log(`Found ${supplierIds.length} demo suppliers:`, supplierIds);

  if (supplierIds.length > 0) {
    // Delete PriceHistory and PriceSummaryCache (supplierId required)
    const phDel = await prisma.priceHistory.deleteMany({ where: { supplierId: { in: supplierIds } } });
    console.log(`Deleted PriceHistory: ${phDel.count}`);

    const pscDel = await prisma.priceSummaryCache.deleteMany({ where: { supplierId: { in: supplierIds } } });
    console.log(`Deleted PriceSummaryCache: ${pscDel.count}`);

    // Delete PurchaseDetails linked to PurchaseMasters of these suppliers
    const pms = await prisma.purchaseMaster.findMany({
      where: { supplierId: { in: supplierIds } },
      select: { id: true }
    });
    const pmIds = pms.map(p => p.id);
    if (pmIds.length > 0) {
      const pdDel = await prisma.purchaseDetail.deleteMany({ where: { purchaseId: { in: pmIds } } });
      console.log(`Deleted PurchaseDetails: ${pdDel.count}`);
      const pmDel = await prisma.purchaseMaster.deleteMany({ where: { id: { in: pmIds } } });
      console.log(`Deleted PurchaseMasters: ${pmDel.count}`);
    }

    // Delete engineering contracts (supplierId required)
    const ecDel = await prisma.engineeringContract.deleteMany({ where: { supplierId: { in: supplierIds } } });
    console.log(`Deleted EngineeringContracts: ${ecDel.count}`);

    // Delete all demo suppliers
    const sDel = await prisma.supplier.deleteMany({});
    console.log(`Deleted Suppliers: ${sDel.count}`);
  }

  // ── Step 2: Read Excel ────────────────────────────────────────────
  const wb = xlsx.readFile(XLSX_PATH);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(ws, { header: 1 });
  const data = rows.slice(2); // skip 2 header rows

  // Track seen taxIds to handle duplicates
  const seenTaxIds = new Set();

  const supplierData = [];
  let seq = 0;
  let skipped = 0;

  for (const row of data) {
    const name = row[3] ? String(row[3]).trim() : (row[2] ? String(row[2]).trim() : '');
    if (!name) { skipped++; continue; }

    seq++;
    const supplierCode = `SUP-${YYYYMM}-${String(seq).padStart(3, '0')}`;

    // taxId: convert numeric to string, handle duplicates
    let taxId = null;
    if (row[14] !== undefined && row[14] !== null && row[14] !== '') {
      const rawTaxId = String(row[14]).trim();
      if (rawTaxId && !seenTaxIds.has(rawTaxId)) {
        seenTaxIds.add(rawTaxId);
        taxId = rawTaxId;
      }
      // else: duplicate → leave taxId as null
    }

    const sortRaw = row[21];
    const sortOrder = sortRaw !== undefined && sortRaw !== null && sortRaw !== ''
      ? parseInt(String(sortRaw)) || null
      : null;

    supplierData.push({
      supplierCode,
      name,
      taxId,
      contact: row[7] ? String(row[7]).trim() : null,
      personInCharge: row[4] ? String(row[4]).trim() : null,
      phone: row[5] ? String(row[5]).trim() : null,
      address: row[16] ? String(row[16]).trim() : null,
      email: row[12] ? String(row[12]).trim() : null,
      paymentTerms: row[18] ? String(row[18]).trim() : null,
      checkPayee: row[15] ? String(row[15]).trim() : null,
      industryCategory: row[20] ? String(row[20]).trim() : null,
      sortOrder: isNaN(sortOrder) ? null : sortOrder,
      remarks: row[13] ? String(row[13]).trim() : null,
    });
  }

  console.log(`Excel: ${supplierData.length} valid rows, ${skipped} blank rows skipped`);

  // ── Step 3: Insert in chunks ──────────────────────────────────────
  const CHUNK = 100;
  let inserted = 0;
  for (let i = 0; i < supplierData.length; i += CHUNK) {
    const chunk = supplierData.slice(i, i + CHUNK);
    const result = await prisma.supplier.createMany({ data: chunk, skipDuplicates: true });
    inserted += result.count;
    console.log(`Inserted chunk ${Math.floor(i / CHUNK) + 1}: ${result.count}`);
  }

  console.log(`\nSupplier import complete. Total inserted: ${inserted}`);
  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e.message);
  prisma.$disconnect();
  process.exit(1);
});
