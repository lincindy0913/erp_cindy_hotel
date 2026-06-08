import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { pushNotification } from '@/lib/notify';

export const dynamic = 'force-dynamic';

function checkAuth(request) {
  const header = request.headers.get('authorization') || '';
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return header === `Bearer ${secret}`;
}

/**
 * POST /api/cron/notify-alerts
 * 每日推播業務警示：支票到期（N03）、支票逾期（N04）、貸款還款（N02）、貸款到期（N07）
 * 透過 lib/notify.js 推播 LINE + Email 給訂閱使用者
 */
export async function POST(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const todayStr = new Date().toISOString().slice(0, 10);
    const sevenDaysLater = new Date();
    sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);
    const sevenDaysStr = sevenDaysLater.toISOString().slice(0, 10);
    const appUrl = process.env.NEXTAUTH_URL || '';

    const results = [];

    // ── N03：支票 7 天內到期 ─────────────────────────────────────
    const dueSoonChecks = await prisma.check.findMany({
      where: {
        status:  { in: ['pending', 'due', '待兌現'] },
        dueDate: { gte: todayStr, lte: sevenDaysStr },
      },
      select: { checkNo: true, amount: true, dueDate: true, drawerName: true },
      orderBy: { dueDate: 'asc' },
    });

    if (dueSoonChecks.length > 0) {
      const total = dueSoonChecks.reduce((s, c) => s + Number(c.amount), 0);
      const details = dueSoonChecks.slice(0, 5).map(c =>
        `• ${c.checkNo} ${c.drawerName ? `(${c.drawerName})` : ''} — 到期 ${c.dueDate}，NT$ ${Number(c.amount).toLocaleString('zh-TW')}`
      ).join('\n');
      const r = await pushNotification('N03', '⚠ 支票即將到期提醒',
        `共 ${dueSoonChecks.length} 張支票將於 7 天內到期，合計 NT$ ${total.toLocaleString('zh-TW')}。\n\n${details}`,
        `${appUrl}/checks`);
      results.push({ code: 'N03', count: dueSoonChecks.length, ...r });
    }

    // ── N04：支票已逾期 ──────────────────────────────────────────
    const overdueChecks = await prisma.check.findMany({
      where: {
        dueDate: { lt: todayStr },
        status:  { notIn: ['cleared', 'bounced', 'void', '已兌現', '已退票', '已作廢'] },
      },
      select: { checkNo: true, amount: true, dueDate: true, drawerName: true },
      orderBy: { dueDate: 'asc' },
    });

    if (overdueChecks.length > 0) {
      const total = overdueChecks.reduce((s, c) => s + Number(c.amount), 0);
      const details = overdueChecks.slice(0, 5).map(c => {
        const days = Math.floor((new Date(todayStr) - new Date(c.dueDate)) / 86400000);
        return `• ${c.checkNo} — 逾期 ${days} 天，NT$ ${Number(c.amount).toLocaleString('zh-TW')}`;
      }).join('\n');
      const r = await pushNotification('N04', '🚨 支票已逾期未兌現',
        `共 ${overdueChecks.length} 張支票已逾期，合計 NT$ ${total.toLocaleString('zh-TW')}。\n\n${details}`,
        `${appUrl}/checks`);
      results.push({ code: 'N04', count: overdueChecks.length, ...r });
    }

    // ── N02：貸款本月還款日在 3 天內 ────────────────────────────
    const today        = new Date();
    const currentYear  = today.getFullYear();
    const currentMonth = today.getMonth() + 1;
    const currentDay   = today.getDate();

    const activeLoans = await prisma.loanMaster.findMany({
      where:  { status: '使用中' },
      select: { id: true, loanName: true, repaymentDay: true, loanCode: true },
    });

    if (activeLoans.length > 0) {
      const paidIds = new Set(
        (await prisma.loanMonthlyRecord.findMany({
          where: { loanId: { in: activeLoans.map(l => l.id) }, recordYear: currentYear, recordMonth: currentMonth, status: { notIn: ['暫估'] } },
          select: { loanId: true },
        })).map(r => r.loanId)
      );

      const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
      const upcoming = activeLoans.filter(l => {
        const repayDay  = Math.min(l.repaymentDay, daysInMonth);
        const daysUntil = repayDay - currentDay;
        return daysUntil >= 0 && daysUntil <= 3 && !paidIds.has(l.id);
      });

      if (upcoming.length > 0) {
        const details = upcoming.map(l => `• ${l.loanName}（${l.loanCode || ''}）`).join('\n');
        const r = await pushNotification('N02', '💳 貸款還款日即將到來',
          `共 ${upcoming.length} 筆貸款還款日在 3 天內。\n\n${details}`,
          `${appUrl}/loans`);
        results.push({ code: 'N02', count: upcoming.length, ...r });
      }
    }

    // ── N07：貸款 6 個月內到期 ───────────────────────────────────
    const sixMonthsLater = new Date();
    sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);
    const sixMonthsStr = sixMonthsLater.toISOString().slice(0, 10);

    const expiringLoans = await prisma.loanMaster.findMany({
      where: { status: '使用中', endDate: { lte: sixMonthsStr } },
      select: { loanName: true, endDate: true, loanCode: true },
      orderBy: { endDate: 'asc' },
    });

    if (expiringLoans.length > 0) {
      const details = expiringLoans.slice(0, 5).map(l => {
        const days = Math.floor((new Date(l.endDate) - today) / 86400000);
        return `• ${l.loanName} — ${days} 天後到期（${l.endDate}）`;
      }).join('\n');
      const r = await pushNotification('N07', '📅 貸款即將到期預警',
        `共 ${expiringLoans.length} 筆貸款將在 6 個月內到期。\n\n${details}`,
        `${appUrl}/loans`);
      results.push({ code: 'N07', count: expiringLoans.length, ...r });
    }

    return NextResponse.json({ results, totalAlerts: results.length });
  } catch (error) {
    return handleApiError(error);
  }
}
