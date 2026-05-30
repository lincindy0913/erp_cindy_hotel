/**
 * POST   /api/rentals/contracts/[id]/reminder  — 標記已提醒
 * DELETE /api/rentals/contracts/[id]/reminder  — 清除最新提醒
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { todayStr } from '@/lib/localDate';

export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.RENTAL_EDIT);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const contractId = parseInt(id);
    const body = await request.json().catch(() => ({}));

    const contract = await prisma.rentalContract.findUnique({
      where: { id: contractId },
      select: { id: true },
    });
    if (!contract) return createErrorResponse('NOT_FOUND', '找不到合約', 404);

    const sentBy = auth.session?.user?.name || auth.session?.user?.email || null;

    const reminder = await prisma.contractReminder.create({
      data: {
        contractId,
        sentAt:  todayStr(),
        sentBy,
        channel: body.channel || null,
      },
      select: { id: true, sentAt: true, sentBy: true, channel: true, createdAt: true },
    });

    return NextResponse.json(reminder);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.RENTAL_EDIT);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const contractId = parseInt(id);

    const latest = await prisma.contractReminder.findFirst({
      where: { contractId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (!latest) return createErrorResponse('NOT_FOUND', '找不到提醒記錄', 404);

    await prisma.contractReminder.delete({ where: { id: latest.id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
