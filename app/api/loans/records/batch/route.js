import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

// Generate payment order number sequence: LN-YYYYMMDD-XXXX (loan source)
async function getOrderSeq(tx, dateStr) {
  const prefix = `LN-${dateStr}-`;
  const existing = await tx.paymentOrder.findMany({
    where: { orderNo: { startsWith: prefix } },
    select: { orderNo: true }
  });
  let maxSeq = 0;
  for (const item of existing) {
    const seq = parseInt(item.orderNo.substring(prefix.length)) || 0;
    if (seq > maxSeq) maxSeq = seq;
  }
  return maxSeq;
}

export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.LOAN_CREATE);
  if (!auth.ok) return auth.response;

  try {
    const data = await request.json();

    if (!data.year || !data.month || !data.loanIds || !Array.isArray(data.loanIds) || data.loanIds.length === 0) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '年份、月份、貸款ID列表為必填', 400);
    }

    const year = parseInt(data.year);
    const month = parseInt(data.month);
    const loanIds = data.loanIds.map(id => parseInt(id));
    const autoPush = data.autoPush !== false; // default true: auto-push to cashier

    // Get all target loans
    const loans = await prisma.loanMaster.findMany({
      where: {
        id: { in: loanIds },
        status: '使用中'
      }
    });

    if (loans.length === 0) {
      return createErrorResponse('LOAN_ACCOUNT_NOT_FOUND', '找不到有效的貸款', 404);
    }

    // Check which records already exist
    const existingRecords = await prisma.loanMonthlyRecord.findMany({
      where: {
        loanId: { in: loanIds },
        recordYear: year,
        recordMonth: month
      },
      select: { loanId: true }
    });

    const existingLoanIds = new Set(existingRecords.map(r => r.loanId));

    const created = [];
    const pushed = [];
    const skipped = [];

    const todayStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const userName = auth.session?.user?.name || auth.session?.user?.email || 'system';

    for (const loan of loans) {
      if (existingLoanIds.has(loan.id)) {
        skipped.push({ loanId: loan.id, loanName: loan.loanName, reason: '記錄已存在' });
        continue;
      }

      // Calculate estimated amounts based on loan info
      const currentBalance = Number(loan.currentBalance);
      const annualRate = Number(loan.annualRate);
      const monthlyInterest = Math.round(currentBalance * (annualRate / 100) / 12);

      let estimatedPrincipal = 0;
      if (loan.endDate) {
        const endDate = new Date(loan.endDate);
        const currentDate = new Date(year, month - 1, 1);
        const monthsRemaining = Math.max(1, (endDate.getFullYear() - currentDate.getFullYear()) * 12 + (endDate.getMonth() - currentDate.getMonth()));
        estimatedPrincipal = Math.round(currentBalance / monthsRemaining);
      }

      const repDay = Math.min(loan.repaymentDay, 28);
      const dueDate = `${year}-${String(month).padStart(2, '0')}-${String(repDay).padStart(2, '0')}`;
      const estimatedTotal = estimatedPrincipal + monthlyInterest;

      // Create record + optional auto-push in a single transaction
      try {
        const result = await prisma.$transaction(async (tx) => {
          // Re-check inside transaction to prevent duplicate creation
          const existingInTx = await tx.loanMonthlyRecord.findFirst({
            where: { loanId: loan.id, recordYear: year, recordMonth: month }
          });
          if (existingInTx) throw new Error('IDEMPOTENT:記錄已存在');

          const record = await tx.loanMonthlyRecord.create({
            data: {
              loanId: loan.id,
              recordYear: year,
              recordMonth: month,
              dueDate,
              status: '暫估',
              estimatedPrincipal,
              estimatedInterest: monthlyInterest,
              estimatedTotal,
              estimatedAt: new Date(),
              deductAccountId: loan.deductAccountId
            }
          });

          let pushedOrder = null;

          // Auto-push to cashier: create PaymentOrder and update status
          if (autoPush && estimatedTotal > 0 && loan.deductAccountId) {
            const currentSeq = await getOrderSeq(tx, todayStr);
            const orderNo = `LN-${todayStr}-${String(currentSeq + 1).padStart(4, '0')}`;

            const paymentOrder = await tx.paymentOrder.create({
              data: {
                orderNo,
                invoiceIds: JSON.stringify([]),
                supplierName: `${loan.bankName} — ${loan.loanName}`,
                warehouse: loan.warehouse || null,
                paymentMethod: '匯款',
                amount: estimatedTotal,
                discount: 0,
                netAmount: estimatedTotal,
                dueDate,
                accountId: loan.deductAccountId,
                summary: `貸款還款 — ${loan.loanCode} ${loan.loanName} ${year}/${String(month).padStart(2, '0')}`,
                note: `暫估 ${estimatedTotal.toLocaleString()} [批次建立自動推送]`,
                status: '待出納',
                createdBy: userName
              }
            });

            await tx.loanMonthlyRecord.update({
              where: { id: record.id },
              data: {
                status: '待出納',
                paymentOrderId: paymentOrder.id
              }
            });

            pushedOrder = paymentOrder;
          }

          return { record, pushedOrder };
        });

        if (result.pushedOrder) {
          pushed.push({
            loanName: loan.loanName,
            orderNo: result.pushedOrder.orderNo,
            amount: estimatedTotal
          });
        }

        created.push({
          ...result.record,
          estimatedPrincipal: Number(result.record.estimatedPrincipal),
          estimatedInterest: Number(result.record.estimatedInterest),
          estimatedTotal: Number(result.record.estimatedTotal),
          createdAt: result.record.createdAt.toISOString(),
          updatedAt: result.record.updatedAt.toISOString()
        });
      } catch (err) {
        if (err.message?.startsWith('IDEMPOTENT:')) {
          skipped.push({ loanId: loan.id, loanName: loan.loanName, reason: '記錄已存在' });
        } else {
          skipped.push({ loanId: loan.id, loanName: loan.loanName, reason: `建立失敗: ${err.message}` });
        }
      }
    }

    const pushedMsg = pushed.length > 0
      ? `，${pushed.length} 筆已自動推送至出納`
      : '';

    return NextResponse.json({
      created: created.length,
      skipped: skipped.length,
      pushed: pushed.length,
      records: created,
      skippedDetails: skipped,
      pushedDetails: pushed,
      message: `成功建立 ${created.length} 筆${pushedMsg}，跳過 ${skipped.length} 筆`
    }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
