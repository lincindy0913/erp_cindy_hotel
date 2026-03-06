import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import prisma from '@/lib/prisma';
import { handleApiError, createErrorResponse } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

// Default notification settings - all enabled (N01-N14)
const DEFAULT_SETTINGS = {
  N01: true,
  N02: true,
  N03: true,
  N04: true,
  N05: true,
  N06: true,
  N07: true,
  N08: true,
  N09: true,
  N10: true,
  N11: true,
  N12: true,
  N13: true,
  N14: true,
};

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return createErrorResponse('UNAUTHORIZED', '請先登入', 401);
    }

    const user = await prisma.user.findUnique({
      where: { id: parseInt(session.user.id) },
      select: { notificationSettings: true },
    });

    if (!user) {
      return createErrorResponse('NOT_FOUND', '找不到使用者', 404);
    }

    // Merge with defaults to ensure all keys exist
    const settings = { ...DEFAULT_SETTINGS, ...(user.notificationSettings || {}) };

    return NextResponse.json({ settings });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return createErrorResponse('UNAUTHORIZED', '請先登入', 401);
    }

    const body = await request.json();
    const { settings } = body;

    if (!settings || typeof settings !== 'object') {
      return createErrorResponse('VALIDATION_FAILED', '缺少 settings 欄位', 400);
    }

    // Validate that all keys are valid N01-N14 codes and values are boolean
    const validCodes = Object.keys(DEFAULT_SETTINGS);
    const cleanSettings = {};
    for (const code of validCodes) {
      cleanSettings[code] = settings[code] !== undefined ? Boolean(settings[code]) : true;
    }

    await prisma.user.update({
      where: { id: parseInt(session.user.id) },
      data: { notificationSettings: cleanSettings },
    });

    return NextResponse.json({ settings: cleanSettings, message: '通知設定已儲存' });
  } catch (error) {
    return handleApiError(error);
  }
}
