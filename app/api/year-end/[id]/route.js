import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

// GET: Fetch year-end record by ID with all relations
export async function GET(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.YEAREND_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const id = parseInt(params.id);
    if (!id) {
      return createErrorResponse('VALIDATION_FAILED', '無效的ID', 400);
    }

    const yearEnd = await prisma.yearEndRollover.findUnique({
      where: { id },
      include: {
        inventorySnapshots: {
          orderBy: { productCode: 'asc' }
        },
        balanceRecords: {
          orderBy: { accountName: 'asc' }
        },
        financialStatements: {
          orderBy: { statementType: 'asc' }
        }
      }
    });

    if (!yearEnd) {
      return createErrorResponse('NOT_FOUND', '找不到年度結轉記錄', 404);
    }

    return NextResponse.json({
      id: yearEnd.id,
      year: yearEnd.year,
      status: yearEnd.status,
      rolledOverBy: yearEnd.rolledOverBy,
      rolledOverAt: yearEnd.rolledOverAt ? yearEnd.rolledOverAt.toISOString() : null,
      preCheckResults: yearEnd.preCheckResults,
      completedSections: yearEnd.completedSections,
      retainedEarnings: yearEnd.retainedEarnings ? Number(yearEnd.retainedEarnings) : null,
      note: yearEnd.note,
      createdAt: yearEnd.createdAt.toISOString(),
      updatedAt: yearEnd.updatedAt.toISOString(),
      inventorySnapshots: yearEnd.inventorySnapshots.map(s => ({
        id: s.id,
        productId: s.productId,
        productCode: s.productCode,
        productName: s.productName,
        costPrice: Number(s.costPrice),
        closingQuantity: Number(s.closingQuantity),
        closingValue: Number(s.closingValue),
        isNegative: s.isNegative,
        adjustedToZero: s.adjustedToZero
      })),
      balanceRecords: yearEnd.balanceRecords.map(r => ({
        id: r.id,
        accountId: r.accountId,
        accountName: r.accountName,
        accountType: r.accountType,
        closingBalance: Number(r.closingBalance),
        nextYearOpeningBalance: Number(r.nextYearOpeningBalance)
      })),
      financialStatements: yearEnd.financialStatements.map(s => ({
        id: s.id,
        statementType: s.statementType,
        statementData: s.statementData,
        generatedAt: s.generatedAt.toISOString(),
        generatedBy: s.generatedBy
      }))
    });
  } catch (error) {
    return handleApiError(error);
  }
}
