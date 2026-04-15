/**
 * GET  /api/owner-companies        — 取得所有老闆公司清單
 * POST /api/owner-companies        — 新增一間公司
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requireAnyPermission([PERMISSIONS.OWNER_EXPENSE_VIEW, PERMISSIONS.OWNER_EXPENSE_CREATE, PERMISSIONS.OWNER_EXPENSE_EDIT]);
  if (!auth.ok) return auth.response;

  try {
    const companies = await prisma.ownerCompany.findMany({
      orderBy: [{ sortOrder: 'asc' }, { companyName: 'asc' }],
    });
    return NextResponse.json(companies);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request) {
  const auth = await requireAnyPermission([PERMISSIONS.OWNER_EXPENSE_CREATE, PERMISSIONS.OWNER_EXPENSE_EDIT]);
  if (!auth.ok) return auth.response;

  try {
    const { companyName, taxId, note, sortOrder } = await request.json();
    if (!companyName || !taxId) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請填寫公司名稱與統編', 400);
    }
    const company = await prisma.ownerCompany.create({
      data: {
        companyName: companyName.trim(),
        taxId: taxId.trim(),
        note: note || null,
        sortOrder: sortOrder ?? 0,
      },
    });
    return NextResponse.json(company, { status: 201 });
  } catch (error) {
    if (error.code === 'P2002') {
      return createErrorResponse('DUPLICATE', '此統編已存在', 409);
    }
    return handleApiError(error);
  }
}
