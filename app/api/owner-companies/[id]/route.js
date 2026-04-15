/**
 * PATCH  /api/owner-companies/[id] — 編輯公司資料
 * DELETE /api/owner-companies/[id] — 刪除公司（軟刪除 isActive=false）
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function PATCH(request, { params }) {
  const auth = await requireAnyPermission([PERMISSIONS.OWNER_EXPENSE_EDIT]);
  if (!auth.ok) return auth.response;

  try {
    const id = parseInt(params.id);
    const { companyName, taxId, note, sortOrder, isActive } = await request.json();
    const data = {};
    if (companyName  !== undefined) data.companyName = companyName.trim();
    if (taxId        !== undefined) data.taxId       = taxId.trim();
    if (note         !== undefined) data.note        = note || null;
    if (sortOrder    !== undefined) data.sortOrder   = parseInt(sortOrder);
    if (isActive     !== undefined) data.isActive    = isActive;

    const company = await prisma.ownerCompany.update({ where: { id }, data });
    return NextResponse.json(company);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request, { params }) {
  const auth = await requireAnyPermission([PERMISSIONS.OWNER_EXPENSE_EDIT]);
  if (!auth.ok) return auth.response;

  try {
    const id = parseInt(params.id);
    // 軟刪除：停用而非真正刪除，保留歷史記錄
    await prisma.ownerCompany.update({ where: { id }, data: { isActive: false } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
