import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { todayStr } from '@/lib/localDate';
import { pushNotification } from '@/lib/notify';

export const dynamic = 'force-dynamic';

function checkAuth(request) {
  const header = request.headers.get('authorization') || '';
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return header === `Bearer ${secret}`;
}

/**
 * POST /api/cron/notify-rent-overdue
 * 由 GitHub Actions 每日觸發
 * 1. 找出逾期未收租金（status pending/overdue，dueDate < today）
 * 2. 推播 N15 通知給已訂閱的使用者（LINE + Email）
 */
export async function POST(request) {
  if (!checkAuth(request)) {
    return createErrorResponse('UNAUTHORIZED', 'Unauthorized', 401);
  }

  try {
    const today = todayStr();

    // 查詢逾期租金
    const overdueIncomes = await prisma.rentalIncome.findMany({
      where: { status: { in: ['pending', 'overdue'] }, dueDate: { lt: today } },
      select: {
        id: true, expectedAmount: true, incomeYear: true, incomeMonth: true, dueDate: true,
        property: { select: { name: true } },
        tenant:   { select: { fullName: true, companyName: true, tenantType: true } },
      },
    });

    if (overdueIncomes.length === 0) {
      return NextResponse.json({ message: '無逾期租金，不需推播', notified: 0 });
    }

    const totalAmount = overdueIncomes.reduce((s, i) => s + Number(i.expectedAmount), 0);

    // 前 5 筆明細
    const details = overdueIncomes.slice(0, 5).map(i => {
      const tenantName = i.tenant?.tenantType === 'company' ? i.tenant.companyName : i.tenant?.fullName;
      const daysOverdue = Math.floor((new Date(today) - new Date(i.dueDate)) / 86400000);
      return `• ${i.property?.name || '未知'} / ${tenantName || '未知'} ${i.incomeYear}/${i.incomeMonth} — 逾期 ${daysOverdue} 天，應收 NT$ ${Number(i.expectedAmount).toLocaleString('zh-TW')}`;
    }).join('\n');

    const moreText = overdueIncomes.length > 5 ? `\n…還有 ${overdueIncomes.length - 5} 筆` : '';

    const body = `共 ${overdueIncomes.length} 筆租金逾期未收，合計 NT$ ${totalAmount.toLocaleString('zh-TW')}。\n\n${details}${moreText}`;

    // 推播 N15 給訂閱使用者
    const result = await pushNotification(
      'N15',
      '⚠ 逾期租金未收通知',
      body,
      `${process.env.NEXTAUTH_URL || ''}/rentals?tab=analytics&sub=overdue`,
    );

    // 同步更新 in-app Notification 記錄
    await prisma.notification.upsert({
      where: { notificationCode: 'N15' },
      create: {
        notificationCode: 'N15',
        title: '逾期租金未收',
        level: 'urgent',
        count: overdueIncomes.length,
        isActive: true,
        targetUrl: '/rentals?tab=analytics&sub=overdue',
        message: `${overdueIncomes.length} 筆，合計 NT$ ${totalAmount.toLocaleString()}`,
        metadata: { totalAmount, overdueCount: overdueIncomes.length },
      },
      update: {
        count: overdueIncomes.length,
        isActive: true,
        calculatedAt: new Date(),
        message: `${overdueIncomes.length} 筆，合計 NT$ ${totalAmount.toLocaleString()}`,
        metadata: { totalAmount, overdueCount: overdueIncomes.length },
      },
    });

    return NextResponse.json({
      overdueCount: overdueIncomes.length,
      totalAmount,
      notified: result.sent,
      failed: result.failed,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
