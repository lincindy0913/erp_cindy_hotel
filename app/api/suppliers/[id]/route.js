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
  const auth = await requirePermission(PERMISSIONS.PURCHASING_EDIT);
  if (!auth.ok) return auth.response;
  
  try {
    const id = parseInt(params.id);
    const data = await request.json();

    const existing = await prisma.supplier.findUnique({ where: { id } });
    if (!existing) {
      return createErrorResponse('NOT_FOUND', '廠商不存在', 404);
    }

    if (!data.name || !data.taxId || !data.contact || !data.personInCharge || !data.phone) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '缺少必填欄位：廠商名稱、統一編號、聯絡人、負責人、聯絡電話', 400);
    }

    const updated = await prisma.supplier.update({
      where: { id },
      data: {
        name: data.name,
        taxId: data.taxId || null,
        contact: data.contact,
        personInCharge: data.personInCharge || null,
        phone: data.phone,
        address: data.address || null,
        email: data.email || null,
        paymentTerms: data.paymentTerms || '月結',
        contractDate: data.contractDate || null,
        contractEndDate: data.contractEndDate || null,
        paymentStatus: data.paymentStatus || '未付款',
        remarks: data.remarks || null
      }
    });

    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.PURCHASING_EDIT);
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
