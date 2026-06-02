import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { applyWarehouseFilter } from '@/lib/warehouse-access';

export const dynamic = 'force-dynamic';

// GET /api/cashflow/anomaly-scan
//   ?startDate=YYYY-MM-DD  (預設：今日往前 30 天)
//   ?endDate=YYYY-MM-DD    (預設：今日)
//   ?accountId=            (選填，不給則全帳戶)
//   ?amountWindow=7        (同金額重複偵測的天數窗口，預設 7)
//   ?supplierDailyMin=3    (同廠商同日筆數觸發門檻，預設 3)
export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.CASHFLOW_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);

    const today = new Date().toISOString().slice(0, 10);
    const thirtyAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

    const startDate       = searchParams.get('startDate')       || thirtyAgo;
    const endDate         = searchParams.get('endDate')         || today;
    const accountId       = searchParams.get('accountId')       ? parseInt(searchParams.get('accountId')) : null;
    const amountWindow    = parseInt(searchParams.get('amountWindow')    || '7');
    const supplierDailyMin = parseInt(searchParams.get('supplierDailyMin') || '3');

    const where = {
      transactionDate: { gte: startDate, lte: endDate },
      type: { in: ['收入', '支出'] },
      status: { not: 'cc_pending' },
    };
    if (accountId) where.accountId = accountId;
    const wf = applyWarehouseFilter(auth.session, where);
    if (!wf.ok) return wf.response;

    const txs = await prisma.cashTransaction.findMany({
      where,
      select: {
        id: true,
        transactionDate: true,
        type: true,
        amount: true,
        supplierId: true,
        accountId: true,
        description: true,
        transactionNo: true,
        supplier: { select: { name: true } },
        account:  { select: { name: true } },
      },
      orderBy: [{ transactionDate: 'asc' }, { id: 'asc' }],
    });

    const anomalies = [];

    // ── 1. 同廠商同日多筆 ──────────────────────────────────────
    // 按 (supplierId, transactionDate) 分組，筆數 >= supplierDailyMin 才告警
    const supplierDayMap = {};
    for (const tx of txs) {
      if (!tx.supplierId) continue;
      const key = `${tx.supplierId}_${tx.transactionDate}`;
      if (!supplierDayMap[key]) supplierDayMap[key] = [];
      supplierDayMap[key].push(tx);
    }
    for (const [key, group] of Object.entries(supplierDayMap)) {
      if (group.length < supplierDailyMin) continue;
      const total = group.reduce((s, t) => s + Number(t.amount), 0);
      anomalies.push({
        type:       'supplier_surge',
        severity:   group.length >= supplierDailyMin * 2 ? 'high' : 'medium',
        txIds:      group.map(t => t.id),
        txNos:      group.map(t => t.transactionNo),
        date:       group[0].transactionDate,
        supplierId: group[0].supplierId,
        supplier:   group[0].supplier?.name || `廠商 #${group[0].supplierId}`,
        account:    group[0].account?.name  || `帳戶 #${group[0].accountId}`,
        count:      group.length,
        totalAmount: Math.round(total * 100) / 100,
        message:    `廠商「${group[0].supplier?.name || group[0].supplierId}」在 ${group[0].transactionDate} 出現 ${group.length} 筆，合計 ${total.toLocaleString('zh-TW')}`,
      });
    }

    // ── 2. 同金額在時間窗口內重複出現 ──────────────────────────
    // 按 (accountId, amount, type) 分組，找出在 amountWindow 天內出現 3+ 次者
    // 只看支出（收入重複較正常，如月租）
    const expenseTxs = txs.filter(t => t.type === '支出');

    // 按 (accountId, amount) 分組
    const amountMap = {};
    for (const tx of expenseTxs) {
      const key = `${tx.accountId}_${Number(tx.amount).toFixed(2)}`;
      if (!amountMap[key]) amountMap[key] = [];
      amountMap[key].push(tx);
    }

    for (const [, group] of Object.entries(amountMap)) {
      if (group.length < 3) continue;

      // 在 amountWindow 天窗口內滑動，找最密集的一段
      for (let i = 0; i < group.length - 2; i++) {
        const windowStart = group[i].transactionDate;
        const windowEnd   = new Date(
          new Date(windowStart + 'T00:00:00Z').getTime() + amountWindow * 86400000
        ).toISOString().slice(0, 10);

        const inWindow = group.filter(
          t => t.transactionDate >= windowStart && t.transactionDate <= windowEnd
        );
        if (inWindow.length < 3) continue;

        anomalies.push({
          type:       'duplicate_amount',
          severity:   inWindow.length >= 5 ? 'high' : 'medium',
          txIds:      inWindow.map(t => t.id),
          txNos:      inWindow.map(t => t.transactionNo),
          windowStart,
          windowEnd,
          amount:     Number(group[i].amount),
          account:    inWindow[0].account?.name || `帳戶 #${inWindow[0].accountId}`,
          count:      inWindow.length,
          message:    `金額 ${Number(group[i].amount).toLocaleString('zh-TW')} 元在 ${amountWindow} 天內重複出現 ${inWindow.length} 次`,
        });
        break; // 同組只報一次
      }
    }

    // 按嚴重度排序：high 優先
    anomalies.sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 };
      return (order[a.severity] ?? 9) - (order[b.severity] ?? 9);
    });

    return NextResponse.json({
      scannedFrom:   startDate,
      scannedTo:     endDate,
      scannedCount:  txs.length,
      anomalyCount:  anomalies.length,
      anomalies,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
