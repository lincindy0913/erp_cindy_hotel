/**
 * import-purchase-invoice.js  (v2 — batched, connection-safe)
 *
 * Imports 進貨單 (PurchaseMaster + PurchaseDetail) and
 * 發票登錄 (SalesMaster + SalesDetail) from 進銷存明細.xlsx.
 *
 * Run: node prisma/import-purchase-invoice.js
 */

const XLSX = require('xlsx');
const path = require('path');
const { PrismaClient } = require('../node_modules/@prisma/client');

const EXCEL_PATH = path.join(__dirname, '..', '進銷存明細.xlsx');
const BATCH_SIZE = 30;   // creates per transaction batch
const BATCH_DELAY = 300; // ms pause between batches

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Fresh client per reconnect
function makeClient() { return new PrismaClient({ log: [] }); }
let prisma = makeClient();

// Retry wrapper — reconnects on connection drop
async function dbRetry(fn, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try { return await fn(prisma); }
    catch (e) {
      const isConn = e.message?.includes("Can't reach") || e.message?.includes('closed the connection');
      if (isConn && i < retries - 1) {
        console.warn(`  [retry ${i + 1}] DB connection lost, reconnecting…`);
        try { await prisma.$disconnect(); } catch {}
        await sleep(2000);
        prisma = makeClient();
      } else throw e;
    }
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

function excelDateToISO(serial) {
  if (!serial || typeof serial !== 'number') return null;
  return new Date((serial - 25569) * 86400 * 1000).toISOString().split('T')[0];
}

function extractProductCode(col1) {
  const m = String(col1 || '').trim().match(/^([A-Z0-9]+)\s/);
  return m ? m[1] : null;
}

function parsePurchaseNo(purchaseNo) {
  const m = String(purchaseNo || '').trim().match(/^(\d{6})-(.+)$/);
  return m ? { dateStr: m[1], invoiceNo: m[2] } : null;
}

// ── load Excel ────────────────────────────────────────────────────────────────

const wb   = XLSX.readFile(EXCEL_PATH);
const ws   = wb.Sheets['進貨紀錄 '];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }).slice(2)
               .filter(r => r[21] && String(r[21]).trim());

// Group by purchaseNo
const orderMap = new Map();
for (const r of rows) {
  const purchaseNo = String(r[21]).trim();
  if (!parsePurchaseNo(purchaseNo)) continue;
  if (!orderMap.has(purchaseNo)) {
    orderMap.set(purchaseNo, {
      purchaseNo,
      invoiceNo:          parsePurchaseNo(purchaseNo).invoiceNo,
      date:               excelDateToISO(r[22]),
      supplier:           String(r[23] || '').trim(),
      hall:               String(r[25] || '').trim(),
      dept:               String(r[26] || '').trim(),
      totalFromExcel:     0,
      taxFromExcel:       0,
      grandTotalFromExcel:0,
      lines: [],
    });
  }
  const o = orderMap.get(purchaseNo);
  if (Number(r[14])) o.totalFromExcel       = Number(r[14]);
  if (Number(r[16])) o.taxFromExcel          = Number(r[16]);
  if (Number(r[18])) o.grandTotalFromExcel   = Number(r[18]);
  o.lines.push({
    productCol1: r[1],
    qty:    Number(r[6]) || 0,
    price:  Number(r[5]) || 0,
    amount: Number(r[7]) || 0,
    note:   String(r[8] || '').trim(),
  });
}

