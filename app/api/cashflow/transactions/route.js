import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { recalcBalance } from '@/lib/recalc-balance';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { applyWarehouseFilter } from '@/lib/warehouse-access';
import { assertPeriodOpen } from '@/lib/period-lock';
import { auditFromSession, AUDIT_ACTIONS } from '@/lib/audit';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../auth/[...nextauth]/route';
import { requireMoney, safeMoney } from '@/lib/safe-parse';
import { nextCashTransactionNo } from '@/lib/sequence-generator';

export const dynamic = 'force-dynamic';


export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.CASHFLOW_VIEW);
  if (!auth.ok) return auth.response;
  
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const warehouse = searchParams.get('warehouse');
    const type = searchParams.get('type');
    const accountId = searchParams.get('accountId');
    const sourceType = searchParams.get('sourceType');

    const where = {};
    if (startDate && endDate) {
      where.transactionDate = { gte: startDate, lte: endDate };
    } else if (startDate) {
      where.transactionDate = { gte: startDate };
    } else if (endDate) {
      where.transactionDate = { lte: endDate };
    }
    if (warehouse) where.warehouse = warehouse;
    if (type) where.type = type;
    if (accountId) where.accountId = parseInt(accountId);
    if (sourceType) where.sourceType = sourceType;
    const categoryId = searchParams.get('categoryId');
    if (categoryId) where.categoryId = parseInt(categoryId);
    const accountingSubject = searchParams.get('accountingSubject');
    if (accountingSubject) where.accountingSubject = { contains: accountingSubject, mode: 'insensitive' };

    // Warehouse-level access control
    const wf = applyWarehouseFilter(auth.session, where);
    if (!wf.ok) return wf.response;

    // Pagination support
    const page = parseInt(searchParams.get('page')) || 1;
    const limit = Math.min(parseInt(searchParams.get('limit')) || 50, 200);
    const skip = (page - 1) * limit;

    const [transactions, totalCount] = await Promise.all([
      prisma.cashTransaction.findMany({
        where,
        include: {
          account: { select: { id: true, name: true, type: true, warehouse: true } },
          category: { select: { id: true, name: true, type: true, warehouse: true, accountingSubject: { select: { code: true, name: true } } } },
          transferAccount: { select: { id: true, name: true, type: true, warehouse: true } },
          supplier: { select: { id: true, name: true } },
        },
        orderBy: [{ transactionDate: 'desc' }, { id: 'desc' }],
        skip,
        take: limit,
      }),
      prisma.cashTransaction.count({ where }),
    ]);

    const result = transactions.map(t => ({
      ...t,
      amount: Number(t.amount),
      fee: Number(t.fee),
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
      isReversal: t.isReversal,
      reversedById: t.reversedById,
      reversalOfId: t.reversalOfId,
      isAutoCreated: t.isAutoCreated || false,
      autoCreationReason: t.autoCreationReason || null,
      isNonCashExpense: t.isNonCashExpense || false,
    }));

    return NextResponse.json({
      data: result,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.CASHFLOW_CREATE);
  if (!auth.ok) return auth.response;
  
  try {
    const data = await request.json();

    if (!data.transactionDate || !data.type || !data.accountId || !data.amount) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '交易日期、類型、帳戶、金額為必填', 400);
    }

    // For non-transfer transactions, validate required fields
    if (data.type !== '移轉') {
      if (!data.warehouse) {
        return createErrorResponse('REQUIRED_FIELD_MISSING', '館別為必填', 400);
      }
      if (!data.accountingSubject) {
        return createErrorResponse('REQUIRED_FIELD_MISSING', '會計科目為必填', 400);
      }
      if (!data.supplierId) {
        return createErrorResponse('REQUIRED_FIELD_MISSING', '廠商為必填', 400);
      }
      if (!data.invoiceNo) {
        return createErrorResponse('REQUIRED_FIELD_MISSING', '發票號碼為必填', 400);
      }
      if (!data.invoiceAmount) {
        return createErrorResponse('REQUIRED_FIELD_MISSING', '發票金額為必填', 400);
      }
      if (!data.invoiceDate) {
        return createErrorResponse('REQUIRED_FIELD_MISSING', '發票日期為必填', 400);
      }
      if (!data.taxType) {
        return createErrorResponse('REQUIRED_FIELD_MISSING', '發票稅項為必填', 400);
      }
      if (data.taxAmount === undefined || data.taxAmount === null || data.taxAmount === '') {
        return createErrorResponse('REQUIRED_FIELD_MISSING', '發票稅金為必填', 400);
      }
    }

    if (!['收入', '支出', '移轉'].includes(data.type)) {
      return createErrorResponse('VALIDATION_FAILED', '類型必須是「收入」、「支出」或「移轉」', 400);
    }

    const amount = requireMoney(data.amount, '金額', { min: 0.01 });

    const fee = data.hasFee ? (safeMoney(data.fee, '手續費', { min: 0 }) || 0) : 0;

    const parsedAccountId = parseInt(data.accountId);
    if (Number.isNaN(parsedAccountId)) {
      return createErrorResponse('VALIDATION_FAILED', '帳戶ID 格式錯誤', 400);
    }

    const sourceType = data.sourceType || 'manual';
    const sourceRecordId = data.sourceRecordId ? parseInt(data.sourceRecordId) : null;
    if (data.sourceRecordId && Number.isNaN(sourceRecordId)) {
      return createErrorResponse('VALIDATION_FAILED', 'sourceRecordId 格式錯誤', 400);
    }

    // Validate transfer requires destination account
    if (data.type === '移轉') {
      if (!data.transferAccountId) {
        return createErrorResponse('REQUIRED_FIELD_MISSING', '移轉必須指定目的帳戶', 400);
      }
      const parsedTransferAccountId = parseInt(data.transferAccountId);
      if (Number.isNaN(parsedTransferAccountId)) {
        return createErrorResponse('VALIDATION_FAILED', '目的帳戶ID 格式錯誤', 400);
      }
      if (parsedTransferAccountId === parsedAccountId) {
        return createErrorResponse('VALIDATION_FAILED', '來源帳戶與目的帳戶不可相同', 400);
      }
    }

    const session = await getServerSession(authOptions);

    const result = await prisma.$transaction(async (tx) => {
      // Enforce period lock
      await assertPeriodOpen(tx, data.transactionDate, data.warehouse);

      if (data.type === '移轉') {
        // Create 2 linked transactions for transfer
        const outNo = await nextCashTransactionNo(tx, data.transactionDate);
        const outTx = await tx.cashTransaction.create({
          data: {
            transactionNo: outNo,
            transactionDate: data.transactionDate,
            type: '移轉',
            warehouse: data.warehouse || null,
            accountId: parseInt(data.accountId),
            categoryId: null,
            supplierId: null,
            paymentNo: data.paymentNo || null,
            amount,
            fee,
            hasFee: data.hasFee || false,
            accountingSubject: data.accountingSubject || null,
            paymentTerms: null,
            description: data.description || null,
            transferAccountId: parseInt(data.transferAccountId),
            sourceType,
            sourceRecordId,
            status: '已確認'
          }
        });

        // Generate a separate number for the IN transaction
        const inNo = outNo.replace(/(\d{4})$/, (m) => String(parseInt(m) + 1).padStart(4, '0'));
        // Make sure inNo is unique
        const inNoFinal = `${inNo.substring(0, inNo.length - 4)}${String(parseInt(inNo.substring(inNo.length - 4)) || 2).padStart(4, '0')}`;

        const inTx = await tx.cashTransaction.create({
          data: {
            transactionNo: inNoFinal !== outNo ? inNoFinal : `${outNo}-IN`,
            transactionDate: data.transactionDate,
            type: '移轉入',
            warehouse: data.warehouse || null,
            accountId: parseInt(data.transferAccountId),
            categoryId: null,
            supplierId: null,
            paymentNo: data.paymentNo || null,
            amount,
            fee: 0,
            hasFee: false,
            accountingSubject: data.accountingSubject || null,
            paymentTerms: null,
            description: data.description || null,
            transferAccountId: parseInt(data.accountId),
            linkedTransactionId: outTx.id,
            sourceType,
            sourceRecordId,
            status: '已確認'
          }
        });

        // Link the out transaction to the in transaction
        await tx.cashTransaction.update({
          where: { id: outTx.id },
          data: { linkedTransactionId: inTx.id }
        });

        // Recalculate both account balances
        await recalcBalance(tx, parseInt(data.accountId));
        await recalcBalance(tx, parseInt(data.transferAccountId));

        return { outTx, inTx };
      } else {
        // Income or Expense: single transaction
        const txNo = await nextCashTransactionNo(tx, data.transactionDate);
        const newTx = await tx.cashTransaction.create({
          data: {
            transactionNo: txNo,
            transactionDate: data.transactionDate,
            type: data.type,
            warehouse: data.warehouse || null,
            accountId: parseInt(data.accountId),
            categoryId: data.categoryId ? parseInt(data.categoryId) : null,
            supplierId: data.supplierId ? parseInt(data.supplierId) : null,
            paymentNo: data.paymentNo || null,
            amount,
            fee,
            hasFee: data.hasFee || false,
            accountingSubject: data.accountingSubject || null,
            invoiceNo: data.invoiceNo || null,
            invoiceAmount: data.invoiceAmount ? parseFloat(data.invoiceAmount) : null,
            invoiceDate: data.invoiceDate || null,
            taxType: data.taxType || null,
            taxAmount: data.taxAmount !== undefined && data.taxAmount !== '' ? parseFloat(data.taxAmount) : null,
            paymentTerms: data.paymentTerms || null,
            description: data.description || null,
            sourceType,
            sourceRecordId,
            status: '已確認'
          }
        });

        // Recalculate account balance
        await recalcBalance(tx, parseInt(data.accountId));

        return newTx;
      }
    });

    // Audit log
    if (session) {
      const txInfo = result.outTx || result;
      await auditFromSession(prisma, session, {
        action: AUDIT_ACTIONS.CASH_TRANSACTION_CREATE,
        targetModule: 'cashflow',
        targetRecordId: txInfo.id,
        targetRecordNo: txInfo.transactionNo,
        afterState: { type: data.type, amount, accountId: data.accountId, warehouse: data.warehouse },
      });
    }

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
