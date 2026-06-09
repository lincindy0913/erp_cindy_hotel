import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { recalcBalance } from '@/lib/recalc-balance';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.CASHFLOW_EDIT);
  if (!auth.ok) return auth.response;
  const id = parseInt((await params).id);
  if (isNaN(id)) return createErrorResponse('VALIDATION_FAILED', '無效的帳戶 ID', 400);
  try {
    await prisma.$transaction(async (tx) => {
      await recalcBalance(tx, id);
    });
    const account = await prisma.cashAccount.findUnique({
      where: { id },
      select: { id: true, name: true, currentBalance: true },
    });
    return NextResponse.json({ ok: true, currentBalance: Number(account?.currentBalance ?? 0) });
  } catch (e) {
    return handleApiError(e);
  }
}
