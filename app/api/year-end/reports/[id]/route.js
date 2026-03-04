import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

// GET: Fetch a specific financial statement by ID
export async function GET(request, { params }) {
  try {
    const id = parseInt(params.id);
    if (!id) {
      return createErrorResponse('VALIDATION_FAILED', '無效的報表ID', 400);
    }

    const statement = await prisma.yearEndFinancialStatement.findUnique({
      where: { id },
      include: {
        yearEnd: {
          select: {
            id: true,
            year: true,
            status: true,
            rolledOverBy: true,
            rolledOverAt: true
          }
        }
      }
    });

    if (!statement) {
      return createErrorResponse('NOT_FOUND', '找不到財務報表', 404);
    }

    return NextResponse.json({
      id: statement.id,
      statementType: statement.statementType,
      statementData: statement.statementData,
      generatedAt: statement.generatedAt.toISOString(),
      generatedBy: statement.generatedBy,
      yearEnd: {
        id: statement.yearEnd.id,
        year: statement.yearEnd.year,
        status: statement.yearEnd.status,
        rolledOverBy: statement.yearEnd.rolledOverBy,
        rolledOverAt: statement.yearEnd.rolledOverAt ? statement.yearEnd.rolledOverAt.toISOString() : null
      }
    });
  } catch (error) {
    return handleApiError(error);
  }
}
