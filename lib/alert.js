/**
 * Centralized error alerting system
 * Creates N14-style critical notifications + optional email/LINE delivery
 * for: 500 errors, scheduler failures, import failures, webhook failures
 */
import prisma from '@/lib/prisma';
import { decryptField } from '@/lib/field-encryption';

// Alert categories
export const ALERT_CATEGORIES = {
  API_500: 'api_500',
  SCHEDULER_FAILURE: 'scheduler_failure',
  IMPORT_FAILURE: 'import_failure',
  WEBHOOK_FAILURE: 'webhook_failure',

};

/**
 * Create a critical alert notification + attempt email/LINE delivery to admins
 * @param {string} category - One of ALERT_CATEGORIES
 * @param {string} title - Short title
 * @param {string} message - Detail message
 * @param {object} metadata - Extra context (route, error, etc.)
 */
export async function createAlert(category, title, message, metadata = {}) {
  const notificationCode = 'N14'; // Reuse critical system alert code
  const now = new Date();

  try {
    // 1) Upsert in-app notification (N14 bucket)
    await prisma.notification.upsert({
      where: { notificationCode },
      create: {
        notificationCode,
        title: `[${category}] ${title}`,
        level: 'critical',
        targetUrl: '/settings',
        count: 1,
        isActive: true,
        metadata: { category, message, ...metadata, lastOccurredAt: now.toISOString() },
      },
      update: {
        title: `[${category}] ${title}`,
        level: 'critical',
        isActive: true,
        count: { increment: 1 },
        calculatedAt: now,
        metadata: { category, message, ...metadata, lastOccurredAt: now.toISOString() },
      },
    });

    // 2) Log to ErrorAlertLog
    await prisma.errorAlertLog.create({
      data: {
        category,
        title,
        message,
        metadata,
        occurredAt: now,
      },
    });

    // 3) Attempt to deliver to admin users via email/LINE (non-blocking)
    deliverToAdmins(category, title, message).catch((err) => {
      console.error('[alert] failed to deliver to admins:', err.message);
    });
  } catch (err) {
    // Alert system itself should never crash the caller
    console.error('[alert] failed to create alert:', err.message, { category, title });
  }
}

/**
 * Deliver alert to all admin users who have N14 email/LINE enabled
 */
async function deliverToAdmins(category, title, message) {
  const rawConfig = await prisma.systemNotificationConfig.findFirst();
  if (!rawConfig) return;

  // Decrypt sensitive credentials before use
  const sysConfig = {
    ...rawConfig,
    smtpPassword: decryptField(rawConfig.smtpPassword),
    lineBotAccessToken: decryptField(rawConfig.lineBotAccessToken),
  };

  // Find admin users
  const admins = await prisma.user.findMany({
    where: { role: 'admin', isActive: true },
    select: {
      id: true,
      name: true,
      email: true,
      notificationEmail: true,
      lineUserId: true,
    },
  });

  for (const admin of admins) {
    // Check user's N14 channel preferences
    const pref = await prisma.userNotificationChannel.findUnique({
      where: { userId_notificationCode: { userId: admin.id, notificationCode: 'N14' } },
    });

    const sendEmail = pref ? pref.enableEmail : true; // default on for N14
    const sendLine = pref ? pref.enableLine : true;

    // Email
    if (sendEmail && sysConfig.smtpEnabled && sysConfig.smtpHost) {
      const recipientEmail = admin.notificationEmail || admin.email;
      if (recipientEmail) {
        try {
          const nodemailer = await import('nodemailer');
          const transporter = nodemailer.default.createTransport({
            host: sysConfig.smtpHost,
            port: sysConfig.smtpPort || 587,
            secure: sysConfig.smtpPort === 465,
            auth: { user: sysConfig.smtpUser, pass: sysConfig.smtpPassword },
            tls: { rejectUnauthorized: false },
          });
          const fromName = sysConfig.smtpFromName || '財務系統';
          const fromEmail = sysConfig.smtpFromEmail || sysConfig.smtpUser;
          await transporter.sendMail({
            from: `"${fromName}" <${fromEmail}>`,
            to: recipientEmail,
            subject: `【系統警報】${title}`,
            html: `
              <div style="font-family:sans-serif;max-width:600px;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
                <div style="background:#dc2626;color:white;padding:16px 24px;">
                  <h2 style="margin:0;">系統警報: ${title}</h2>
                </div>
                <div style="padding:24px;">
                  <p><strong>類別:</strong> ${category}</p>
                  <p><strong>訊息:</strong> ${message}</p>
                  <p><strong>時間:</strong> ${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}</p>
                </div>
              </div>
            `,
          });
          await prisma.notificationDeliveryLog.create({
            data: { notificationCode: 'N14', userId: admin.id, channel: 'email', status: 'sent', sentAt: new Date() },
          });
        } catch (emailErr) {
          await prisma.notificationDeliveryLog.create({
            data: { notificationCode: 'N14', userId: admin.id, channel: 'email', status: 'failed', errorMessage: emailErr.message },
          }).catch(() => {});
        }
      }
    }

    // LINE
    if (sendLine && sysConfig.lineBotEnabled && sysConfig.lineBotAccessToken && admin.lineUserId) {
      try {
        const res = await fetch('https://api.line.me/v2/bot/message/push', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sysConfig.lineBotAccessToken}` },
          body: JSON.stringify({
            to: admin.lineUserId,
            messages: [{
              type: 'text',
              text: `🚨 系統警報\n類別: ${category}\n${title}\n${message}\n時間: ${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}`,
            }],
          }),
        });
        const status = res.ok ? 'sent' : 'failed';
        await prisma.notificationDeliveryLog.create({
          data: { notificationCode: 'N14', userId: admin.id, channel: 'line', status, sentAt: res.ok ? new Date() : undefined, errorMessage: res.ok ? undefined : `LINE API ${res.status}` },
        }).catch(() => {});
      } catch (lineErr) {
        await prisma.notificationDeliveryLog.create({
          data: { notificationCode: 'N14', userId: admin.id, channel: 'line', status: 'failed', errorMessage: lineErr.message },
        }).catch(() => {});
      }
    }
  }
}

/**
 * Middleware-style 500 error alerting — wrap handleApiError
 * Rate-limited: max 1 alert per route per 5 minutes
 */
const recentAlerts = new Map();
const RATE_LIMIT_MS = 5 * 60 * 1000;

export function shouldAlert(routeKey) {
  const last = recentAlerts.get(routeKey);
  if (last && Date.now() - last < RATE_LIMIT_MS) return false;
  recentAlerts.set(routeKey, Date.now());
  // Cleanup old entries
  if (recentAlerts.size > 500) {
    const cutoff = Date.now() - RATE_LIMIT_MS;
    for (const [k, v] of recentAlerts) {
      if (v < cutoff) recentAlerts.delete(k);
    }
  }
  return true;
}
