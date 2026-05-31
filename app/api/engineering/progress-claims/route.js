import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { assertEngineeringProjectOpen } from '@/lib/engineering-lock';

export const dynamic = 'force-dynamic';

const CLAIM_INCLUDE = {
  project: { select: { id: true, code: true, name: true, clientName: true } },
  outputInvoices: {
    select: { id: true, invoiceNo: true, invoiceDate: true, amount: true, taxAmount: true, totalAmount: true, status: true },
    orderBy: { invoiceDate: 'asc' },
  },
  incomes: {
    select: { id: true, termName: true, receivedDate: true, amount: true },
    orderBy: { receivedDate: 'asc' },
  },
};

function serializeClaim(c) {
  return {
    ...c,
    claimAmount: Number(c.claimAmount),
    certifiedAmount: c.certifiedAmount != null ? Number(c.certifiedAmount) : null,
    outputInvoices: (c.outputInvoices || []).map(i => ({
      ...i, amount: Number(i.amount), taxAmount: Number(i.taxAmount), totalAmount: Number(i.totalAmount),
    })),
    incomes: (c.incomes || []).map(i => ({ ...i, amount: Number(i.amount) })),
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.ENGINEERING_VIEW);
  if (!auth.ok) return auth.response;
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const where = projectId ? { projectId: parseInt(projectId) } : {};
    const claims = await prisma.engineeringProgressClaim.findMany({
      where,
      include: CLAIM_INCLUDE,
      orderBy: [{ projectId: 'asc' }, { claimDate: 'desc' }, { id: 'desc' }],
    });
    return NextResponse.json(claims.map(serializeClaim));
  } catch (e) { return handleApiError(e); }
}

export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.ENGINEERING_CREATE);
  if (!auth.ok) return auth.response;
  try {
    const data = await request.json();
    if (!data.projectId) return createErrorResponse('REQUIRED_FIELD_MISSING', '請選擇工程案', 400);
    if (!data.termName?.trim()) return createErrorResponse('REQUIRED_FIELD_MISSING', '請填寫期別名稱', 400);
    if (!data.claimAmount) return createErrorResponse('REQUIRED_FIELD_MISSING', '請填寫申報金額', 400);
    const projectId = parseInt(data.projectId);
    await assertEngineeringProjectOpen(projectId);
    const claim = await prisma.engineeringProgressClaim.create({
      data: {
        projectId,
        claimNo: data.claimNo?.trim() || null,
        termName: data.termName.trim(),
        claimDate: data.claimDate || null,
        certifiedDate: data.certifiedDate || null,
        claimAmount: parseFloat(data.claimAmount),
        certifiedAmount: data.certifiedAmount ? parseFloat(data.certifiedAmount) : null,
        status: data.status || 'draft',
        note: data.note?.trim() || null,
      },
      include: CLAIM_INCLUDE,
    });
    return NextResponse.json(serializeClaim(claim), { status: 201 });
  } catch (e) { return handleApiError(e); }
}
