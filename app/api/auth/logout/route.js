import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import prisma from '@/lib/prisma';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

// POST /api/auth/logout
// Bumps tokenVersion so any existing JWTs for this user become invalid on next rotation check.
export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return createErrorResponse('UNAUTHORIZED', '請先登入', 401);

    await prisma.user.update({
      where: { id: parseInt(session.user.id) },
      data: { tokenVersion: { increment: 1 } },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
