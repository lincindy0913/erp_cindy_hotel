import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

export async function GET() {
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