console.log(`\n=== Excel 進貨單: ${orderMap.size} unique purchaseNos ===`);

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {

  // ── 1. Supplier map (existing + create missing) ───────────────────────────

  const allSupNames = [...new Set([...orderMap.values()].map(o => o.supplier).filter(Boolean))];
  const existingSup = await dbRetry(p =>
    p.supplier.findMany({ where: { name: { in: allSupNames } }, select: { id: true, name: true } })
  );
  const supplierByName = new Map(existingSup.map(s => [s.name, s.id]));

  const missingSups = allSupNames.filter(n => !supplierByName.has(n));
  console.log(`Suppliers: ${existingSup.length} found, ${missingSups.length} to create`);

  if (missingSups.length > 0) {
    const latest = await dbRetry(p =>
      p.supplier.findFirst({ where: { supplierCode: { not: null } }, orderBy: { id: 'desc' }, select: { supplierCode: true } })
    );
    let seq = 416;
    if (latest?.supplierCode) { const m = String(latest.supplierCode).match(/(\d+)$/); if (m) seq = parseInt(m[1]) + 1; }
    const ym = new Date().toISOString().slice(0, 7).replace('-', '');
    for (const name of missingSups) {
      const code = `SUP-${ym}-${String(seq++).padStart(3, '0')}`;
      const c = await dbRetry(p => p.supplier.create({ data: { name, supplierCode: code }, select: { id: true } }));
      supplierByName.set(name, c.id);
      console.log(`  Created: ${name} (${code})`);
    }
  }

  // ── 2. Product map ────────────────────────────────────────────────────────

  const allCodes = [...new Set(
    [...orderMap.values()].flatMap(o => o.lines.map(l => extractProductCode(l.productCol1)).filter(Boolean))
  )];
  const existingProds = await dbRetry(p =>
    p.product.findMany({ where: { code: { in: allCodes } }, select: { id: true, code: true } })
  );
  const productByCode = new Map(existingProds.map(p => [p.code, p.id]));
  const missingCodes  = allCodes.filter(c => !productByCode.has(c));
  console.log(`Products: ${existingProds.length} matched, ${missingCodes.length} codes missing (lines skipped)`);

  // ── 3. PurchaseMaster + PurchaseDetail ────────────────────────────────────

  console.log('\n=== Importing PurchaseMaster + PurchaseDetail ===');

  // Fetch all existing purchaseNos AND their IDs in one query
  const existingPMs = await dbRetry(p =>
    p.purchaseMaster.findMany({ select: { id: true, purchaseNo: true } })
  );
  const purchaseNoToId = new Map(existingPMs.map(r => [r.purchaseNo, r.id]));
  console.log(`Already in DB: ${existingPMs.length}`);

  const toInsert = [...orderMap.values()].filter(o => !purchaseNoToId.has(o.purchaseNo));
  console.log(`To insert: ${toInsert.length}`);

  let pmInserted = 0, pmSkipped = 0, pdSkipped = 0;

  for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
    const batch = toInsert.slice(i, i + BATCH_SIZE);
    const creates = [];

    for (const order of batch) {
      const supplierId = supplierByName.get(order.supplier);
      if (!supplierId) { pmSkipped++; continue; }

      const validLines = order.lines
        .filter(l => productByCode.has(extractProductCode(l.productCol1)))
        .map(l => ({
          productId: productByCode.get(extractProductCode(l.productCol1)),
          quantity:  l.qty   || 1,
          unitPrice: l.price || 0,
          note:      l.note  || '',
          status:    '已入庫',
        }));

      pdSkipped += order.lines.length - validLines.length;
      if (validLines.length === 0) { pmSkipped++; continue; }

      const lineSum     = order.lines.reduce((s, l) => s + l.amount, 0);
      const amount      = order.totalFromExcel      || lineSum;
      const tax         = order.taxFromExcel         || 0;
      const totalAmount = order.grandTotalFromExcel  || (amount + tax);

      creates.push(
        prisma.purchaseMaster.create({
          data: {
            purchaseNo:   order.purchaseNo,
            warehouse:    order.hall || '',
            department:   order.dept || '',
            supplierId,
            purchaseDate: order.date || new Date().toISOString().split('T')[0],
            paymentTerms: '月結',
            taxType:      tax > 0 ? '外加' : null,
            amount, tax, totalAmount,
            status:  '已入庫',
            details: { create: validLines },
          },
          select: { id: true, purchaseNo: true },
        })
      );
    }

    if (creates.length === 0) continue;

    try {
      const results = await dbRetry(p => p.$transaction(creates));
      for (const r of results) purchaseNoToId.set(r.purchaseNo, r.id);
      pmInserted += creates.length;
    } catch (e) {
      console.error(`  Batch ${Math.floor(i / BATCH_SIZE) + 1} error:`, e.message.slice(0, 120));
      pmSkipped += creates.length;
    }

    process.stdout.write(`\r  Progress: ${Math.min(i + BATCH_SIZE, toInsert.length)}/${toInsert.length}`);
    await sleep(BATCH_DELAY);
  }

  console.log(`\n  PurchaseMaster: ${pmInserted} inserted, ${pmSkipped} skipped`);
  console.log(`  PurchaseDetail lines skipped (missing product): ${pdSkipped}`);

  // ── 4. SalesMaster + SalesDetail (one per unique invoiceNo) ───────────────

  console.log('\n=== Importing SalesMaster + SalesDetail ===');

  const invoiceMap = new Map();
  for (const order of orderMap.values()) {
    if (!invoiceMap.has(order.invoiceNo)) invoiceMap.set(order.invoiceNo, []);
    invoiceMap.get(order.invoiceNo).push(order);
  }

  const existingInvNos = new Set(
    (await dbRetry(p =>
      p.salesMaster.findMany({ where: { invoiceType: '進貨單' }, select: { invoiceNo: true } })
    )).map(s => s.invoiceNo)
  );

  const todayStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const invPrefix = `INV-${todayStr}-`;
  let invSeq = (await dbRetry(p =>
    p.salesMaster.count({ where: { salesNo: { startsWith: invPrefix } } })
  )) + 1;

  const invoicesToCreate = [...invoiceMap.entries()].filter(([inv]) => !existingInvNos.has(inv));
  console.log(`Already in DB: ${existingInvNos.size} | To insert: ${invoicesToCreate.length}`);

  let smInserted = 0, smSkipped = 0;

  for (let i = 0; i < invoicesToCreate.length; i += BATCH_SIZE) {
    const batch = invoicesToCreate.slice(i, i + BATCH_SIZE);
    const creates = [];

    for (const [invoiceNo, orders] of batch) {
      const dates       = orders.map(o => o.date).filter(Boolean).sort();
      const invoiceDate = dates[dates.length - 1] || orders[0].date;

      const hallCounts = {};
      for (const o of orders) if (o.hall) hallCounts[o.hall] = (hallCounts[o.hall] || 0) + 1;
      const invoiceTitle = Object.entries(hallCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '';

      const amount      = orders.reduce((s, o) => s + (o.totalFromExcel      || o.lines.reduce((ls, l) => ls + l.amount, 0)), 0);
      const tax         = orders.reduce((s, o) => s + o.taxFromExcel, 0);
      const totalAmount = orders.reduce((s, o) => s + (o.grandTotalFromExcel || o.totalFromExcel || o.lines.reduce((ls, l) => ls + l.amount, 0)), 0);

      const salesDetails = orders.flatMap((order, oi) =>
        order.lines.map((l, li) => {
          const code      = extractProductCode(l.productCol1);
          const productId = code ? (productByCode.get(code) || null) : null;
          return {
            purchaseItemId: `${order.purchaseNo}_${li}`,
            purchaseId:     purchaseNoToId.get(order.purchaseNo) || null,
            purchaseNo:     order.purchaseNo,
            purchaseDate:   order.date,
            warehouse:      order.hall,
            supplierId:     supplierByName.get(order.supplier) || null,
            productId,
            quantity:  l.qty   || null,
            unitPrice: l.price || null,
            subtotal:  l.amount || null,
          };
        })
      );

      const salesNo = `${invPrefix}${String(invSeq++).padStart(4, '0')}`;
      creates.push(
        prisma.salesMaster.create({
          data: {
            salesNo, invoiceNo, invoiceDate, invoiceTitle,
            taxType:      tax > 0 ? '外加' : null,
            invoiceAmount: totalAmount,
            amount, tax, totalAmount,
            status:      '待核銷',
            invoiceType: '進貨單',
            details: { create: salesDetails },
          },
          select: { id: true },
        })
      );
    }

    if (creates.length === 0) continue;

    try {
      await dbRetry(p => p.$transaction(creates));
      smInserted += creates.length;
    } catch (e) {
      console.error(`  SM batch ${Math.floor(i / BATCH_SIZE) + 1} error:`, e.message.slice(0, 120));
      smSkipped += creates.length;
    }

    process.stdout.write(`\r  Progress: ${Math.min(i + BATCH_SIZE, invoicesToCreate.length)}/${invoicesToCreate.length}`);
    await sleep(BATCH_DELAY);
  }

  console.log(`\n  SalesMaster: ${smInserted} inserted, ${smSkipped} skipped`);

  // ── Summary ───────────────────────────────────────────────────────────────

  const [pmTotal, smTotal, supTotal] = await Promise.all([
    dbRetry(p => p.purchaseMaster.count()),
    dbRetry(p => p.salesMaster.count()),
    dbRetry(p => p.supplier.count()),
  ]);

  console.log('\n=== 完成 ===');
  console.log(`Suppliers:      ${supTotal}`);
  console.log(`PurchaseMaster: ${pmTotal}`);
  console.log(`SalesMaster:    ${smTotal}`);

  await prisma.$disconnect();
}

main().catch(async e => {
  console.error('\nFatal:', e.message);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
