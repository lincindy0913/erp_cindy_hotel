/**
 * POST /api/cron/monthly-reports
 *
 * 每月 1 日由外部排程（GitHub Actions）觸發，輸出：
 *   - 即將到期合約清單（60 天內）
 *   - 當月逾期未收租金摘要
 *
 * 驗證：Authorization: Bearer <CRON_SECRET>
 */
import crypto from 'crypto';
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { todayStr, localDateStr } from '@/lib/localDate';

export const dynamic = 'force-dynamic';

function checkAuth(request) {
  const header = request.headers.get('authorization') || '';
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32) return false;
  const provided = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!provided || provided.length !== secret.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(secret));
  } catch {
    return false;
  }
}

export async function POST(request) {
  if (!checkAuth(request)) {
    return createErrorResponse('UNAUTHORIZED', 'Unauthorized', 401);
  }

  try {
    const today    = todayStr();
    const in60days = localDateStr(new Date(Date.now() + 60 * 86400000));
    const now      = new Date();
    const year     = now.getFullYear();
    const month    = now.getMonth() + 1;

    // ── 1. 即將到期合約（60 天內）─────────────────────────────
    const expiringContracts = await prisma.rentalContract.findMany({
      where: {
        status: 'active',
        endDate: { gte: today, lte: in60days },
      },
      include: {
        property: { select: { name: true } },
        tenant:   { select: { fullName: true, companyName: true, tenantType: true, phone: true } },
      },
      orderBy: { endDate: 'asc' },
    });

    // ── 2. 當月逾期未收租金 ────────────────────────────────────
    const overdueIncomes = await prisma.rentalIncome.findMany({
      where: {
        incomeYear:  year,
        incomeMonth: month,
        status:      'pending',
        dueDate:     { lt: today },
      },
      include: {
        property: { select: { name: true } },
        tenant:   { select: { fullName: true, companyName: true, tenantType: true } },
      },
      orderBy: { dueDate: 'asc' },
    });

    const overdueAmount = overdueIncomes.reduce((s, i) => s + Number(i.expectedAmount), 0);

    // ── 3. 組裝報告 ────────────────────────────────────────────
    const report = {
      generatedAt:       new Date().toISOString(),
      reportMonth:       `${year}-${String(month).padStart(2, '0')}`,
      expiringContracts: expiringContracts.map(c => ({
        contractNo:   c.contractNo,
        propertyName: c.property.name,
        tenantName:   c.tenant.tenantType === 'company' ? c.tenant.companyName : c.tenant.fullName,
        tenantPhone:  c.tenant.phone || null,
        endDate:      c.endDate,
        daysLeft:     Math.ceil((new Date(c.endDate) - new Date(today)) / 86400000),
        monthlyRent:  Number(c.monthlyRent),
      })),
      overdueIncomes: overdueIncomes.map(i => ({
        propertyName:   i.property.name,
        tenantName:     i.tenant.tenantType === 'company' ? i.tenant.companyName : i.tenant.fullName,
        expectedAmount: Number(i.expectedAmount),
        dueDate:        i.dueDate,
        daysOverdue:    Math.floor((new Date(today) - new Date(i.dueDate)) / 86400000),
      })),
      summary: {
        expiringCount: expiringContracts.length,
        within30Days:  expiringContracts.filter(c => Math.ceil((new Date(c.endDate) - new Date(today)) / 86400000) <= 30).length,
        overdueCount:  overdueIncomes.length,
        overdueAmount: Math.round(overdueAmount),
      },
    };

    console.log(`[cron/monthly-reports] ${report.reportMonth} 到期合約 ${report.summary.expiringCount} 筆，逾期 ${report.summary.overdueCount} 筆`);

    return NextResponse.json(report);
  } catch (error) {
    console.error('[cron/monthly-reports] error:', error.message || error);
    return handleApiError(error);
  }
}
