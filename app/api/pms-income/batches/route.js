import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission, requireSession } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

// Generate batch number: PMI-YYYYMMDD-XXX
async function generateBatchNo(businessDate) {
  const dateStr = (businessDate || new Date().toISOString().split('T')[0]).replace(/-/g, '');
  const prefix = `PMI-${dateStr}-`;

  const existing = await prisma.pmsImportBatch.findMany({
    where: { batchNo: { startsWith: prefix } },
    select: { batchNo: true }
  });

  let maxSeq = 0;
  for (const b of existing) {
    const seq = parseInt(b.batchNo.substring(prefix.length)) || 0;
    if (seq > maxSeq) maxSeq = seq;
  }

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
      orderBy: { importedAt: 'desc' }
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

    // Validate each record
    for (const rec of data.records) {
      if (!rec.pmsColumnName || !rec.entryType || rec.amount === undefined || !rec.accountingCode || !rec.accountingName) {
        return createErrorResponse('REQUIRED_FIELD_MISSING', '每筆記錄需包含 pmsColumnName, entryType, amount, accountingCode, accountingName', 400);
      }
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
        }
      });

      // Create all income records
      const recordsData = data.records.map(rec => ({
        importBatchId: batch.id,
        warehouse: data.warehouse,
        businessDate: data.businessDate,
        entryType: rec.entryType,
        pmsColumnName: rec.pmsColumnName,
        amount: parseFloat(rec.amount),
        accountingCode: rec.accountingCode,
        accountingName: rec.accountingName,
        note: rec.note || null,
        isModified: false
      }));

      await tx.pmsIncomeRecord.createMany({ data: recordsData });

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
        isReplacement: !!existing
      };
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
