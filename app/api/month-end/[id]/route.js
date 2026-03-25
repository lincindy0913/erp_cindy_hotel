import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { assertWarehouseAccess } from '@/lib/warehouse-access';
import { auditFromSession, AUDIT_ACTIONS } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// GET: Get month-end details with reports
export async function GET(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.MONTHEND_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const id = parseInt(params.id);
    if (!id) {
      return createErrorResponse('VALIDATION_FAILED', '無效的ID', 400);
    }

    const monthEnd = await prisma.monthEndStatus.findUnique({
      where: { id },
      include: {
        reports: {
          orderBy: { id: 'asc' }
        }
      }
    });

    if (!monthEnd) {
      return createErrorResponse('NOT_FOUND', '找不到月結記錄', 404);
    }

    if (monthEnd.warehouse) {
      const wa = assertWarehouseAccess(auth.session, monthEnd.warehouse);
      if (!wa.ok) return wa.response;
    }

    return NextResponse.json({
      id: monthEnd.id,
      year: monthEnd.year,
      month: monthEnd.month,
      warehouse: monthEnd.warehouse,
      status: monthEnd.status,
      closedBy: monthEnd.closedBy,
      closedAt: monthEnd.closedAt ? monthEnd.closedAt.toISOString() : null,
      lockedAt: monthEnd.lockedAt ? monthEnd.lockedAt.toISOString() : null,
      unlockedBy: monthEnd.unlockedBy,
      unlockedAt: monthEnd.unlockedAt ? monthEnd.unlockedAt.toISOString() : null,
      unlockReason: monthEnd.unlockReason,
      note: monthEnd.note,
      reports: monthEnd.reports.map(r => ({
        id: r.id,
        reportType: r.reportType,
        year: r.year,
        month: r.month,
        warehouse: r.warehouse,
        reportData: r.reportData,
        generatedAt: r.generatedAt.toISOString()
      }))
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// PUT: Update month-end status (lock / unlock)
export async function PUT(request, { params }) {
  const authPut = await requirePermission(PERMISSIONS.MONTHEND_EXECUTE);
  if (!authPut.ok) return authPut.response;

  try {
    const session = authPut.session;
    const id = parseInt(params.id);
    if (!id) {
      return createErrorResponse('VALIDATION_FAILED', '無效的ID', 400);
    }

    const body = await request.json();
    const { action } = body;

    // Pre-read for warehouse access check (outside transaction is fine for authz)
    const monthEndCheck = await prisma.monthEndStatus.findUnique({
      where: { id }
    });
    if (!monthEndCheck) {
      return createErrorResponse('NOT_FOUND', '找不到月結記錄', 404);
    }
    if (monthEndCheck.warehouse) {
      const wa = assertWarehouseAccess(session, monthEndCheck.warehouse);
      if (!wa.ok) return wa.response;
    }

    const operatorName = session?.user?.name || session?.user?.email || null;

    if (action === 'lock') {
      const updated = await prisma.$transaction(async (tx) => {
        // Re-read inside transaction for atomicity
        const monthEnd = await tx.monthEndStatus.findUnique({ where: { id } });
        if (!monthEnd) throw new Error('NOT_FOUND:找不到月結記錄');

        // 冪等：已鎖定 → 直接回傳成功
        if (monthEnd.status === '已鎖定') {
          return { idempotent: true, monthEnd };
        }
        if (monthEnd.status !== '已結帳') {
          throw new Error('VALIDATION:只能鎖定已結帳的月份');
        }

        return {
          idempotent: false,
          monthEnd: await tx.monthEndStatus.update({
            where: { id },
            data: {
              status: '已鎖定',
              lockedAt: new Date()
            }
          })
        };
      });

      if (!updated.idempotent) {
        await auditFromSession(prisma, session, {
          action: AUDIT_ACTIONS.MONTH_END_CLOSE,
          targetModule: 'month-end',
          targetRecordId: id,
          beforeState: { status: monthEndCheck.status, year: monthEndCheck.year, month: monthEndCheck.month },
          afterState: { status: '已鎖定' },
          note: `月結鎖定 ${monthEndCheck.year}/${monthEndCheck.month}`,
        });
      }

      return NextResponse.json({
        success: true,
        id: updated.monthEnd.id,
        status: updated.monthEnd.status,
        lockedAt: updated.monthEnd.lockedAt ? updated.monthEnd.lockedAt.toISOString() : null
      });

    } else if (action === 'unlock') {
      const { unlockReason } = body;
      if (!unlockReason) {
        return createErrorResponse('REQUIRED_FIELD_MISSING', '解鎖需要提供原因', 400);
      }

      const updated = await prisma.$transaction(async (tx) => {
        const monthEnd = await tx.monthEndStatus.findUnique({ where: { id } });
        if (!monthEnd) throw new Error('NOT_FOUND:找不到月結記錄');

        // 冪等：已是未結帳 → 直接回傳
        if (monthEnd.status === '未結帳') {
          return { idempotent: true, monthEnd };
        }
        if (!['已結帳', '已鎖定'].includes(monthEnd.status)) {
          throw new Error('VALIDATION:此月份無法解鎖');
        }

        return {
          idempotent: false,
          monthEnd: await tx.monthEndStatus.update({
            where: { id },
            data: {
              status: '未結帳',
              unlockedBy: operatorName,
              unlockedAt: new Date(),
              unlockReason
            }
          })
        };
      });

      if (!updated.idempotent) {
        await auditFromSession(prisma, session, {
          action: AUDIT_ACTIONS.MONTH_END_UNLOCK,
          targetModule: 'month-end',
          targetRecordId: id,
          beforeState: { status: monthEndCheck.status, year: monthEndCheck.year, month: monthEndCheck.month },
          afterState: { status: '未結帳', unlockedBy: operatorName, unlockReason },
          note: `月結解鎖 ${monthEndCheck.year}/${monthEndCheck.month}：${unlockReason}`,
        });
      }

      return NextResponse.json({
        success: true,
        id: updated.monthEnd.id,
        status: updated.monthEnd.status,
        unlockedAt: updated.monthEnd.unlockedAt ? updated.monthEnd.unlockedAt.toISOString() : null,
        unlockedBy: updated.monthEnd.unlockedBy,
        unlockReason: updated.monthEnd.unlockReason
      });

    } else {
      return createErrorResponse('VALIDATION_FAILED', '不支援的操作', 400);
    }
  } catch (error) {

    return handleApiError(error);
  }
}
