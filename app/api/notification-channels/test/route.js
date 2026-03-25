import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { decryptField } from '@/lib/field-encryption';

export const dynamic = 'force-dynamic';

// POST - Send test notification to verify channel configuration
export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.SETTINGS_EDIT);
  if (!auth.ok) return auth.response;

  try {
    const userId = parseInt(auth.session.user.id);
    const data = await request.json();
    const { channel } = data; // 'email' or 'line'

    if (!channel || !['email', 'line'].includes(channel)) {
      return createErrorResponse(
        'NOTIFICATION_CHANNEL_INVALID',
        '請指定測試渠道：email 或 line',
        400
      );
    }

    // Get system config and decrypt sensitive fields
    const rawConfig = await prisma.systemNotificationConfig.findFirst();
    const sysConfig = rawConfig ? {
      ...rawConfig,
      smtpPassword: decryptField(rawConfig.smtpPassword),
      lineBotAccessToken: decryptField(rawConfig.lineBotAccessToken),
      lineBotChannelSecret: decryptField(rawConfig.lineBotChannelSecret),
    } : null;

    // Get user info
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        notificationEmail: true,
        lineUserId: true,
        lineDisplayName: true,
      },
    });

    if (!user) {
      return createErrorResponse('NOT_FOUND', '找不到使用者', 404);
    }

    // ---- Test Email ----
    if (channel === 'email') {
      if (!sysConfig?.smtpEnabled) {
        return createErrorResponse(
          'NOTIFICATION_CHANNEL_INVALID',
          '系統 SMTP 尚未啟用，請聯繫管理員進行設定',
          503
        );
      }

      if (!sysConfig.smtpHost || !sysConfig.smtpUser) {
        return createErrorResponse(
          'SMTP_CONFIG_INVALID',
          '系統 SMTP 設定不完整，請聯繫管理員',
          503
        );
      }

      const recipientEmail = user.notificationEmail || user.email;
      if (!recipientEmail) {
        return createErrorResponse(
          'VALIDATION_FAILED',
          '使用者沒有設定通知 Email，無法發送測試',
          400
        );
      }

      // Create delivery log
      const deliveryLog = await prisma.notificationDeliveryLog.create({
        data: {
          notificationCode: 'TEST',
          userId,
          channel: 'email',
          status: 'pending',
        },
      });

      try {
        // Attempt to send test email via Nodemailer
        const nodemailer = await import('nodemailer');

        const transporter = nodemailer.default.createTransport({
          host: sysConfig.smtpHost,
          port: sysConfig.smtpPort || 587,
          secure: sysConfig.smtpPort === 465,
          auth: {
            user: sysConfig.smtpUser,
            pass: sysConfig.smtpPassword,
          },
          tls: {
            rejectUnauthorized: false,
          },
        });

        const fromName = sysConfig.smtpFromName || '財務系統';
        const fromEmail = sysConfig.smtpFromEmail || sysConfig.smtpUser;

        await transporter.sendMail({
          from: `"${fromName}" <${fromEmail}>`,
          to: recipientEmail,
          subject: `【${fromName}】Email 通知測試`,
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
              <div style="background: #059669; color: white; padding: 16px 24px;">
                <h2 style="margin: 0;">Email 通知測試</h2>
              </div>
              <div style="padding: 24px;">
                <p>您好，${user.name || '使用者'}：</p>
                <p>這是一封測試郵件，用於確認您的 Email 通知渠道設定正確。</p>
                <p>如果您收到此郵件，表示系統的 Email 通知功能運作正常。</p>
                <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
                <p style="color: #6b7280; font-size: 14px;">
                  發送時間：${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}<br>
                  收件人：${recipientEmail}
                </p>
              </div>
            </div>
          `,
        });

        // Update log to sent
        await prisma.notificationDeliveryLog.update({
          where: { id: deliveryLog.id },
          data: {
            status: 'sent',
            sentAt: new Date(),
          },
        });

        return NextResponse.json({
          success: true,
          channel: 'email',
          recipient: recipientEmail,
          deliveryLogId: deliveryLog.id,
          message: `測試 Email 已發送至 ${recipientEmail}`,
        });
      } catch (sendError) {
        // Update log to failed
        await prisma.notificationDeliveryLog.update({
          where: { id: deliveryLog.id },
          data: {
            status: 'failed',
            errorMessage: sendError.message,
          },
        });

        return createErrorResponse(
          'NOTIFICATION_CHANNEL_INVALID',
          `Email 發送失敗：${sendError.message}`,
          500,
          { smtpError: sendError.message }
        );
      }
    }

    // ---- Test LINE ----
    if (channel === 'line') {
      if (!sysConfig?.lineBotEnabled) {
        return createErrorResponse(
          'NOTIFICATION_CHANNEL_INVALID',
          '系統 LINE Bot 尚未啟用，請聯繫管理員進行設定',
          503
        );
      }

      if (!sysConfig.lineBotAccessToken) {
        return createErrorResponse(
          'NOTIFICATION_CHANNEL_INVALID',
          '系統 LINE Bot Access Token 尚未設定，請聯繫管理員',
          503
        );
      }

      if (!user.lineUserId) {
        return createErrorResponse(
          'NOTIFICATION_CHANNEL_INVALID',
          '您尚未綁定 LINE 帳號，請先完成綁定',
          400
        );
      }

      // Create delivery log
      const deliveryLog = await prisma.notificationDeliveryLog.create({
        data: {
          notificationCode: 'TEST',
          userId,
          channel: 'line',
          status: 'pending',
        },
      });

      try {
        // Send test LINE message via LINE Messaging API (Push Message)
        const lineResponse = await fetch('https://api.line.me/v2/bot/message/push', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${sysConfig.lineBotAccessToken}`,
          },
          body: JSON.stringify({
            to: user.lineUserId,
            messages: [
              {
                type: 'flex',
                altText: 'LINE 通知測試',
                contents: {
                  type: 'bubble',
                  header: {
                    type: 'box',
                    layout: 'vertical',
                    contents: [
                      {
                        type: 'text',
                        text: 'LINE 通知測試',
                        weight: 'bold',
                        size: 'lg',
                        color: '#059669',
                      },
                    ],
                    paddingAll: '16px',
                  },
                  body: {
                    type: 'box',
                    layout: 'vertical',
                    contents: [
                      {
                        type: 'text',
                        text: `${user.name || '使用者'}，您好！`,
                        size: 'md',
                        wrap: true,
                      },
                      {
                        type: 'text',
                        text: '這是一則測試訊息，用於確認您的 LINE 通知渠道設定正確。',
                        size: 'sm',
                        color: '#666666',
                        wrap: true,
                        margin: 'md',
                      },
                      {
                        type: 'separator',
                        margin: 'lg',
                      },
                      {
                        type: 'text',
                        text: `發送時間：${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}`,
                        size: 'xs',
                        color: '#999999',
                        margin: 'md',
                      },
                    ],
                    paddingAll: '16px',
                  },
                },
              },
            ],
          }),
        });

        if (!lineResponse.ok) {
          const errorBody = await lineResponse.text();
          throw new Error(`LINE API 錯誤 (${lineResponse.status}): ${errorBody}`);
        }

        // Update log to sent
        await prisma.notificationDeliveryLog.update({
          where: { id: deliveryLog.id },
          data: {
            status: 'sent',
            sentAt: new Date(),
          },
        });

        return NextResponse.json({
          success: true,
          channel: 'line',
          recipient: user.lineDisplayName || user.lineUserId,
          deliveryLogId: deliveryLog.id,
          message: `測試 LINE 訊息已發送至 ${user.lineDisplayName || 'LINE 用戶'}`,
        });
      } catch (sendError) {
        // Update log to failed
        await prisma.notificationDeliveryLog.update({
          where: { id: deliveryLog.id },
          data: {
            status: 'failed',
            errorMessage: sendError.message,
          },
        });

        return createErrorResponse(
          'NOTIFICATION_CHANNEL_INVALID',
          `LINE 訊息發送失敗：${sendError.message}`,
          500,
          { lineError: sendError.message }
        );
      }
    }
  } catch (error) {
    return handleApiError(error);
  }
}
