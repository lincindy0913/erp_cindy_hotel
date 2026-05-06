import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { applyWarehouseFilter } from '@/lib/warehouse-access';
import { assertPeriodOpen } from '@/lib/period-lock';

export const dynamic = 'force-dynamic';

/** 與飯店 PMS 日報／民宿分頁對應的預設篩選（OTA 訂金、佣金、代訂相關科目） */
function buildPresetCondition(preset) {
  if (!preset) return null;
  if (preset === 'otaDeposit') {
    return {
      OR: [
        { pmsColumnName: { contains: '訂金' } },
        { pmsColumnName: { contains: '預收' } },
        { pmsColumnName: { contains: '網訂' } },
        { pmsColumnName: { contains: '沖訂金' } },
        { pmsColumnName: { contains: '收訂金' } },
      ],
    };
  }
  if (preset === 'otaCommission') {
    return {
      OR: [
        { pmsColumnName: { contains: '佣金' } },
        { accountingCode: '6101' },
      ],
    };
  }
  if (preset === 'bookingCenter') {
    return {
      OR: [
        { pmsColumnName: { contains: '佣金' } },
        { pmsColumnName: { contains: '旅行社' } },
        { pmsColumnName: { contains: '代訂' } },
        { pmsColumnName: { contains: '網訂' } },
      ],
    };
  }
  return null;
}

// GET: List PMS income records with filters and pagination
export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.PMS_VIEW);
  if (!auth.ok) return auth.response;
  
  try {
    const { searchParams } = new URL(request.url);
    const warehouse = searchParams.get('warehouse');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const entryType = searchParams.get('entryType');
    const accountingCode = searchParams.get('accountingCode');
    const page = parseInt(searchParams.get('page')) || 1;
    const limit = parseInt(searchParams.get('limit')) || 50;

    const pmsColumnName = searchParams.get('pmsColumnName');
    const preset = searchParams.get('preset');

    const where = {};
    if (warehouse) where.warehouse = warehouse;
    if (entryType) where.entryType = entryType;
    if (accountingCode) where.accountingCode = accountingCode;
    if (pmsColumnName) where.pmsColumnName = { contains: pmsColumnName };

    // Warehouse-level access control
    const wf = applyWarehouseFilter(auth.session, where);
    if (!wf.ok) return wf.response;
    if (startDate && endDate) {
      where.businessDate = { gte: startDate, lte: endDate };
    } else if (startDate) {
      where.businessDate = { gte: startDate };
    } else if (endDate) {
      where.businessDate = { lte: endDate };
    }

    const presetCond = buildPresetCondition(preset);
    const finalWhere = presetCond ? { AND: [where, presetCond] } : where;

    const [records, total, sumAgg] = await Promise.all([
      prisma.pmsIncomeRecord.findMany({
        where: finalWhere,
        include: {
          importBatch: {
            select: { id: true, batchNo: true, fileName: true, status: true }
          }
        },
        orderBy: [{ businessDate: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.pmsIncomeRecord.count({ where: finalWhere }),
      prisma.pmsIncomeRecord.aggregate({
        where: finalWhere,
        _sum: { amount: true },
      }),
    ]);

    const result = records.map(r => ({
      ...r,
      amount: Number(r.amount),
      originalAmount: r.originalAmount ? Number(r.originalAmount) : null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString()
    }));

    return NextResponse.json({
      records: result,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      sumAmount: Number(sumAgg._sum.amount ?? 0),
      preset: preset || null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// POST: Create manual income record
export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.PMS_IMPORT);
  if (!auth.ok) return auth.response;
  
  try {
    const data = await request.json();

    if (!data.warehouse || !data.businessDate || !data.entryType || !data.pmsColumnName || data.amount === undefined || !data.accountingCode || !data.accountingName) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '館別、營業日期、借貸方、PMS欄位名、金額、會計科目代碼及名稱為必填', 400);
    }

    if (!['貸方', '借方'].includes(data.entryType)) {
      return createErrorResponse('VALIDATION_FAILED', '借貸方必須是「貸方」或「借方」', 400);
    }

    const record = await prisma.$transaction(async (tx) => {
      await assertPeriodOpen(tx, data.businessDate, data.warehouse);

      return tx.pmsIncomeRecord.create({
        data: {
          warehouse: data.warehouse,
          businessDate: data.businessDate,
          entryType: data.entryType,
          pmsColumnName: data.pmsColumnName,
          amount: parseFloat(data.amount),
          accountingCode: data.accountingCode,
          accountingName: data.accountingName,
          note: data.note || null,
          isModified: false
        }
      });
    });

    return NextResponse.json({
      ...record,
      amount: Number(record.amount),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString()
    }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
