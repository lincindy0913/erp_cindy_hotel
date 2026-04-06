import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { getCategoryIdByCode } from '@/lib/cash-category-helper';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { assertWarehouseAccess } from '@/lib/warehouse-access';
import { recalcBalance } from '@/lib/recalc-balance';
import { auditFromSession, AUDIT_ACTIONS } from '@/lib/audit';
import { nextCashTransactionNo } from '@/lib/sequence-generator';

export const dynamic = 'force-dynamic';


export async function PUT(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.LOAN_CONFIRM);
  if (!auth.ok) return auth.response;
  
  try {
    const id = parseInt(params.id);
    const data = await request.json();

    const existing = await prisma.loanMonthlyRecord.findUnique({
      where: { id },
      include: { loan: true }
    });

    if (!existing) {
      return createErrorResponse('NOT_FOUND', '還款記錄不存在', 404);
    }

    if (existing.loan?.warehouse) {
      const wa = assertWarehouseAccess(auth.session, existing.loan.warehouse);
      if (!wa.ok) return wa.response;
    }

    // Step 2: 核實 (Confirm actual amounts)
    if (data.actualPrincipal !== undefined && data.actualInterest !== undefined) {
      const actualPrincipal = parseFloat(data.actualPrincipal);
      const actualInterest = parseFloat(data.actualInterest);
      const actualTotal = actualPrincipal + actualInterest;
      const today = new Date().toISOString().split('T')[0];
      const accountId = existing.deductAccountId || existing.loan.deductAccountId;

      const result = await prisma.$transaction(async (tx) => {
        // Generate transaction numbers for principal and interest
        const principalTxNo = await nextCashTransactionNo(tx, today);
        const interestTxNo = await nextCashTransactionNo(tx, today);
        // Ensure unique: if same prefix, increment
        const finalInterestTxNo = interestTxNo === principalTxNo
          ? principalTxNo.replace(/(\d{4})$/, (m) => String(parseInt(m) + 1).padStart(4, '0'))
          : interestTxNo;

        const principalCatId = await getCategoryIdByCode(tx, 'LOAN_PRINCIPAL');
        const interestCatId = await getCategoryIdByCode(tx, 'LOAN_INTEREST');

        // Create CashTransaction for principal (支出)
        const principalTx = await tx.cashTransaction.create({
          data: {
            transactionNo: principalTxNo,
            transactionDate: data.actualDebitDate || today,
            type: '支出',
            warehouse: existing.loan.warehouse || null,
            accountId,
            categoryId: principalCatId,
            amount: actualPrincipal,
            fee: 0,
            hasFee: false,
            accountingSubject: '21000 長期借款本金',
            description: `貸款本金 - ${existing.loan.loanName} (${existing.recordYear}/${existing.recordMonth})`,
            sourceType: 'loan_payment',
            sourceRecordId: id,
            status: '已確認'
          }
        });

        // Create CashTransaction for interest (支出)
        const interestTx = await tx.cashTransaction.create({
          data: {
            transactionNo: finalInterestTxNo,
            transactionDate: data.actualDebitDate || today,
            type: '支出',
            warehouse: existing.loan.warehouse || null,
            accountId,
            categoryId: interestCatId,
            amount: actualInterest,
            fee: 0,
            hasFee: false,
            accountingSubject: '51500 利息費用',
            description: `貸款利息 - ${existing.loan.loanName} (${existing.recordYear}/${existing.recordMonth})`,
            sourceType: 'loan_payment',
            sourceRecordId: id,
            status: '已確認'
          }
        });

        // Update the monthly record
        const updated = await tx.loanMonthlyRecord.update({
          where: { id },
          data: {
            actualPrincipal,
            actualInterest,
            actualTotal,
            actualDebitDate: data.actualDebitDate || today,
            statementNo: data.statementNo || null,
            status: '已核實',
            confirmedAt: new Date(),
            confirmedBy: data.confirmedBy || null,
            note: data.note !== undefined ? data.note : existing.note
          }
        });

        // Recalculate account balance
        await recalcBalance(tx, accountId);

        // Update LoanMaster.currentBalance -= actualPrincipal
        await tx.loanMaster.update({
          where: { id: existing.loanId },
          data: {
            currentBalance: {
              decrement: actualPrincipal
            }
          }
        });

        return updated;
      });

      await auditFromSession(prisma, auth.session, {
        action: AUDIT_ACTIONS.LOAN_RECORD_CONFIRM,
        targetModule: 'loans',
        targetRecordId: id,
        beforeState: { status: existing.status, estimatedTotal: Number(existing.estimatedTotal) },
        afterState: { status: '已核實', actualPrincipal, actualInterest, actualTotal },
        note: `貸款核實 ${existing.loan.loanName} ${existing.recordYear}/${existing.recordMonth}`,
      });

      return NextResponse.json({
        ...result,
        estimatedPrincipal: Number(result.estimatedPrincipal),
        estimatedInterest: Number(result.estimatedInterest),
        estimatedTotal: Number(result.estimatedTotal),
        actualPrincipal: Number(result.actualPrincipal),
        actualInterest: Number(result.actualInterest),
        actualTotal: Number(result.actualTotal),
        createdAt: result.createdAt.toISOString(),
        updatedAt: result.updatedAt.toISOString(),
        confirmedAt: result.confirmedAt ? result.confirmedAt.toISOString() : null
      });
    }

    // Regular update (note, estimated amounts, etc.)
    const updateData = {};
    if (data.estimatedPrincipal !== undefined) updateData.estimatedPrincipal = parseFloat(data.estimatedPrincipal);
    if (data.estimatedInterest !== undefined) updateData.estimatedInterest = parseFloat(data.estimatedInterest);
    if (data.estimatedPrincipal !== undefined || data.estimatedInterest !== undefined) {
      const ep = data.estimatedPrincipal !== undefined ? parseFloat(data.estimatedPrincipal) : Number(existing.estimatedPrincipal);
      const ei = data.estimatedInterest !== undefined ? parseFloat(data.estimatedInterest) : Number(existing.estimatedInterest);
      updateData.estimatedTotal = ep + ei;
    }
    if (data.note !== undefined) updateData.note = data.note || null;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.paymentOrderId !== undefined) updateData.paymentOrderId = data.paymentOrderId ? parseInt(data.paymentOrderId) : null;

    const updated = await prisma.loanMonthlyRecord.update({
      where: { id },
      data: updateData
    });

    return NextResponse.json({
      ...updated,
      estimatedPrincipal: Number(updated.estimatedPrincipal),
      estimatedInterest: Number(updated.estimatedInterest),
      estimatedTotal: Number(updated.estimatedTotal),
      actualPrincipal: updated.actualPrincipal !== null ? Number(updated.actualPrincipal) : null,
      actualInterest: updated.actualInterest !== null ? Number(updated.actualInterest) : null,
      actualTotal: updated.actualTotal !== null ? Number(updated.actualTotal) : null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString()
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.LOAN_CONFIRM);
  if (!auth.ok) return auth.response;
  
  try {
    const id = parseInt(params.id);

    const existing = await prisma.loanMonthlyRecord.findUnique({
      where: { id },
      include: { loan: true }
    });

    if (!existing) {
      return createErrorResponse('NOT_FOUND', '還款記錄不存在', 404);
    }

    if (existing.loan?.warehouse) {
      const waDel = assertWarehouseAccess(auth.session, existing.loan.warehouse);
      if (!waDel.ok) return waDel.response;
    }

    if (existing.status === '暫估') {
      await prisma.loanMonthlyRecord.delete({ where: { id } });
      await auditFromSession(prisma, auth.session, {
        action: AUDIT_ACTIONS.LOAN_RECORD_DELETE,
        targetModule: 'loans',
        targetRecordId: id,
        beforeState: { status: '暫估', loanName: existing.loan.loanName, estimatedTotal: Number(existing.estimatedTotal) },
        note: `刪除暫估還款記錄 ${existing.loan.loanName} ${existing.recordYear}/${existing.recordMonth}`,
      });
      return NextResponse.json({ success: true });
    }

    if (existing.status === '已核實') {
      // Delete record + associated CashTransactions + recalculate balance + rollback currentBalance
      const accountId = existing.deductAccountId || existing.loan.deductAccountId;
      const actualPrincipal = Number(existing.actualPrincipal) || 0;

      await prisma.$transaction(async (tx) => {
        // Delete associated CashTransactions
        await tx.cashTransaction.deleteMany({
          where: {
            sourceType: 'loan_payment',
            sourceRecordId: id
          }
        });

        // Delete the record
        await tx.loanMonthlyRecord.delete({ where: { id } });

        // Recalculate account balance
        await recalcBalance(tx, accountId);

        // Rollback LoanMaster.currentBalance += actualPrincipal
        await tx.loanMaster.update({
          where: { id: existing.loanId },
          data: {
            currentBalance: {
              increment: actualPrincipal
            }
          }
        });
      });

      await auditFromSession(prisma, auth.session, {
        action: AUDIT_ACTIONS.LOAN_RECORD_DELETE,
        targetModule: 'loans',
        targetRecordId: id,
        beforeState: { status: '已核實', loanName: existing.loan.loanName, actualTotal: Number(existing.actualTotal), actualPrincipal },
        note: `刪除已核實還款記錄 ${existing.loan.loanName} ${existing.recordYear}/${existing.recordMonth}`,
      });

      return NextResponse.json({ success: true });
    }

    // For other statuses (跳過, etc.), just delete
    await prisma.loanMonthlyRecord.delete({ where: { id } });
    await auditFromSession(prisma, auth.session, {
      action: AUDIT_ACTIONS.LOAN_RECORD_DELETE,
      targetModule: 'loans',
      targetRecordId: id,
      beforeState: { status: existing.status, loanName: existing.loan.loanName },
      note: `刪除還款記錄 ${existing.loan.loanName} ${existing.recordYear}/${existing.recordMonth}`,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
