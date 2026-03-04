import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

// GET: Get month-end details with reports
export async function GET(request, { params }) {
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
  try {
    const id = parseInt(params.id);
    if (!id) {
      return createErrorResponse('VALIDATION_FAILED', '無效的ID', 400);
    }

    const body = await request.json();
    const { action } = body;

    const monthEnd = await prisma.monthEndStatus.findUnique({
      where: { id }
    });

    if (!monthEnd) {
      return createErrorResponse('NOT_FOUND', '找不到月結記錄', 404);
    }

    if (action === 'lock') {
      // Lock the period: status must be '已結帳'
      if (monthEnd.status !== '已結帳') {
        return createErrorResponse('VALIDATION_FAILED', '只能鎖定已結帳的月份', 400);
      }

      const updated = await prisma.monthEndStatus.update({
        where: { id },
        data: {
          status: '已鎖定',
          lockedAt: new Date()
        }
      });

      return NextResponse.json({
        success: true,
        id: updated.id,
        status: updated.status,
        lockedAt: updated.lockedAt.toISOString()
      });

    } else if (action === 'unlock') {
      // Unlock: status must be '已結帳' or '已鎖定'
      if (!['已結帳', '已鎖定'].includes(monthEnd.status)) {
        return createErrorResponse('VALIDATION_FAILED', '此月份無法解鎖', 400);
      }

      const { unlockedBy, unlockReason } = body;
      if (!unlockReason) {
        return createErrorResponse('REQUIRED_FIELD_MISSING', '解鎖需要提供原因', 400);
      }

      const updated = await prisma.monthEndStatus.update({
        where: { id },
        data: {
          status: '未結帳',
          unlockedBy: unlockedBy || null,
          unlockedAt: new Date(),
          unlockReason
        }
      });

      return NextResponse.json({
        success: true,
        id: updated.id,
        status: updated.status,
        unlockedAt: updated.unlockedAt.toISOString(),
        unlockedBy: updated.unlockedBy,
        unlockReason: updated.unlockReason
      });

    } else {
      return createErrorResponse('VALIDATION_FAILED', '不支援的操作', 400);
    }
  } catch (error) {
    return handleApiError(error);
  }
}
