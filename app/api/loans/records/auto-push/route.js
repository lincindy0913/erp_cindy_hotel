import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

// Generate payment order number: LN-YYYYMMDD-XXXX (loan source)
async function generateOrderNo(date) {
  const dateStr = (date || new Date().toISOString().split('T')[0]).replace(/-/g, '');
  const prefix = `LN-${dateStr}-`;
  const existing = await prisma.paymentOrder.findMany({
    where: { orderNo: { startsWith: prefix } },
    select: { orderNo: true }
  });
  let maxSeq = 0;
  for (const item of existing) {
    const seq = parseInt(item.orderNo.substring(prefix.length)) || 0;
    if (seq > maxSeq) maxSeq = seq;
  }
  return `${prefix}${String(maxSeq + 1).padStart(4, '0')}`;
}

// POST: Auto-push loan records due within N days to cashier
// Creates PaymentOrders for records still in 暫估 status
export async function POST(request) {
  const auth = await requireAnyPermission([PERMISSIONS.LOAN_CREATE, PERMISSIONS.LOAN_VIEW, PERMISSIONS.CASHFLOW_CREATE]);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json().catch(() => ({}));
    const daysBeforeDue = body.daysBeforeDue || 10;
    const now = new Date();
    const year = body.year || now.getFullYear();
    const month = body.month || (now.getMonth() + 1);

    // Calculate the cutoff date (today + daysBeforeDue)
    const cutoffDate = new Date(now);
    cutoffDate.setDate(cutoffDate.getDate() + daysBeforeDue);
    const cutoffStr = cutoffDate.toISOString().split('T')[0];
    const todayStr = now.toISOString().split('T')[0];

    // Find records that are 暫估 and due within the window
    const records = await prisma.loanMonthlyRecord.findMany({
      where: {
        recordYear: year,
        recordMonth: month,
        status: '暫估',
        dueDate: { lte: cutoffStr }
      },
      include: {
        loan: {
          select: {
            id: true, loanName: true, loanCode: true, bankName: true,
            warehouse: true, deductAccountId: true, status: true
          }
        }
      }
    });

    // Filter only active loans
    const eligible = records.filter(r => r.loan && r.loan.status === '使用中');

    if (eligible.length === 0) {
      return NextResponse.json({ pushed: 0, message: '目前沒有需要推送的記錄' });
    }

    const userName = auth.user?.name || auth.user?.email || 'system';
    const pushed = [];
    const failed = [];

    for (const rec of eligible) {
      const loan = rec.loan;
      const acctId = rec.deductAccountId || loan.deductAccountId;
      if (!acctId) {
        failed.push({ recordId: rec.id, reason: '未設定扣款帳戶' });
        continue;
      }

      const amount = Number(rec.estimatedTotal);
      if (amount <= 0) {
        failed.push({ recordId: rec.id, reason: '金額為零' });
        continue;
      }

      try {
        const orderNo = await generateOrderNo(todayStr);
        const paymentOrder = await prisma.paymentOrder.create({
          data: {
            orderNo,
            invoiceIds: JSON.stringify([]),
            supplierName: `${loan.bankName} — ${loan.loanName}`,
            warehouse: loan.warehouse || null,
            paymentMethod: '匯款',
            amount,
            discount: 0,
            netAmount: amount,
            dueDate: rec.dueDate,
            accountId: acctId,
            summary: `貸款還款 — ${loan.loanCode} ${loan.loanName} ${rec.recordYear}/${String(rec.recordMonth).padStart(2, '0')}`,
            note: `暫估${amount.toLocaleString()} [自動推送]`,
            status: '待出納',
            createdBy: userName
          }
        });

        // Update record status and link paymentOrderId
        await prisma.loanMonthlyRecord.update({
          where: { id: rec.id },
          data: {
            status: '待出納',
            paymentOrderId: paymentOrder.id
          }
        });

        pushed.push({
          recordId: rec.id,
          loanName: loan.loanName,
          amount,
          dueDate: rec.dueDate,
          orderNo: paymentOrder.orderNo
        });
      } catch (e) {
        failed.push({ recordId: rec.id, reason: e.message });
      }
    }

    return NextResponse.json({
      pushed: pushed.length,
      failed: failed.length,
      details: pushed,
      failedDetails: failed,
      message: pushed.length > 0
        ? `已自動推送 ${pushed.length} 筆至出納`
        : '沒有符合條件的記錄需要推送'
    });
  } catch (error) {
    return handleApiError(error);
  }
}
