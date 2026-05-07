import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.ENGINEERING_VIEW);
  if (!auth.ok) return auth.response;
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const where = {};
    if (projectId) where.projectId = parseInt(projectId, 10);
    const invoices = await prisma.engineeringInputInvoice.findMany({
      where,
      include: {
        project: { select: { id: true, code: true, name: true } },
        contract: { select: { id: true, contractNo: true, supplier: { select: { id: true, name: true } } } },
      },
      orderBy: [{ invoiceDate: 'desc' }, { id: 'desc' }],
    });
    return NextResponse.json(invoices);
  } catch (e) { return handleApiError(e); }
}

export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.ENGINEERING_EDIT);
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json();
    if (!body.projectId) return NextResponse.json({ error: '請選擇工程案' }, { status: 400 });
    if (!body.invoiceDate) return NextResponse.json({ error: '請填寫發票日期' }, { status: 400 });
    const amount = parseFloat(body.amount || 0);
    const taxAmount = parseFloat(body.taxAmount || 0);
    const inv = await prisma.engineeringInputInvoice.create({
      data: {
        projectId: parseInt(body.projectId),
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
    return NextResponse.json(inv, { status: 201 });
  } catch (e) { return handleApiError(e); }
}
