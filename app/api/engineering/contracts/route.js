import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.ENGINEERING_VIEW);
  if (!auth.ok) return auth.response;
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const where = projectId ? { projectId: parseInt(projectId) } : {};
    const contracts = await prisma.engineeringContract.findMany({
      where,
      include: {
        project: true,
        supplier: true,
        terms: { orderBy: { termNo: 'asc' } },
      },
      orderBy: { id: 'desc' },
    });
    return NextResponse.json(contracts.map(c => ({
      ...c,
      totalAmount: Number(c.totalAmount),
      terms: c.terms.map(t => ({
        ...t,
        amount: Number(t.amount),
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      })),
    })));
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.ENGINEERING_CREATE);
  if (!auth.ok) return auth.response;
  try {
    const data = await request.json();
    if (!data.projectId || !data.supplierId || !data.contractNo?.trim()) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請填寫工程案、廠商、合約編號', 400);
    }
    const projectId = parseInt(data.projectId);
    const supplierId = parseInt(data.supplierId);
    const contractNo = String(data.contractNo).trim();
    const totalAmount = parseFloat(data.totalAmount) || 0;
    const terms = Array.isArray(data.terms) ? data.terms : [];

    const existing = await prisma.engineeringContract.findUnique({
      where: { projectId_contractNo: { projectId, contractNo } },
    });
    if (existing) {
      return createErrorResponse('CONFLICT_UNIQUE', '該工程案下合約編號已存在', 409);
    }

    const contract = await prisma.engineeringContract.create({
      data: {
        projectId,
        supplierId,
        contractNo,
        totalAmount,
        signDate: data.signDate || null,
        content: data.content?.trim() || null,
        note: data.note?.trim() || null,
        terms: terms.length
          ? {
              create: terms.map((t, i) => ({
                termNo: i + 1,
                termName: t.termName || `第${i + 1}期`,
                amount: parseFloat(t.amount) || 0,
                dueDate: t.dueDate || null,
                status: 'pending',
                note: t.note?.trim() || null,
              })),
            }
          : undefined,
      },
      include: {
        project: true,
        supplier: true,
        terms: { orderBy: { termNo: 'asc' } },
      },
    });
    return NextResponse.json({
      ...contract,
      totalAmount: Number(contract.totalAmount),
      terms: contract.terms.map(t => ({
        ...t,
        amount: Number(t.amount),
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      })),
    }, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}
