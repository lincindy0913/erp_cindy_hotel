/**
 * 業務通知推播工具
 * 支援 LINE Bot 推播 + Email（複用 SystemNotificationConfig 與 UserNotificationChannel）
 * 適用於：租金逾期、支票到期、貸款還款等定期提醒
 */
import prisma from '@/lib/prisma';
import { decryptField } from '@/lib/field-encryption';

/**
 * 推播業務通知給所有有訂閱該 notificationCode 的使用者
 *
 * @param {string} notificationCode - e.g. 'N15'
 * @param {string} title - 通知標題
 * @param {string} body  - 通知內文
 * @param {string} url   - 前往連結（可選）
 */
export async function pushNotification(notificationCode, title, body, url = '') {
  const rawConfig = await prisma.systemNotificationConfig.findFirst();
  if (!rawConfig) return { sent: 0, failed: 0 };

  const sysConfig = {
    ...rawConfig,
    smtpPassword:       decryptField(rawConfig.smtpPassword),
    lineBotAccessToken: decryptField(rawConfig.lineBotAccessToken),
  };

  // 取得訂閱該代碼且 LINE/Email 啟用的使用者
  const channels = await prisma.userNotificationChannel.findMany({
    where: { notificationCode, OR: [{ enableLine: true }, { enableEmail: true }] },
    include: {
      user: {
        select: { id: true, name: true, email: true, notificationEmail: true, lineUserId: true, isActive: true },
      },
    },
  });

  const activeChannels = channels.filter(c => c.user?.isActive);
  let sent = 0, failed = 0;

  for (const ch of activeChannels) {
    const { user } = ch;

    // LINE
    if (ch.enableLine && sysConfig.lineBotEnabled && sysConfig.lineBotAccessToken && user.lineUserId) {
      const lineText = `📋 ${title}\n${body}${url ? `\n\n🔗 ${url}` : ''}\n\n時間：${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}`;
      try {
        const res = await fetch('https://api.line.me/v2/bot/message/push', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sysConfig.lineBotAccessToken}` },
          body:    JSON.stringify({ to: user.lineUserId, messages: [{ type: 'text', text: lineText }] }),
        });
        const status = res.ok ? 'sent' : 'failed';
        await prisma.notificationDeliveryLog.create({
          data: { notificationCode, userId: user.id, channel: 'line', status, sentAt: res.ok ? new Date() : undefined, errorMessage: res.ok ? undefined : `LINE API ${res.status}` },
        }).catch(() => {});
        if (res.ok) sent++; else failed++;
      } catch (e) {
        await prisma.notificationDeliveryLog.create({
          data: { notificationCode, userId: user.id, channel: 'line', status: 'failed', errorMessage: e.message },
        }).catch(() => {});
        failed++;
      }
    }

    // Email
    if (ch.enableEmail && sysConfig.smtpEnabled && sysConfig.smtpHost) {
      const recipientEmail = user.notificationEmail || user.email;
      if (!recipientEmail) continue;
      try {
        const nodemailer = await import('nodemailer');
        const transporter = nodemailer.default.createTransport({
          host: sysConfig.smtpHost,
          port: sysConfig.smtpPort || 587,
          secure: sysConfig.smtpPort === 465,
          auth: { user: sysConfig.smtpUser, pass: sysConfig.smtpPassword },
          tls: { rejectUnauthorized: false },
        });
        const fromName  = sysConfig.smtpFromName  || '財務系統';
        const fromEmail = sysConfig.smtpFromEmail || sysConfig.smtpUser;
        await transporter.sendMail({
          from: `"${fromName}" <${fromEmail}>`,
          to:   recipientEmail,
          subject: `【${title}】`,
          html: `
            <div style="font-family:sans-serif;max-width:600px;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
              <div style="background:#0d9488;color:white;padding:16px 24px;">
                <h2 style="margin:0;">${title}</h2>
              </div>
              <div style="padding:24px;">
                <p style="white-space:pre-line;">${body}</p>
                ${url ? `<p><a href="${url}" style="color:#0d9488;">前往處理 →</a></p>` : ''}
                <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;" />
                <p style="color:#9ca3af;font-size:12px;">發送時間：${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}</p>
              </div>
            </div>
          `,
        });
        await prisma.notificationDeliveryLog.create({
          data: { notificationCode, userId: user.id, channel: 'email', status: 'sent', sentAt: new Date() },
        }).catch(() => {});
        sent++;
      } catch (e) {
        await prisma.notificationDeliveryLog.create({
          data: { notificationCode, userId: user.id, channel: 'email', status: 'failed', errorMessage: e.message },
        }).catch(() => {});
        failed++;
      }
    }
  }

  return { sent, failed, total: activeChannels.length };
}
