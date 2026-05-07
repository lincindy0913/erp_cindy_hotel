import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function PUT(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.ENGINEERING_EDIT);
  if (!auth.ok) return auth.response;
  try {
    const id = parseInt(params.id, 10);
    const body = await request.json();
    const amount = parseFloat(body.amount || 0);
    const taxAmount = parseFloat(body.taxAmount || 0);
    const inv = await prisma.engineeringInputInvoice.update({
      where: { id },
      data: {
        contractId: body.contractId ? parseInt(body.contractId) : null,
        supplierName: body.supplierName?.trim() || null,
        invoiceNo: body.invoiceNo?.trim() || null,
        invoiceDate: body.invoiceDate,
        amount,
        taxAmount,
        totalAmount: body.totalAmount ? parseFloat(body.totalAmount) : amount + taxAmount,
        invoiceType: body.invoiceType?.trim() || null,
        status: body.status || '已取得',
        note: body.note?.trim() || null,
      },
      include: {
        project: { select: { id: true, code: true, name: true } },
        contract: { select: { id: true, contractNo: true, supplier: { select: { id: true, name: true } } } },
      },
    });
    return NextResponse.json(inv);
  } catch (e) { return handleApiError(e); }
}

export async function DELETE(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.ENGINEERING_EDIT);
  if (!auth.ok) return auth.response;
  try {
    const id = parseInt(params.id, 10);
    await prisma.engineeringInputInvoice.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) { return handleApiError(e); }
}
