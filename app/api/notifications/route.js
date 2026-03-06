import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requirePermission(PERMISSIONS.NOTIFICATION_VIEW);
  if (!auth.ok) return auth.response;
  
  try {
    const notifications = await prisma.notification.findMany({
      where: { isActive: true },
      orderBy: { calculatedAt: 'desc' }
    });

    return NextResponse.json(notifications);
  } catch (error) {
    return handleApiError(error);
  }
}
