import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import prisma from '@/lib/prisma';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return createErrorResponse('UNAUTHORIZED', '請先登入', 401);

    const user = await prisma.user.findUnique({
      where: { id: parseInt(session.user.id) },
      select: { totpEnabled: true },
    });
    return NextResponse.json({ totpEnabled: user?.totpEnabled ?? false });
  } catch (error) {
    return handleApiError(error);
  }
}
