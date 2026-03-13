import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.LOAN_VIEW);
  if (!auth.ok) return auth.response;
  
  try {
    const { searchParams } = new URL(request.url);
    const loanId = searchParams.get('loanId');
    const year = searchParams.get('year');
    const month = searchParams.get('month');
    const status = searchParams.get('status');
    const warehouse = searchParams.get('warehouse');

    const where = {};
    if (loanId) where.loanId = parseInt(loanId);
    if (year) where.recordYear = parseInt(year);
    if (month) where.recordMonth = parseInt(month);
    if (status) where.status = status;
    if (warehouse) {
      where.loan = { warehouse };
    }

    const records = await prisma.loanMonthlyRecord.findMany({
      where,
      include: {
        loan: {
          select: {
            id: true,
            loanCode: true,
            loanName: true,
            bankName: true,
            warehouse: true,
            originalAmount: true,
            currentBalance: true,
            annualRate: true,
            repaymentDay: true,
            deductAccountId: true,
            remark: true,
            deductAccount: {
              select: { id: true, name: true }
            }
          }
        }
      },
      orderBy: [{ recordYear: 'desc' }, { recordMonth: 'desc' }, { loanId: 'asc' }]
    });

    // Fetch pre-deposit and payment transactions linked to these records
    const recordIds = records.map(r => r.id);
    const linkedTxns = recordIds.length > 0 ? await prisma.cashTransaction.findMany({
      where: {
        sourceRecordId: { in: recordIds },
        sourceType: { in: ['loan_predeposit', 'loan_payment'] }
      },
      select: {
        id: true, sourceRecordId: true, sourceType: true, type: true,
        transactionNo: true, transactionDate: true, amount: true, description: true
      }
    }) : [];

    // Also fetch cashier payment transactions linked via PaymentOrder
    const paymentOrderIds = records.map(r => r.paymentOrderId).filter(Boolean);
    const cashierTxns = paymentOrderIds.length > 0 ? await prisma.cashTransaction.findMany({
      where: {
        sourceRecordId: { in: paymentOrderIds },
        sourceType: 'cashier_payment'
      },
      select: {
        id: true, sourceRecordId: true, sourceType: true, type: true,
        transactionNo: true, transactionDate: true, amount: true, description: true
      }
    }) : [];

    // Map paymentOrderId → recordId for cashier transactions
    const orderToRecord = {};
    for (const r of records) {
      if (r.paymentOrderId) orderToRecord[r.paymentOrderId] = r.id;
    }

    // Group transactions by record ID
    const txByRecord = {};
    for (const tx of linkedTxns) {
      if (!txByRecord[tx.sourceRecordId]) txByRecord[tx.sourceRecordId] = [];
      txByRecord[tx.sourceRecordId].push({
        ...tx, amount: Number(tx.amount)
      });
    }
    // Add cashier payment transactions mapped to their loan record
    for (const tx of cashierTxns) {
      const recId = orderToRecord[tx.sourceRecordId];
      if (!recId) continue;
      if (!txByRecord[recId]) txByRecord[recId] = [];
      txByRecord[recId].push({
        ...tx,
        sourceRecordId: recId,
        sourceType: 'cashier_payment',
        amount: Number(tx.amount)
      });
    }

    const result = records.map(r => ({
      ...r,
      estimatedPrincipal: Number(r.estimatedPrincipal),
      estimatedInterest: Number(r.estimatedInterest),
      estimatedTotal: Number(r.estimatedTotal),
      actualPrincipal: r.actualPrincipal !== null ? Number(r.actualPrincipal) : null,
      actualInterest: r.actualInterest !== null ? Number(r.actualInterest) : null,
      actualTotal: r.actualTotal !== null ? Number(r.actualTotal) : null,
      loan: r.loan ? {
        ...r.loan,
        originalAmount: Number(r.loan.originalAmount),
        currentBalance: Number(r.loan.currentBalance),
        annualRate: Number(r.loan.annualRate)
      } : null,
      preDeposit: (txByRecord[r.id] || []).find(t => t.sourceType === 'loan_predeposit') || null,
      paymentTxns: (txByRecord[r.id] || []).filter(t => t.sourceType === 'loan_payment'),
      cashierTxns: (txByRecord[r.id] || []).filter(t => t.sourceType === 'cashier_payment'),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      confirmedAt: r.confirmedAt ? r.confirmedAt.toISOString() : null,
      estimatedAt: r.estimatedAt ? r.estimatedAt.toISOString() : null
    }));

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.LOAN_CREATE);
  if (!auth.ok) return auth.response;
  
  try {
    const data = await request.json();

    if (!data.loanId || !data.recordYear || !data.recordMonth) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '貸款ID、年份、月份為必填', 400);
    }

    const loanId = parseInt(data.loanId);
    const recordYear = parseInt(data.recordYear);
    const recordMonth = parseInt(data.recordMonth);

    // Check if record already exists
    const existing = await prisma.loanMonthlyRecord.findUnique({
      where: {
        loanId_recordYear_recordMonth: { loanId, recordYear, recordMonth }
      }
    });

    if (existing) {
      return createErrorResponse('CONFLICT_UNIQUE', `${recordYear}年${recordMonth}月的記錄已存在`, 409);
    }

    // Get loan info for dueDate calculation
    const loan = await prisma.loanMaster.findUnique({ where: { id: loanId } });
    if (!loan) {
      return createErrorResponse('LOAN_ACCOUNT_NOT_FOUND', '貸款不存在', 404);
    }

    const estimatedPrincipal = parseFloat(data.estimatedPrincipal) || 0;
    const estimatedInterest = parseFloat(data.estimatedInterest) || 0;
    const estimatedTotal = estimatedPrincipal + estimatedInterest;

    // Calculate dueDate from repaymentDay
    const repDay = Math.min(loan.repaymentDay, 28); // safe day
    const dueDate = `${recordYear}-${String(recordMonth).padStart(2, '0')}-${String(repDay).padStart(2, '0')}`;

    const record = await prisma.loanMonthlyRecord.create({
      data: {
        loanId,
        recordYear,
        recordMonth,
        dueDate,
        status: '暫估',
        estimatedPrincipal,
        estimatedInterest,
        estimatedTotal,
        estimatedAt: new Date(),
        deductAccountId: loan.deductAccountId,
        note: data.note || null
      }
    });

    return NextResponse.json({
      ...record,
      estimatedPrincipal: Number(record.estimatedPrincipal),
      estimatedInterest: Number(record.estimatedInterest),
      estimatedTotal: Number(record.estimatedTotal),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString()
    }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
