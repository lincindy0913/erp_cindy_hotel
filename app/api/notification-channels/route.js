import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

// N01-N14 notification codes with default channel settings
const NOTIFICATION_DEFAULTS = {
  N01: { label: 'PMS 報表未匯入警示', priority: 'low', emailDefault: false, lineDefault: false },
  N02: { label: '貸款本月應還款提醒', priority: 'medium', emailDefault: true, lineDefault: false },
  N03: { label: '支票 3 日內到期提醒', priority: 'medium', emailDefault: true, lineDefault: false },
  N04: { label: '支票已逾期未兌現', priority: 'high', emailDefault: true, lineDefault: true },
  N05: { label: '租金逾期未收', priority: 'medium', emailDefault: true, lineDefault: false },
  N06: { label: '合約即將到期', priority: 'medium', emailDefault: true, lineDefault: false },
  N07: { label: '貸款 6 個月內到期', priority: 'medium', emailDefault: true, lineDefault: false },
  N08: { label: '費用傳票待確認', priority: 'low', emailDefault: false, lineDefault: false },
  N09: { label: '庫存偏低警示', priority: 'low', emailDefault: false, lineDefault: false },
  N10: { label: '對帳差異警示', priority: 'medium', emailDefault: true, lineDefault: false },
  N11: { label: '代墊款逾期提醒', priority: 'medium', emailDefault: true, lineDefault: false },
  N12: { label: '信用卡繳款到期', priority: 'medium', emailDefault: true, lineDefault: false },
  N13: { label: '現金盤點逾期提醒', priority: 'medium', emailDefault: false, lineDefault: true },
  N14: { label: '備份失敗 / 驗證失敗', priority: 'high', emailDefault: true, lineDefault: true },
};

const VALID_CODES = Object.keys(NOTIFICATION_DEFAULTS);

// GET - List user's notification channel preferences
export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return createErrorResponse('UNAUTHORIZED', '請先登入', 401);
    }

    const userId = parseInt(session.user.id);

    // Fetch existing user channel preferences
    const channels = await prisma.userNotificationChannel.findMany({
      where: { userId },
      orderBy: { notificationCode: 'asc' },
    });

    // Build a map of existing settings
    const channelMap = {};
    channels.forEach(ch => {
      channelMap[ch.notificationCode] = ch;
    });

    // Merge with defaults: if a user has no record for a code, use defaults
    const result = VALID_CODES.map(code => {
      const defaults = NOTIFICATION_DEFAULTS[code];
      const existing = channelMap[code];
      if (existing) {
        return {
          id: existing.id,
          userId: existing.userId,
          notificationCode: existing.notificationCode,
          enableInApp: true, // always true
          enableEmail: existing.enableEmail,
          enableLine: existing.enableLine,
          label: defaults.label,
          priority: defaults.priority,
          createdAt: existing.createdAt,
          updatedAt: existing.updatedAt,
        };
      }
      return {
        id: null,
        userId,
        notificationCode: code,
        enableInApp: true,
        enableEmail: defaults.emailDefault,
        enableLine: defaults.lineDefault,
        label: defaults.label,
        priority: defaults.priority,
        createdAt: null,
        updatedAt: null,
      };
    });

    // Also fetch user LINE binding status and notification email
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        notificationEmail: true,
        lineUserId: true,
        lineDisplayName: true,
        lineLinkedAt: true,
      },
    });

    // Check system config readiness
    const sysConfig = await prisma.systemNotificationConfig.findFirst();

    return NextResponse.json({
      channels: result,
      user: {
        email: user?.email || null,
        notificationEmail: user?.notificationEmail || null,
        lineLinked: !!user?.lineUserId,
        lineDisplayName: user?.lineDisplayName || null,
        lineLinkedAt: user?.lineLinkedAt || null,
      },
      systemStatus: {
        emailEnabled: sysConfig?.smtpEnabled || false,
        lineEnabled: sysConfig?.lineBotEnabled || false,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// PATCH - Update user's notificationEmail
export async function PATCH(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return createErrorResponse('UNAUTHORIZED', '請先登入', 401);
    }

    const userId = parseInt(session.user.id);
    const data = await request.json();
    const { notificationEmail } = data;

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { notificationEmail: notificationEmail || null },
      select: { id: true, email: true, notificationEmail: true },
    });

    return NextResponse.json({ notificationEmail: updated.notificationEmail });
  } catch (error) {
    return handleApiError(error);
  }
}

// POST - Create or update a notification channel preference
export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return createErrorResponse('UNAUTHORIZED', '請先登入', 401);
    }

    const userId = parseInt(session.user.id);
    const data = await request.json();

    const { notificationCode, enableEmail, enableLine } = data;

    // Validate notification code
    if (!notificationCode || !VALID_CODES.includes(notificationCode)) {
      return createErrorResponse(
        'NOTIFICATION_CHANNEL_INVALID',
        `無效的通知代碼，有效範圍：${VALID_CODES[0]}–${VALID_CODES[VALID_CODES.length - 1]}`,
        400
      );
    }

    // Validate boolean fields
    if (enableEmail !== undefined && typeof enableEmail !== 'boolean') {
      return createErrorResponse('VALIDATION_FAILED', 'enableEmail 必須為布林值', 400);
    }
    if (enableLine !== undefined && typeof enableLine !== 'boolean') {
      return createErrorResponse('VALIDATION_FAILED', 'enableLine 必須為布林值', 400);
    }

    const defaults = NOTIFICATION_DEFAULTS[notificationCode];

    // Upsert: create if not exists, update if exists
    const channel = await prisma.userNotificationChannel.upsert({
      where: {
        userId_notificationCode: {
          userId,
          notificationCode,
        },
      },
      create: {
        userId,
        notificationCode,
        enableInApp: true, // always true
        enableEmail: enableEmail !== undefined ? enableEmail : defaults.emailDefault,
        enableLine: enableLine !== undefined ? enableLine : defaults.lineDefault,
      },
      update: {
        ...(enableEmail !== undefined && { enableEmail }),
        ...(enableLine !== undefined && { enableLine }),
        enableInApp: true, // ensure always true
      },
    });

    return NextResponse.json({
      ...channel,
      label: defaults.label,
      priority: defaults.priority,
    }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}
