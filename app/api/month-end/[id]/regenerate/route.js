import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { assertWarehouseAccess } from '@/lib/warehouse-access';
import { auditFromSession, AUDIT_ACTIONS } from '@/lib/audit';
import { generateMonthEndReports } from '@/lib/generate-month-end-reports';

export const dynamic = 'force-dynamic';

/**
 * POST /api/month-end/[id]/regenerate
 *
 * 重新產生月結報表 snapshot，適用於補資料後需要同步報表的情況。
 * 僅允許對「已結帳」月份操作；已鎖定月份必須先解鎖。
 */
export async function POST(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.MONTHEND_EXECUTE);
  if (!auth.ok) return auth.response;

  try {
    const id = parseInt((await params).id);
    if (!id) return createErrorResponse('VALIDATION_FAILED', '無效的ID', 400);

    const monthEnd = await prisma.monthEndStatus.findUnique({ where: { id } });
    if (!monthEnd) return createErrorResponse('NOT_FOUND', '找不到月結記錄', 404);

    if (monthEnd.warehouse) {
      const wa = assertWarehouseAccess(auth.session, monthEnd.warehouse);
      if (!wa.ok) return wa.response;
    }

    if (monthEnd.status === '已鎖定') {
      return createErrorResponse(
        'PERIOD_LOCKED',
        '已鎖定月份不可重新產生報表，請先解鎖後再操作',
        422
      );
    }
    if (monthEnd.status !== '已結帳') {
      return createErrorResponse(
        'VALIDATION_FAILED',
        '只有已結帳月份可重新產生報表',
        422
      );
    }

    const { year, month, warehouse } = monthEnd;
    const monthStr = String(month).padStart(2, '0');
    const periodStart = `${year}-${monthStr}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const periodEnd = `${year}-${monthStr}-${String(lastDay).padStart(2, '0')}`;

    const reports = await generateMonthEndReports(prisma, { year, month, monthStr, periodStart, periodEnd, warehouse });

    const createdReports = await prisma.$transaction(async (tx) => {
      // Delete stale snapshots
      await tx.monthEndReport.deleteMany({ where: { monthEndId: id } });

      // Insert fresh snapshots
      const results = [];
      for (const report of reports) {
        const r = await tx.monthEndReport.create({
          data: {
            monthEndId: id,
            reportType: report.reportType,
            year,
            month,
            warehouse: warehouse || null,
            reportData: report.data,
          }
        });
        results.push({ id: r.id, reportType: r.reportType, generatedAt: r.generatedAt.toISOString() });
      }
      return results;
    });

    auditFromSession(prisma, auth.session, {
      action: AUDIT_ACTIONS.MONTH_END_CLOSE,
      targetModule: 'month-end',
      targetRecordId: id,
      afterState: { year, month, warehouse, reportCount: createdReports.length },
      note: `重新產生 ${year}/${monthStr} 月結報表（共 ${createdReports.length} 份）`,
    }).catch(e => console.error('[AUDIT_FAIL] month-end regenerate:', e.message));

    return NextResponse.json({
      success: true,
      year,
      month,
      warehouse: warehouse || null,
      reports: createdReports,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
