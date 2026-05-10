import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission, requireSession } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { nextCashTransactionNo } from '@/lib/sequence-generator';

export const dynamic = 'force-dynamic';

// Generate batch number: PMI-YYYYMMDD-XXX
async function generateBatchNo(businessDate) {
  const dateStr = (businessDate || new Date().toISOString().split('T')[0]).replace(/-/g, '');
  const prefix = `PMI-${dateStr}-`;

  // 取序號最大的一筆，避免載入所有批次再 loop
  const latest = await prisma.pmsImportBatch.findFirst({
    where: { batchNo: { startsWith: prefix } },
    orderBy: { batchNo: 'desc' },
    select: { batchNo: true },
  });

  const maxSeq = latest ? (parseInt(latest.batchNo.substring(prefix.length)) || 0) : 0;
  return `${prefix}${String(maxSeq + 1).padStart(3, '0')}`;
}

// GET: List import batches with filters
export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.PMS_VIEW);
  if (!auth.ok) return auth.response;
  
  try {
    const { searchParams } = new URL(request.url);
    const warehouse = searchParams.get('warehouse');
    const year = searchParams.get('year');
    const month = searchParams.get('month');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    const where = {};
    if (warehouse) where.warehouse = warehouse;

    // Filter by date range (for settlement)
    if (startDate && endDate) {
      where.businessDate = { gte: startDate, lte: endDate };
    } else if (year && month) {
      // Filter by year/month using businessDate string pattern
      const monthStr = String(month).padStart(2, '0');
      where.businessDate = { startsWith: `${year}-${monthStr}` };
    } else if (year) {
      where.businessDate = { startsWith: `${year}-` };
    }

    const batches = await prisma.pmsImportBatch.findMany({
      where,
      include: {
        _count: { select: { records: true } }
      },
      orderBy: { importedAt: 'desc' },
      take: 500,
    });

    // Attach credit card reconciliation status for each batch
    // Match on warehouse + billingDate == businessDate (same-day settlement)
    const businessDates = [...new Set(batches.map(b => b.businessDate))];
    const ccStatements = businessDates.length > 0
      ? await prisma.creditCardStatement.findMany({
          where: {
            billingDate: { in: businessDates.map(d => d.replace(/-/g, '/')) },
          },
          select: { warehouse: true, billingDate: true, status: true, totalFee: true, netAmount: true },
        })
      : [];

    // Index by warehouse+date for O(1) lookup
    const ccMap = {};
    for (const cc of ccStatements) {
      const key = `${cc.warehouse}|${cc.billingDate.replace(/\//g, '-')}`;
      // Keep highest-priority status (confirmed > matched > pending)
      const priority = { confirmed: 3, matched: 2, pending: 1 };
      if (!ccMap[key] || (priority[cc.status] || 0) > (priority[ccMap[key].status] || 0)) {
        ccMap[key] = cc;
      }
    }

    const result = batches.map(b => {
      const cc = ccMap[`${b.warehouse}|${b.businessDate}`] || null;
      return {
        ...b,
        creditTotal: Number(b.creditTotal),
        debitTotal: Number(b.debitTotal),
        difference: Number(b.difference),
        occupancyRate: b.occupancyRate ? Number(b.occupancyRate) : null,
        avgRoomRate: b.avgRoomRate ? Number(b.avgRoomRate) : null,
        roomRevenue: b.roomRevenue ? Number(b.roomRevenue) : null,
        monthlyCreditTotal: b.monthlyCreditTotal ? Number(b.monthlyCreditTotal) : null,
        monthlyDebitTotal: b.monthlyDebitTotal ? Number(b.monthlyDebitTotal) : null,
        importedAt: b.importedAt.toISOString(),
        recordCount: b._count.records,
        ccReconciliation: cc
          ? { status: cc.status, totalFee: Number(cc.totalFee), netAmount: Number(cc.netAmount) }
          : null,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

// POST: Handle PMS report upload and import（登入即可存檔，供會計確認匯入）
export async function POST(request) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  
  try {
    const data = await request.json();

    if (!data.warehouse || !data.businessDate || !data.fileName || !data.records || !Array.isArray(data.records)) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '館別、營業日期、檔案名稱、記錄陣列為必填', 400);
    }

    if (data.records.length === 0) {
      return createErrorResponse('VALIDATION_FAILED', '記錄不可為空', 400);
    }

    // Validate each record (accountingCode/accountingName 可為空 — 對應 Excel 中未對應到會計科目的欄位)
    for (const rec of data.records) {
      if (!rec.pmsColumnName || !rec.entryType || rec.amount === undefined) {
        return createErrorResponse('REQUIRED_FIELD_MISSING', '每筆記錄需包含 pmsColumnName, entryType, amount', 400);
      }
    }

    const reservationRows = Array.isArray(data.reservationRows) ? data.reservationRows : [];

    // Pre-load travel agency configs for source classification (outside transaction)
    const travelAgencies = await prisma.travelAgencyCommissionConfig.findMany({
      where: { isActive: true },
      select: { companyName: true },
    });
    const agencyNames = new Set(travelAgencies.map(a => a.companyName.trim()));

    // Find primary bank account for this warehouse (for auto CashTransactions)
    const bankAccount = await prisma.cashAccount.findFirst({
      where: { warehouse: data.warehouse, type: '銀行存款', isActive: true },
      select: { id: true },
    });

    function classifySource(row) {
      const company = (row.companyName || '').trim();
      const discount = (row.discountName || '').trim();
      // Company name takes priority — check specific OTAs before generic NET- pattern
      if (/agoda/i.test(company)) return 'OTA-Agoda';
      if (/expedia/i.test(company)) return 'OTA-Expedia';
      if (/攜程/.test(company)) return '攜程網';
      if (/易遊/.test(company)) return '易遊網';
      if (/一般散客/.test(company)) return '一般散客';
      if (/月租/.test(company)) return '月租';
      // Generic OTA indicators (NET- prefix / "booking" keyword)
      if (/NET-/i.test(discount) || /booking/i.test(company) || /booking/i.test(discount)) return 'OTA-Booking';
      if (/agoda/i.test(discount)) return 'OTA-Agoda';
      if (/expedia/i.test(discount)) return 'OTA-Expedia';
      if (agencyNames.has(company)) return '代訂中心';
      if (/月租/.test(discount)) return '月租';
      return '電話';
    }

    const result = await prisma.$transaction(async (tx) => {
      // Check for duplicate (same warehouse + businessDate)
      const existing = await tx.pmsImportBatch.findUnique({
        where: {
          warehouse_businessDate: {
            warehouse: data.warehouse,
            businessDate: data.businessDate
          }
        }
      });

      // If exists, delete old batch (cascade deletes records)
      if (existing) {
        await tx.pmsImportBatch.delete({
          where: { id: existing.id }
        });
      }

      // Generate batch number
      const batchNo = await generateBatchNo(data.businessDate);

      // Calculate totals if not provided
      let creditTotal = parseFloat(data.creditTotal) || 0;
      let debitTotal = parseFloat(data.debitTotal) || 0;
      if (!data.creditTotal && !data.debitTotal) {
        for (const rec of data.records) {
          if (rec.entryType === '貸方') creditTotal += parseFloat(rec.amount) || 0;
          if (rec.entryType === '借方') debitTotal += parseFloat(rec.amount) || 0;
        }
      }
      const difference = parseFloat(data.difference) ?? (creditTotal - debitTotal);

      // Create batch
      const batch = await tx.pmsImportBatch.create({
        data: {
          batchNo,
          warehouse: data.warehouse,
          businessDate: data.businessDate,
          fileName: data.fileName,
          status: '已匯入',
          recordCount: data.records.length,
          creditTotal,
          debitTotal,
          difference,
          roomCount: data.roomCount ? parseInt(data.roomCount) : null,
          occupancyRate: data.occupancyRate ? parseFloat(data.occupancyRate) : null,
          avgRoomRate: data.avgRoomRate ? parseFloat(data.avgRoomRate) : null,
          roomRevenue: data.roomRevenue ? parseFloat(data.roomRevenue) : null,
          guestCount: data.guestCount != null && data.guestCount !== '' ? parseInt(data.guestCount) : null,
          breakfastCount: data.breakfastCount != null && data.breakfastCount !== '' ? parseInt(data.breakfastCount) : null,
          occupiedRooms: data.occupiedRooms != null && data.occupiedRooms !== '' ? parseInt(data.occupiedRooms) : null,
          reservationCount: reservationRows.length,
          hasReservationRows: reservationRows.length > 0,
        }
      });

      // Create all income records (空字串的 accountingCode/Name 正規化為 null)
      const recordsData = data.records.map(rec => ({
        importBatchId: batch.id,
        warehouse: data.warehouse,
        businessDate: data.businessDate,
        entryType: rec.entryType,
        pmsColumnName: rec.pmsColumnName,
        amount: parseFloat(rec.amount),
        accountingCode: rec.accountingCode || null,
        accountingName: rec.accountingName || null,
        note: rec.note || null,
        isModified: false
      }));

      await tx.pmsIncomeRecord.createMany({ data: recordsData });

      // Create reservation records + auto cash transactions
      const autoTxIds = [];
      for (const row of reservationRows) {
        const source = classifySource(row);

        const reservation = await tx.pmsReservationRecord.create({
          data: {
            batchId: batch.id,
            warehouse: data.warehouse,
            businessDate: data.businessDate,
            reservationNo:  row.reservationNo || null,
            bookingNo:      row.bookingNo || null,
            roomNo:         row.roomNo || null,
            roomType:       row.roomType || null,
            guestName:      row.guestName || null,
            companyName:    row.companyName || null,
            discountName:   row.discountName || null,
            checkIn:        row.checkIn || null,
            checkOut:       row.checkOut || null,
            roomRate:       parseFloat(row.roomRate) || 0,
            serviceFee:     parseFloat(row.serviceFee) || 0,
            otherCharges:   parseFloat(row.otherCharges) || 0,
            totalRevenue:   parseFloat(row.totalRevenue) || 0,
            cash:           parseFloat(row.cash) || 0,
            creditCard:     parseFloat(row.creditCard) || 0,
            wireTransfer:   parseFloat(row.wireTransfer) || 0,
            commission:     parseFloat(row.commission) || 0,
            discount:       parseFloat(row.discount) || 0,
            complimentary:  parseFloat(row.complimentary) || 0,
            depositIn:      parseFloat(row.depositIn) || 0,
            depositOut:     parseFloat(row.depositOut) || 0,
            receivable:     parseFloat(row.receivable) || 0,
            voucher:        parseFloat(row.voucher) || 0,
            source,
            note:           row.note || null,
            invoiceNo:      row.invoiceNo || null,
          },
        });

        const rowTxIds = [];

        // Auto CashTransaction only when a bank account is configured for this warehouse
        if (bankAccount) {
          const cashAmt = parseFloat(row.cash) || 0;
          if (cashAmt > 0) {
            const txNo = await nextCashTransactionNo(tx, data.businessDate);
            const cashTx = await tx.cashTransaction.create({
              data: {
                transactionNo: txNo,
                transactionDate: data.businessDate,
                type: '收入',
                amount: cashAmt,
                accountId: bankAccount.id,
                description: `PMS 現金收入 - ${row.guestName || row.reservationNo || ''}`,
                warehouse: data.warehouse,
                isAutoCreated: true,
                sourceType: 'PmsReservation',
                sourceRecordId: reservation.id,
              },
            });
            rowTxIds.push(cashTx.id);
            autoTxIds.push(cashTx.id);
          }

          const wireAmt = parseFloat(row.wireTransfer) || 0;
          if (wireAmt > 0) {
            const txNo = await nextCashTransactionNo(tx, data.businessDate);
            const wireTx = await tx.cashTransaction.create({
              data: {
                transactionNo: txNo,
                transactionDate: data.businessDate,
                type: '收入',
                amount: wireAmt,
                accountId: bankAccount.id,
                description: `PMS 轉帳/ATM收入 - ${row.guestName || row.reservationNo || ''}${row.note ? ` [${row.note}]` : ''}`,
                warehouse: data.warehouse,
                isAutoCreated: true,
                sourceType: 'PmsReservation',
                sourceRecordId: reservation.id,
              },
            });
            rowTxIds.push(wireTx.id);
            autoTxIds.push(wireTx.id);
          }
        }

        // Update reservation with cashTransactionIds (deprecated field, kept for compat)
        // and populate junction table
        if (rowTxIds.length > 0) {
          await tx.pmsReservationRecord.update({
            where: { id: reservation.id },
            data: { cashTransactionIds: rowTxIds.join(',') },
          });
          await tx.pmsReservationCashLink.createMany({
            data: rowTxIds.map(txId => ({ reservationId: reservation.id, cashTransactionId: txId })),
            skipDuplicates: true,
          });
        }
      }

      // Return batch with record count
      return {
        ...batch,
        creditTotal: Number(batch.creditTotal),
        debitTotal: Number(batch.debitTotal),
        difference: Number(batch.difference),
        occupancyRate: batch.occupancyRate ? Number(batch.occupancyRate) : null,
        avgRoomRate: batch.avgRoomRate ? Number(batch.avgRoomRate) : null,
        importedAt: batch.importedAt.toISOString(),
        recordCount: data.records.length,
        reservationCount: reservationRows.length,
        autoTxCount: autoTxIds.length,
        isReplacement: !!existing
      };
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
