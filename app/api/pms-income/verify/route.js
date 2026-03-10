import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

// POST: 飯店會計核對批次 (verify batches for a month)
export async function POST(request) {
  const auth = await requireAnyPermission([PERMISSIONS.PMS_IMPORT, PERMISSIONS.SETTINGS_EDIT]);
  if (!auth.ok) return auth.response;

  try {
    const data = await request.json();
    const { action, warehouse, yearMonth, batchIds } = data;

    if (action === 'verify_batches') {
      // Verify specific batches
      if (!batchIds || !Array.isArray(batchIds) || batchIds.length === 0) {
        return createErrorResponse('REQUIRED_FIELD_MISSING', '請選擇要核對的批次', 400);
      }

      const ids = batchIds.map(id => parseInt(id));
      const batches = await prisma.pmsImportBatch.findMany({
        where: { id: { in: ids }, status: '已匯入' }
      });

      if (batches.length === 0) {
        return createErrorResponse('NOT_FOUND', '找不到待核對的批次', 404);
      }

      const userName = auth.user?.name || auth.user?.email || 'system';

      await prisma.pmsImportBatch.updateMany({
        where: { id: { in: ids }, status: '已匯入' },
        data: {
          status: '已核對',
          verifiedBy: userName,
          verifiedAt: new Date()
        }
      });

      return NextResponse.json({
        success: true,
        verified: batches.length,
        message: `已核對 ${batches.length} 個批次`
      });
    }

    if (action === 'verify_month') {
      // Verify all batches for a warehouse + month
      if (!warehouse || !yearMonth) {
        return createErrorResponse('REQUIRED_FIELD_MISSING', '請指定館別和月份', 400);
      }

      // yearMonth format: "2026-03"
      const startDate = `${yearMonth}-01`;
      const [y, m] = yearMonth.split('-').map(Number);
      const lastDay = new Date(y, m, 0).getDate();
      const endDate = `${yearMonth}-${String(lastDay).padStart(2, '0')}`;

      const batches = await prisma.pmsImportBatch.findMany({
        where: {
          warehouse,
          businessDate: { gte: startDate, lte: endDate },
          status: '已匯入'
        }
      });

      if (batches.length === 0) {
        return createErrorResponse('NOT_FOUND', '此月份無待核對批次', 404);
      }

      const userName = auth.user?.name || auth.user?.email || 'system';

      await prisma.pmsImportBatch.updateMany({
        where: {
          warehouse,
          businessDate: { gte: startDate, lte: endDate },
          status: '已匯入'
        },
        data: {
          status: '已核對',
          verifiedBy: userName,
          verifiedAt: new Date()
        }
      });

      // Upsert monthly settlement record
      const creditTotal = batches.reduce((s, b) => s + Number(b.creditTotal), 0);
      const debitTotal = batches.reduce((s, b) => s + Number(b.debitTotal), 0);

      await prisma.pmsMonthlySettlement.upsert({
        where: { warehouse_settlementMonth: { warehouse, settlementMonth: yearMonth } },
        update: {
          status: '已核對',
          creditTotal,
          debitTotal,
          batchCount: batches.length,
          verifiedBy: userName,
          verifiedAt: new Date()
        },
        create: {
          warehouse,
          settlementMonth: yearMonth,
          status: '已核對',
          creditTotal,
          debitTotal,
          batchCount: batches.length,
          verifiedBy: userName,
          verifiedAt: new Date()
        }
      });

      return NextResponse.json({
        success: true,
        verified: batches.length,
        creditTotal,
        debitTotal,
        message: `${warehouse} ${yearMonth} 已核對 ${batches.length} 個批次`
      });
    }

    if (action === 'unverify_batches') {
      // Revert verified batches back to 已匯入
      if (!batchIds || !Array.isArray(batchIds) || batchIds.length === 0) {
        return createErrorResponse('REQUIRED_FIELD_MISSING', '請選擇要取消核對的批次', 400);
      }

      const ids = batchIds.map(id => parseInt(id));
      await prisma.pmsImportBatch.updateMany({
        where: { id: { in: ids }, status: '已核對' },
        data: { status: '已匯入', verifiedBy: null, verifiedAt: null }
      });

      return NextResponse.json({ success: true, message: '已取消核對' });
    }

    return createErrorResponse('VALIDATION_FAILED', '未知的操作類型', 400);
  } catch (error) {
    return handleApiError(error);
  }
}
