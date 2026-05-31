import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.ENGINEERING_VIEW);
  if (!auth.ok) return auth.response;
  const { id: rawId } = await params; const id = parseInt(rawId);
  if (Number.isNaN(id)) return createErrorResponse('BAD_REQUEST', '無效的 ID', 400);
  try {
    const versions = await prisma.engineeringContractVersion.findMany({
      where: { contractId: id },
      orderBy: { version: 'asc' },
      select: { id: true, version: true, changeReason: true, snapshot: true, createdAt: true },
    });
    return NextResponse.json(versions.map(v => ({
      ...v,
      createdAt: v.createdAt.toISOString(),
      snapshot: JSON.parse(v.snapshot),
    })));
  } catch (e) { return handleApiError(e); }
}
