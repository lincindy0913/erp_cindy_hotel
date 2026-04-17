import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export async function GET(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.PURCHASING_VIEW);
  if (!auth.ok) return auth.response;
  
  try {
    const id = parseInt(params.id);
    const supplier = await prisma.supplier.findUnique({ where: { id } });

    if (!supplier) {
      return createErrorResponse('NOT_FOUND', '廠商不存在', 404);
    }
    return NextResponse.json(supplier);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request, { params }) {
  const auth = await requireAnyPermission([
    PERMISSIONS.PURCHASING_EDIT,
    PERMISSIONS.PURCHASING_CREATE,
    PERMISSIONS.PURCHASING_VIEW,
    PERMISSIONS.SETTINGS_EDIT,
    PERMISSIONS.SETTINGS_VIEW,
  ]);
  if (!auth.ok) return auth.response;
  
  try {
    const id = parseInt(params.id);
    const data = await request.json();

    const existing = await prisma.supplier.findUnique({ where: { id } });
    if (!existing) {
      return createErrorResponse('NOT_FOUND', '廠商不存在', 404);
    }

    if (!data.name || !String(data.name).trim()) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請填寫廠商名稱', 400);
    }

    const updated = await prisma.supplier.update({
      where: { id },
      data: {
        name: String(data.name).trim(),
        taxId: data.taxId && String(data.taxId).trim() ? String(data.taxId).trim() : null,
        contact: data.contact && String(data.contact).trim() ? String(data.contact).trim() : null,
        personInCharge: data.personInCharge && String(data.personInCharge).trim() ? String(data.personInCharge).trim() : null,
        phone: data.phone && String(data.phone).trim() ? String(data.phone).trim() : null,
        address: data.address || null,
        email: data.email || null,
        paymentTerms: data.paymentTerms || '月結',
        contractDate: data.contractDate || null,
        contractEndDate: data.contractEndDate || null,
        paymentStatus: data.paymentStatus || '未付款',
        remarks: data.remarks || null,
        checkPayee: data.checkPayee && String(data.checkPayee).trim() ? String(data.checkPayee).trim() : null,
        industryCategory: data.industryCategory && String(data.industryCategory).trim() ? String(data.industryCategory).trim() : null,
        sortOrder: data.sortOrder != null && data.sortOrder !== '' ? parseInt(data.sortOrder) : null,
      }
    });

    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request, { params }) {
  const auth = await requireAnyPermission([
    PERMISSIONS.PURCHASING_EDIT,
    PERMISSIONS.PURCHASING_CREATE,
    PERMISSIONS.PURCHASING_VIEW,
    PERMISSIONS.SETTINGS_EDIT,
  ]);
  if (!auth.ok) return auth.response;
  
  try {
    const id = parseInt(params.id);

    const existing = await prisma.supplier.findUnique({ where: { id } });
    if (!existing) {
      return createErrorResponse('NOT_FOUND', '廠商不存在', 404);
    }

    await prisma.supplier.delete({ where: { id } });
    return NextResponse.json({ message: '廠商已刪除' });
  } catch (error) {
    return handleApiError(error);
  }
}
