import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { assertEngineeringProjectOpen } from '@/lib/engineering-lock';

export const dynamic = 'force-dynamic';

const OUTPUT_INV_INCLUDE = {
  project: { select: { id: true, code: true, name: true, clientName: true } },
  progressClaim: { select: { id: true, termName: true, claimNo: true, status: true } },
};

function serializeInv(i) {
  return { ...i, amount: Number(i.amount), taxAmount: Number(i.taxAmount), totalAmount: Number(i.totalAmount) };
}

export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.ENGINEERING_VIEW);
  if (!auth.ok) return auth.response;
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const where = {};
    if (projectId) where.projectId = parseInt(projectId, 10);
    const invoices = await prisma.engineeringOutputInvoice.findMany({
      where,
      include: OUTPUT_INV_INCLUDE,
      orderBy: [{ invoiceDate: 'desc' }, { id: 'desc' }],
    });
    return NextResponse.json(invoices.map(serializeInv));
  } catch (e) { return handleApiError(e); }
}

export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.ENGINEERING_EDIT);
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json();
    if (!body.projectId) return createErrorResponse('REQUIRED_FIELD_MISSING', '請選擇工程案', 400);
    if (!body.invoiceDate) return createErrorResponse('REQUIRED_FIELD_MISSING', '請填寫發票日期', 400);
    await assertEngineeringProjectOpen(body.projectId);
    const amount = parseFloat(body.amount || 0);
    const taxAmount = parseFloat(body.taxAmount || 0);
    const inv = await prisma.engineeringOutputInvoice.create({
      data: {
        projectId: parseInt(body.projectId),
        progressClaimId: body.progressClaimId ? parseInt(body.progressClaimId) : null,
        clientName: body.clientName?.trim() || null,
        invoiceNo: body.invoiceNo?.trim() || null,
        invoiceDate: body.invoiceDate,
        amount,
        taxAmount,
        totalAmount: body.totalAmount ? parseFloat(body.totalAmount) : amount + taxAmount,
        invoiceType: body.invoiceType?.trim() || null,
        status: body.status || '已開立',
        note: body.note?.trim() || null,
      },
      include: OUTPUT_INV_INCLUDE,
    });
    return NextResponse.json(serializeInv(inv), { status: 201 });
  } catch (e) { return handleApiError(e); }
}
