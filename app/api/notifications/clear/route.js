import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { invalidateCache } from '@/lib/server-cache';

export const dynamic = 'force-dynamic';

export async function POST() {
  const auth = await requirePermission(PERMISSIONS.NOTIFICATION_VIEW);
  if (!auth.ok) return auth.response;

  try {
    await prisma.notification.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    });
    invalidateCache('notifications:calculated');
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
