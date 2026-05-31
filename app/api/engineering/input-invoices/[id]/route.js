import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { assertEngineeringProjectOpen } from '@/lib/engineering-lock';

export const dynamic = 'force-dynamic';

export async function PUT(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.ENGINEERING_EDIT);
  if (!auth.ok) return auth.response;
  try {
    const { id: rawId } = await params; const id = parseInt(rawId, 10);
    const body = await request.json();
    const existing = await prisma.engineeringInputInvoice.findUnique({ where: { id }, select: { projectId: true } });
    if (existing) await assertEngineeringProjectOpen(existing.projectId);
    if (body.invoiceNo?.trim()) {
      const dup = await prisma.engineeringInputInvoice.findFirst({
        where: { invoiceNo: body.invoiceNo.trim(), id: { not: id } },
        select: { id: true },
      });
      if (dup) return NextResponse.json({ error: `發票號碼 ${body.invoiceNo.trim()} 已登錄，請確認是否重複申報` }, { status: 409 });
    }
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
    const { id: rawId } = await params; const id = parseInt(rawId, 10);
    const existing = await prisma.engineeringInputInvoice.findUnique({ where: { id }, select: { projectId: true } });
    if (existing) await assertEngineeringProjectOpen(existing.projectId);
    await prisma.engineeringInputInvoice.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) { return handleApiError(e); }
}
