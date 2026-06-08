import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { handleApiError } from '@/lib/error-handler';
import { todayStr } from '@/lib/localDate';

export const dynamic = 'force-dynamic';

/**
 * GET /api/analytics/receivables
 *
 * 跨模組應收帳款統一視圖：
 *   rental      - 租屋逾期/待收租金
 *   pms         - PMS 信用卡未核對（有金額但未建帳）
 *   engineering - 工程已核定估驗未收款
 */
export async function GET() {
  const auth = await requirePermission(PERMISSIONS.ANALYTICS_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const today = todayStr();

    // ── 租屋租金 ──────────────────────────────────────────────────
    const rentalRows = await prisma.rentalIncome.findMany({
      where: {
        status:  { in: ['pending', 'overdue', 'partial'] },
        dueDate: { not: null },
      },
      select: {
        id: true, expectedAmount: true, actualAmount: true, dueDate: true,
        incomeYear: true, incomeMonth: true,
        property: { select: { name: true } },
        tenant:   { select: { fullName: true, companyName: true, tenantType: true } },
      },
      orderBy: { dueDate: 'asc' },
      take: 200,
    });

    const rental = rentalRows.map(r => {
      const expected = Number(r.expectedAmount);
      const actual   = Number(r.actualAmount || 0);
      const amount   = Math.max(0, expected - actual);
      const tenantName = r.tenant?.tenantType === 'company' ? r.tenant.companyName : r.tenant?.fullName;
      const daysOverdue = r.dueDate < today ? Math.floor((new Date(today) - new Date(r.dueDate)) / 86400000) : 0;
      return {
        id:          r.id,
        party:       tenantName || '未知租客',
        description: `${r.property?.name || ''} ${r.incomeYear}/${String(r.incomeMonth).padStart(2, '0')} 租金`,
        amount,
        dueDate:     r.dueDate,
        daysOverdue,
        url:         '/rentals?tab=analytics&sub=overdue',
      };
    }).filter(r => r.amount > 0);

    // ── PMS 信用卡未核對 ──────────────────────────────────────────
    const pmsRows = await prisma.pmsReservationRecord.findMany({
      where: {
        creditCard:       { gt: 0 },
        creditCardStatus: { notIn: ['已核對', '已建帳', 'cc_已建帳'] },
      },
      select: { id: true, creditCard: true, businessDate: true, guestName: true, warehouse: true },
      orderBy: { businessDate: 'asc' },
      take: 200,
    });

    const pms = pmsRows.map(r => {
      const daysOverdue = r.businessDate < today ? Math.floor((new Date(today) - new Date(r.businessDate)) / 86400000) : 0;
      return {
        id:          r.id,
        party:       r.guestName || '訪客',
        description: `${r.warehouse || ''} ${r.businessDate} 信用卡收款（未核對）`,
        amount:      Number(r.creditCard),
        dueDate:     r.businessDate,
        daysOverdue,
        url:         '/pms-income?tab=creditCardStatement',
      };
    });

    // ── 工程應收（已核定估驗但無銷項發票） ─────────────────────────
    const engRows = await prisma.engineeringProgressClaim.findMany({
      where: {
        status: 'certified',
      },
      include: {
        contract: { select: { contractName: true, clientName: true } },
        outputInvoices: { where: { status: { not: '已作廢' } }, select: { id: true, totalAmount: true } },
      },
      orderBy: { certifiedDate: 'asc' },
      take: 100,
    });

    const engineering = engRows
      .filter(c => {
        const invoiced = c.outputInvoices.reduce((s, i) => s + Number(i.totalAmount || 0), 0);
        return invoiced < Number(c.claimAmount || 0);
      })
      .map(c => {
        const invoiced = c.outputInvoices.reduce((s, i) => s + Number(i.totalAmount || 0), 0);
        const amount   = Math.max(0, Number(c.claimAmount || 0) - invoiced);
        const daysOverdue = c.certifiedDate && c.certifiedDate < today
          ? Math.floor((new Date(today) - new Date(c.certifiedDate)) / 86400000)
          : 0;
        return {
          id:          c.id,
          party:       c.contract?.clientName || '未知業主',
          description: `${c.contract?.contractName || ''} ${c.claimNo || ''} 估驗計價`,
          amount,
          dueDate:     c.certifiedDate || null,
          daysOverdue,
          url:         '/engineering?tab=progressClaims',
        };
      });

    return NextResponse.json({ rental, pms, engineering });
  } catch (error) {
    return handleApiError(error);
  }
}
