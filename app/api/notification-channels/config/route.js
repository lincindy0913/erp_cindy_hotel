import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { encryptField, decryptFields } from '@/lib/field-encryption';

const SENSITIVE_FIELDS = ['smtpPassword', 'lineBotChannelSecret', 'lineBotAccessToken'];

export const dynamic = 'force-dynamic';

// GET - Get SystemNotificationConfig (SMTP settings, LINE settings)
export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.SETTINGS_VIEW);
  if (!auth.ok) return auth.response;

  try {
    // Only admin can view full config; regular users get status only
    const isAdmin = auth.session.user.role === 'admin';

    let config = await prisma.systemNotificationConfig.findFirst();

    // If no config exists yet, create default one
    if (!config) {
      config = await prisma.systemNotificationConfig.create({
        data: {
          smtpEnabled: false,
          smtpUseTls: true,
          lineBotEnabled: false,
        },
      });
    }

    // Decrypt sensitive fields for existence checks (values are masked in response)
    const decrypted = decryptFields(config, SENSITIVE_FIELDS);

    if (!isAdmin) {
      // Non-admin users only see enabled status (no credentials)
      return NextResponse.json({
        emailEnabled: config.smtpEnabled,
        emailConfigured: !!(config.smtpHost && config.smtpUser && config.smtpFromEmail),
        lineEnabled: config.lineBotEnabled,
        lineConfigured: !!(config.lineBotChannelId && decrypted.lineBotAccessToken),
      });
    }

    // Admin gets full config (mask password fields)
    return NextResponse.json({
      id: config.id,
      // SMTP settings
      smtpEnabled: config.smtpEnabled,
      smtpHost: config.smtpHost || '',
      smtpPort: config.smtpPort || 587,
      smtpUser: config.smtpUser || '',
      smtpPassword: decrypted.smtpPassword ? '********' : '', // masked
      smtpUseTls: config.smtpUseTls,
      smtpFromName: config.smtpFromName || '',
      smtpFromEmail: config.smtpFromEmail || '',
      // LINE Bot settings
      lineBotEnabled: config.lineBotEnabled,
      lineBotChannelId: config.lineBotChannelId || '',
      lineBotChannelSecret: decrypted.lineBotChannelSecret ? '********' : '', // masked
      lineBotAccessToken: decrypted.lineBotAccessToken ? '********' : '', // masked
      lineBotName: config.lineBotName || '',
      // Meta
      updatedAt: config.updatedAt,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// PUT - Update SystemNotificationConfig (admin only)
export async function PUT(request) {
  const auth = await requirePermission(PERMISSIONS.SETTINGS_EDIT);
  if (!auth.ok) return auth.response;

  try {
    const session = auth.session;
    const data = await request.json();

    // Find existing config or create
    let config = await prisma.systemNotificationConfig.findFirst();
    const isCreate = !config;

    // Build update data
    const updateData = {};

    // SMTP fields
    if (data.smtpEnabled !== undefined) updateData.smtpEnabled = Boolean(data.smtpEnabled);
    if (data.smtpHost !== undefined) updateData.smtpHost = data.smtpHost?.trim() || null;
    if (data.smtpPort !== undefined) updateData.smtpPort = data.smtpPort ? parseInt(data.smtpPort) : null;
    if (data.smtpUser !== undefined) updateData.smtpUser = data.smtpUser?.trim() || null;
    // Only update password if not masked placeholder — encrypt before storing
    if (data.smtpPassword !== undefined && data.smtpPassword !== '********') {
      updateData.smtpPassword = data.smtpPassword ? encryptField(data.smtpPassword) : null;
    }
    if (data.smtpUseTls !== undefined) updateData.smtpUseTls = Boolean(data.smtpUseTls);
    if (data.smtpFromName !== undefined) updateData.smtpFromName = data.smtpFromName?.trim() || null;
    if (data.smtpFromEmail !== undefined) updateData.smtpFromEmail = data.smtpFromEmail?.trim() || null;

    // LINE Bot fields
    if (data.lineBotEnabled !== undefined) updateData.lineBotEnabled = Boolean(data.lineBotEnabled);
    if (data.lineBotChannelId !== undefined) updateData.lineBotChannelId = data.lineBotChannelId?.trim() || null;
    if (data.lineBotChannelSecret !== undefined && data.lineBotChannelSecret !== '********') {
      updateData.lineBotChannelSecret = data.lineBotChannelSecret ? encryptField(data.lineBotChannelSecret) : null;
    }
    if (data.lineBotAccessToken !== undefined && data.lineBotAccessToken !== '********') {
      updateData.lineBotAccessToken = data.lineBotAccessToken ? encryptField(data.lineBotAccessToken) : null;
    }
    if (data.lineBotName !== undefined) updateData.lineBotName = data.lineBotName?.trim() || null;

    // Validate SMTP settings if enabling email
    if (updateData.smtpEnabled === true || (!isCreate && config.smtpEnabled && updateData.smtpEnabled !== false)) {
      const smtpHost = updateData.smtpHost ?? config?.smtpHost;
      const smtpUser = updateData.smtpUser ?? config?.smtpUser;
      const smtpFromEmail = updateData.smtpFromEmail ?? config?.smtpFromEmail;

      if (!smtpHost || !smtpUser || !smtpFromEmail) {
        return createErrorResponse(
          'SMTP_CONFIG_INVALID',
          '啟用 Email 通知需填寫 SMTP 主機、帳號及寄件 Email',
          400
        );
      }
    }

    // Validate LINE settings if enabling LINE
    if (updateData.lineBotEnabled === true || (!isCreate && config.lineBotEnabled && updateData.lineBotEnabled !== false)) {
      const channelId = updateData.lineBotChannelId ?? config?.lineBotChannelId;
      const accessToken = updateData.lineBotAccessToken ?? config?.lineBotAccessToken;

      if (!channelId && !accessToken) {
        return createErrorResponse(
          'NOTIFICATION_CHANNEL_INVALID',
          '啟用 LINE 通知需填寫 Channel ID 及 Access Token',
          400
        );
      }
    }

    let result;
    if (isCreate) {
      result = await prisma.systemNotificationConfig.create({
        data: {
          smtpEnabled: false,
          smtpUseTls: true,
          lineBotEnabled: false,
          ...updateData,
        },
      });
    } else {
      result = await prisma.systemNotificationConfig.update({
        where: { id: config.id },
        data: updateData,
      });
    }

    // Log audit
    try {
      await prisma.auditLog.create({
        data: {
          action: 'SYSTEM_NOTIFICATION_CONFIG_UPDATED',
          level: 'info',
          targetModule: 'notification-channels',
          targetRecordId: result.id,
          note: `系統通知渠道設定已更新`,
          userId: parseInt(session.user.id),
          userEmail: session.user.email,
          userName: session.user.name,
        },
      });
    } catch (auditError) {
      console.error('Audit log error:', auditError);
    }

    // Return masked response (encrypted fields are truthy, so mask check still works)
    return NextResponse.json({
      id: result.id,
      smtpEnabled: result.smtpEnabled,
      smtpHost: result.smtpHost || '',
      smtpPort: result.smtpPort || 587,
      smtpUser: result.smtpUser || '',
      smtpPassword: result.smtpPassword ? '********' : '',
      smtpUseTls: result.smtpUseTls,
      smtpFromName: result.smtpFromName || '',
      smtpFromEmail: result.smtpFromEmail || '',
      lineBotEnabled: result.lineBotEnabled,
      lineBotChannelId: result.lineBotChannelId || '',
      lineBotChannelSecret: result.lineBotChannelSecret ? '********' : '',
      lineBotAccessToken: result.lineBotAccessToken ? '********' : '',
      lineBotName: result.lineBotName || '',
      updatedAt: result.updatedAt,
      message: '系統通知渠道設定已儲存',
    });
  } catch (error) {
    return handleApiError(error);
  }
}
