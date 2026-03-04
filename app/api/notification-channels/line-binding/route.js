import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

// POST - Generate LINE binding token for current user
export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return createErrorResponse('UNAUTHORIZED', '請先登入', 401);
    }

    const userId = parseInt(session.user.id);

    // Check if user already has LINE bound
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { lineUserId: true, lineDisplayName: true, lineLinkedAt: true },
    });

    if (!user) {
      return createErrorResponse('NOT_FOUND', '找不到使用者', 404);
    }

    if (user.lineUserId) {
      return createErrorResponse(
        'LINE_ALREADY_BOUND',
        `此帳號已綁定 LINE（${user.lineDisplayName || '未知'}），請先解除綁定再重新綁定`,
        409
      );
    }

    // Check system LINE Bot config is ready
    const sysConfig = await prisma.systemNotificationConfig.findFirst();
    if (!sysConfig?.lineBotEnabled || !sysConfig?.lineBotChannelId) {
      return createErrorResponse(
        'NOTIFICATION_CHANNEL_INVALID',
        '系統 LINE Bot 尚未設定，請聯繫管理員',
        503
      );
    }

    // Generate binding token (UUID format)
    const bindingToken = crypto.randomUUID();
    const expiredAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await prisma.user.update({
      where: { id: userId },
      data: {
        lineBindingToken: bindingToken,
        lineBindingExpiredAt: expiredAt,
      },
    });

    // Build LINE deep link URL
    // Format: https://line.me/R/oaMessage/@{botId}/?{bindingToken}
    const botId = sysConfig.lineBotChannelId;
    const lineUrl = `https://line.me/R/oaMessage/@${botId}/?${bindingToken}`;

    return NextResponse.json({
      bindingToken,
      expiredAt: expiredAt.toISOString(),
      lineUrl,
      botName: sysConfig.lineBotName || '',
      message: '已產生 LINE 綁定 QR Code，請於 15 分鐘內完成掃描',
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// PUT - Complete LINE binding (verify token and link LINE userId)
// Called by LINE Bot webhook or polling endpoint
export async function PUT(request) {
  try {
    const data = await request.json();
    const { bindingToken, lineUserId, lineDisplayName } = data;

    if (!bindingToken) {
      return createErrorResponse('VALIDATION_FAILED', '缺少綁定 token', 400);
    }

    if (!lineUserId) {
      return createErrorResponse('VALIDATION_FAILED', '缺少 LINE User ID', 400);
    }

    // Find user with this binding token
    const user = await prisma.user.findFirst({
      where: { lineBindingToken: bindingToken },
      select: {
        id: true,
        name: true,
        email: true,
        lineBindingExpiredAt: true,
        lineUserId: true,
      },
    });

    if (!user) {
      return createErrorResponse(
        'NOTIFICATION_CHANNEL_INVALID',
        'LINE 綁定 token 無效或不存在',
        400
      );
    }

    // Check token expiration
    if (!user.lineBindingExpiredAt || new Date() > new Date(user.lineBindingExpiredAt)) {
      // Clear expired token
      await prisma.user.update({
        where: { id: user.id },
        data: {
          lineBindingToken: null,
          lineBindingExpiredAt: null,
        },
      });
      return createErrorResponse(
        'LINE_BINDING_EXPIRED',
        'LINE 綁定 token 已過期，請重新產生 QR Code',
        400
      );
    }

    // Check if this LINE userId is already bound to another user
    const existingBinding = await prisma.user.findFirst({
      where: {
        lineUserId,
        id: { not: user.id },
      },
    });

    if (existingBinding) {
      return createErrorResponse(
        'LINE_ALREADY_BOUND',
        '此 LINE 帳號已綁定其他使用者',
        409
      );
    }

    // Complete binding
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        lineUserId,
        lineDisplayName: lineDisplayName || null,
        lineLinkedAt: new Date(),
        lineBindingToken: null,
        lineBindingExpiredAt: null,
      },
      select: {
        id: true,
        name: true,
        lineUserId: true,
        lineDisplayName: true,
        lineLinkedAt: true,
      },
    });

    // Log audit
    try {
      await prisma.auditLog.create({
        data: {
          action: 'USER_LINE_LINKED',
          level: 'info',
          targetModule: 'notification-channels',
          targetRecordId: user.id,
          afterState: {
            lineUserId,
            lineDisplayName: lineDisplayName || null,
          },
          note: `使用者 ${user.name} 完成 LINE 帳號綁定`,
          userId: user.id,
          userEmail: user.email,
          userName: user.name,
        },
      });
    } catch (auditError) {
      console.error('Audit log error:', auditError);
    }

    return NextResponse.json({
      success: true,
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        lineUserId: updatedUser.lineUserId,
        lineDisplayName: updatedUser.lineDisplayName,
        lineLinkedAt: updatedUser.lineLinkedAt,
      },
      message: '綁定成功！已將 LINE 帳號連結至系統',
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// DELETE - Unbind LINE from current user
export async function DELETE(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return createErrorResponse('UNAUTHORIZED', '請先登入', 401);
    }

    const userId = parseInt(session.user.id);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        lineUserId: true,
        lineDisplayName: true,
      },
    });

    if (!user) {
      return createErrorResponse('NOT_FOUND', '找不到使用者', 404);
    }

    if (!user.lineUserId) {
      return createErrorResponse(
        'NOTIFICATION_CHANNEL_INVALID',
        '此帳號尚未綁定 LINE',
        400
      );
    }

    const previousLineDisplayName = user.lineDisplayName;
    const previousLineUserId = user.lineUserId;

    // Use transaction: clear LINE binding + disable all LINE notifications
    await prisma.$transaction([
      // Clear LINE binding fields
      prisma.user.update({
        where: { id: userId },
        data: {
          lineUserId: null,
          lineDisplayName: null,
          lineLinkedAt: null,
          lineBindingToken: null,
          lineBindingExpiredAt: null,
        },
      }),
      // Disable all LINE notifications for this user
      prisma.userNotificationChannel.updateMany({
        where: { userId, enableLine: true },
        data: { enableLine: false },
      }),
    ]);

    // Log audit
    try {
      await prisma.auditLog.create({
        data: {
          action: 'USER_LINE_UNLINKED',
          level: 'info',
          targetModule: 'notification-channels',
          targetRecordId: userId,
          beforeState: {
            lineUserId: previousLineUserId,
            lineDisplayName: previousLineDisplayName,
          },
          note: `使用者 ${user.name} 解除 LINE 帳號綁定（${previousLineDisplayName || '未知'}）`,
          userId: userId,
          userEmail: user.email || session.user.email,
          userName: user.name || session.user.name,
        },
      });
    } catch (auditError) {
      console.error('Audit log error:', auditError);
    }

    return NextResponse.json({
      success: true,
      previousLineUserId,
      previousLineDisplayName,
      message: '已解除 LINE 帳號綁定，所有 LINE 通知已停用',
    });
  } catch (error) {
    return handleApiError(error);
  }
}
