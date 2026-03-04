import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

// GET: Get a specific month-end report by ID
export async function GET(request, { params }) {
  try {
    const id = parseInt(params.id);
    if (!id) {
      return createErrorResponse('VALIDATION_FAILED', '無效的報表ID', 400);
    }

    const report = await prisma.monthEndReport.findUnique({
      where: { id },
      include: {
        monthEnd: {
          select: {
            id: true,
            year: true,
            month: true,
            warehouse: true,
            status: true,
            closedBy: true,
            closedAt: true
          }
        }
      }
    });

    if (!report) {
      return createErrorResponse('NOT_FOUND', '找不到報表', 404);
    }

    return NextResponse.json({
      id: report.id,
      reportType: report.reportType,
      year: report.year,
      month: report.month,
      warehouse: report.warehouse,
      reportData: report.reportData,
      generatedAt: report.generatedAt.toISOString(),
      monthEnd: {
        id: report.monthEnd.id,
        year: report.monthEnd.year,
        month: report.monthEnd.month,
        warehouse: report.monthEnd.warehouse,
        status: report.monthEnd.status,
        closedBy: report.monthEnd.closedBy,
        closedAt: report.monthEnd.closedAt ? report.monthEnd.closedAt.toISOString() : null
      }
    });
  } catch (error) {
    return handleApiError(error);
  }
}
