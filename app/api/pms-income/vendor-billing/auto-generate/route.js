/**
 * POST /api/pms-income/vendor-billing/auto-generate
 * 依旅行社佣金設定，自動計算本月各 OTA 佣金並建立草稿帳單
 * Body: { warehouse, billingMonth }
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

function sourceForConfig(cfg) {
  const n = cfg.companyName.toLowerCase();
  if (/booking/.test(n))  return 'OTA-Booking';
  if (/agoda/.test(n))    return 'OTA-Agoda';
  if (/expedia/.test(n))  return 'OTA-Expedia';
  return cfg.companyName; // 攜程網, 易遊網 等直接對應
}

export async function POST(request) {
  const auth = await requireAnyPermission([PERMISSIONS.PMS_VIEW, PERMISSIONS.PMS_IMPORT]);
  if (!auth.ok) return auth.response;

  try {
    const { warehouse, billingMonth } = await request.json();
    if (!warehouse)    return createErrorResponse('REQUIRED_FIELD_MISSING', '請選擇館別', 400);
    if (!billingMonth) return createErrorResponse('REQUIRED_FIELD_MISSING', '請選擇帳單月份', 400);

    // 取出 AUTO + 有 AR/AP 方向的有效配置
    const configs = await prisma.travelAgencyCommissionConfig.findMany({
      where: { isActive: true, dataSource: 'AUTO', NOT: { paymentType: 'NONE' } },
    });

    let created = 0;
    let skipped = 0;

    for (const cfg of configs) {
      const source = sourceForConfig(cfg);

      // 已存在同月+同館+同廠商的帳單則略過
      const existing = await prisma.vendorItineraryBilling.findFirst({
        where: { warehouse, billingMonth, supplierName: cfg.companyName },
        select: { id: true },
      });
      if (existing) { skipped++; continue; }

      // 聚合本月該來源的住宿收入
      const reservations = await prisma.pmsReservationRecord.findMany({
        where: {
          warehouse,
          businessDate: { startsWith: billingMonth },
          OR: [
            { sourceOverride: source },
            { source, sourceOverride: null },
            { source, sourceOverride: '' },
          ],
        },
        select: { totalRevenue: true },
      });

      const revenue = reservations.reduce((s, r) => s + Number(r.totalRevenue || 0), 0);
      if (revenue <= 0) continue;

      const commissionPct = Number(cfg.commissionPercentage);
      const commissionAmt = Math.round(revenue * commissionPct / 100);
      if (commissionAmt <= 0) continue;

      // 計算到期日（依 paymentDueDay）
      let dueDate = null;
      if (cfg.paymentDueDay) {
        const [y, m] = billingMonth.split('-');
        const lastDay = new Date(parseInt(y), parseInt(m), 0).getDate();
        const day = Math.min(cfg.paymentDueDay, lastDay);
        dueDate = `${billingMonth}-${String(day).padStart(2, '0')}`;
      }

      await prisma.vendorItineraryBilling.create({
        data: {
          warehouse,
          supplierName: cfg.companyName,
          direction:    cfg.paymentType,
          billingMonth,
          status:       '草稿',
          totalAmount:  commissionAmt,
          settledAmount: 0,
          dueDate,
          notes: `自動建立：${billingMonth} ${source} 佣金（${commissionPct}% × ${Math.round(revenue).toLocaleString('zh-TW')}）`,
          items: {
            create: {
              description: `${billingMonth} ${source} 住宿佣金（${commissionPct}%）`,
              quantity:    1,
              unitPrice:   commissionAmt,
              amount:      commissionAmt,
              notes:       `住宿收入 ${Math.round(revenue).toLocaleString('zh-TW')} × ${commissionPct}%`,
            },
          },
        },
      });
      created++;
    }

    return NextResponse.json({ created, skipped });
  } catch (error) {
    return handleApiError(error);
  }
}
