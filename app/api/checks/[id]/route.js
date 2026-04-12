import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { getCategoryId } from '@/lib/cash-category-helper';
import { recalcBalance } from '@/lib/recalc-balance';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { assertWarehouseAccess } from '@/lib/warehouse-access';
import { auditFromSession, AUDIT_ACTIONS } from '@/lib/audit';
import { assertPeriodOpen } from '@/lib/period-lock';
import { nextCashTransactionNo } from '@/lib/sequence-generator';

export const dynamic = 'force-dynamic';


export async function GET(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.CHECK_VIEW);
  if (!auth.ok) return auth.response;
  
  try {
    const id = parseInt(params.id);
    const check = await prisma.check.findUnique({
      where: { id },
      include: {
        sourceAccount: { select: { id: true, name: true, accountCode: true } },
        destinationAccount: { select: { id: true, name: true, accountCode: true } },
        reissueOfCheck: { select: { id: true, checkNo: true, checkNumber: true, status: true } },
        reissuedByChecks: { select: { id: true, checkNo: true, checkNumber: true, status: true } },
      }
    });

    if (!check) {
      return createErrorResponse('NOT_FOUND', '找不到支票', 404);
    }

    if (check.warehouse) {
      const wa = assertWarehouseAccess(auth.session, check.warehouse);
      if (!wa.ok) return wa.response;
    }

    return NextResponse.json(check);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.CHECK_CREATE);
  if (!auth.ok) return auth.response;
  
  try {
    const id = parseInt(params.id);
    const data = await request.json();

    const check = await prisma.check.findUnique({
      where: { id },
      include: {
        sourceAccount: { select: { id: true, name: true, warehouse: true } },
        destinationAccount: { select: { id: true, name: true } }
      }
    });

    if (!check) {
      return createErrorResponse('NOT_FOUND', '找不到支票', 404);
    }

    if (check.warehouse) {
      const wa = assertWarehouseAccess(auth.session, check.warehouse);
      if (!wa.ok) return wa.response;
    }

    // If already cleared and trying to do non-bounce action
    if (check.status === 'cleared' && data.action !== 'bounce') {
      return createErrorResponse('CHECK_ALREADY_CLEARED', '支票已兌現，無法修改', 400);
    }

    // Handle special actions
    if (data.action === 'clear') {
      if (check.status !== 'pending' && check.status !== 'due') {
        return createErrorResponse('VALIDATION_FAILED', '只有待兌現或到期的支票才能兌現', 400);
      }

      const clearDate = data.clearDate || new Date().toISOString().split('T')[0];
      await assertPeriodOpen(prisma, clearDate, check.warehouse);
      const actualAmount = data.actualAmount ? parseFloat(data.actualAmount) : Number(check.amount);
      const clearedBy = data.clearedBy || null;

      // 規則：有 paymentId 的支票 = 來自付款單，現金流已在「出納執行」時建立，此處不重複建立 CashTransaction（避免重複扣款）
      const fromPaymentOrder = !!check.paymentId;
      let cashTransactionId = null;

      if (!fromPaymentOrder) {
        // 非付款單支票：建立 CashTransaction 並連動現金流
        const transactionNo = await nextCashTransactionNo(prisma, clearDate);
        let accountId, txType, sourceType;
        if (check.checkType === 'payable') {
          accountId = check.sourceAccountId;
          txType = '支出';
          sourceType = 'check_payment';
        } else {
          accountId = check.destinationAccountId;
          txType = '收入';
          sourceType = 'check_receipt';
        }

        if (!accountId) {
          return createErrorResponse('VALIDATION_FAILED', '支票未關聯帳戶，無法兌現', 400);
        }

        const categoryId = await getCategoryId(prisma, sourceType);
        const transaction = await prisma.cashTransaction.create({
          data: {
            transactionNo,
            transactionDate: clearDate,
            type: txType,
            warehouse: check.warehouse,
            accountId,
            supplierId: check.supplierId || null,
            categoryId,
            amount: actualAmount,
            description: `支票兌現 - ${check.checkNo} (${check.checkNumber})`,
            sourceType,
            sourceRecordId: check.id,
            status: '已確認'
          }
        });
        cashTransactionId = transaction.id;
        await recalcBalance(prisma, accountId);
      }

      const updatedCheck = await prisma.check.update({
        where: { id },
        data: {
          status: 'cleared',
          clearDate,
          actualAmount,
          clearedBy,
          ...(cashTransactionId ? { cashTransactionId } : {})
        },
        include: {
          sourceAccount: { select: { id: true, name: true, accountCode: true } },
          destinationAccount: { select: { id: true, name: true, accountCode: true } }
        }
      });

      await auditFromSession(prisma, auth.session, {
        action: AUDIT_ACTIONS.CHECK_CLEAR,
        targetModule: 'checks',
        targetRecordId: id,
        targetRecordNo: check.checkNo,
        beforeState: { status: check.status, amount: Number(check.amount) },
        afterState: { status: 'cleared', actualAmount, clearDate, cashTransactionId },
        note: `支票兌現 ${check.checkNo}`,
      });

      return NextResponse.json(updatedCheck);
    }

    if (data.action === 'bounce') {
      const bounceable = ['pending', 'due', 'cleared'];
      if (!bounceable.includes(check.status)) {
        return createErrorResponse('VALIDATION_FAILED', `支票狀態「${check.status}」無法退票（僅限待處理/到期/已兌現）`, 400);
      }

      await assertPeriodOpen(prisma, check.dueDate, check.warehouse);
      const updateData = {
        status: 'bounced',
        bouncedReason: data.bouncedReason || null
      };

      // If was cleared, create reverse transaction
      if (check.status === 'cleared' && check.cashTransactionId) {
        const reverseDate = new Date().toISOString().split('T')[0];
        const reverseTransactionNo = await nextCashTransactionNo(prisma, reverseDate);

        let accountId, txType;
        if (check.checkType === 'payable') {
          // Reverse: money comes back (income to source account)
          accountId = check.sourceAccountId;
          txType = '收入';
        } else {
          // Reverse: money goes out (expense from destination account)
          accountId = check.destinationAccountId;
          txType = '支出';
        }

        if (accountId) {
          const bounceCatId = await getCategoryId(prisma, 'check_bounce');
          await prisma.cashTransaction.create({
            data: {
              transactionNo: reverseTransactionNo,
              transactionDate: reverseDate,
              type: txType,
              warehouse: check.warehouse,
              accountId,
              supplierId: check.supplierId || null,
              categoryId: bounceCatId,
              amount: Number(check.actualAmount || check.amount),
              description: `支票退票沖回 - ${check.checkNo} (${check.checkNumber})`,
              sourceType: 'check_bounce',
              sourceRecordId: check.id,
              status: '已確認'
            }
          });

          // Recalculate balance
          await recalcBalance(prisma, accountId);
        }
      }

      const updatedCheck = await prisma.check.update({
        where: { id },
        data: updateData,
        include: {
          sourceAccount: { select: { id: true, name: true, accountCode: true } },
          destinationAccount: { select: { id: true, name: true, accountCode: true } }
        }
      });

      await auditFromSession(prisma, auth.session, {
        action: AUDIT_ACTIONS.CHECK_BOUNCE,
        targetModule: 'checks',
        targetRecordId: id,
        targetRecordNo: check.checkNo,
        beforeState: { status: check.status, amount: Number(check.amount) },
        afterState: { status: 'bounced', bouncedReason: data.bouncedReason || null },
        note: `支票退票 ${check.checkNo}`,
      });

      return NextResponse.json(updatedCheck);
    }

    if (data.action === 'void') {
      if (check.status !== 'pending' && check.status !== 'due') {
        return createErrorResponse('VALIDATION_FAILED', '只有待兌現或到期的支票才能作廢', 400);
      }

      await assertPeriodOpen(prisma, check.dueDate, check.warehouse);
      const updatedCheck = await prisma.check.update({
        where: { id },
        data: {
          status: 'void',
          voidReason: data.voidReason || null
        },
        include: {
          sourceAccount: { select: { id: true, name: true, accountCode: true } },
          destinationAccount: { select: { id: true, name: true, accountCode: true } }
        }
      });

      await auditFromSession(prisma, auth.session, {
        action: AUDIT_ACTIONS.CHECK_VOID,
        targetModule: 'checks',
        targetRecordId: id,
        targetRecordNo: check.checkNo,
        beforeState: { status: check.status },
        afterState: { status: 'void', voidReason: data.voidReason || null },
        note: `支票作廢 ${check.checkNo}`,
      });

      return NextResponse.json(updatedCheck);
    }

    // Regular update (no action) - only if not cleared
    if (check.status === 'cleared') {
      return createErrorResponse('CHECK_ALREADY_CLEARED', '支票已兌現，無法修改', 400);
    }

    const updateData = {};
    if (data.checkNumber !== undefined) updateData.checkNumber = data.checkNumber;
    if (data.amount !== undefined) updateData.amount = parseFloat(data.amount);
    if (data.issueDate !== undefined) updateData.issueDate = data.issueDate;
    if (data.dueDate !== undefined) updateData.dueDate = data.dueDate;
    if (data.drawerType !== undefined) updateData.drawerType = data.drawerType;
    if (data.drawerName !== undefined) updateData.drawerName = data.drawerName;
    if (data.sourceAccountId !== undefined) updateData.sourceAccountId = data.sourceAccountId ? parseInt(data.sourceAccountId) : null;
    if (data.payeeName !== undefined) updateData.payeeName = data.payeeName;
    if (data.supplierId !== undefined) updateData.supplierId = data.supplierId ? parseInt(data.supplierId) : null;
    if (data.destinationAccountId !== undefined) updateData.destinationAccountId = data.destinationAccountId ? parseInt(data.destinationAccountId) : null;
    if (data.warehouse !== undefined) updateData.warehouse = data.warehouse;
    if (data.bankName !== undefined) updateData.bankName = data.bankName;
    if (data.bankBranch !== undefined) updateData.bankBranch = data.bankBranch;
    if (data.note !== undefined) updateData.note = data.note;

    const updatedCheck = await prisma.check.update({
      where: { id },
      data: updateData,
      include: {
        sourceAccount: { select: { id: true, name: true, accountCode: true } },
        destinationAccount: { select: { id: true, name: true, accountCode: true } }
      }
    });

    return NextResponse.json(updatedCheck);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.CHECK_CREATE);
  if (!auth.ok) return auth.response;
  
  try {
    const id = parseInt(params.id);

    const check = await prisma.check.findUnique({ where: { id } });
    if (!check) {
      return createErrorResponse('NOT_FOUND', '找不到支票', 404);
    }

    if (check.status !== 'pending') {
      return createErrorResponse('VALIDATION_FAILED', '只有待處理狀態的支票才能刪除', 400);
    }

    await prisma.check.delete({ where: { id } });

    await auditFromSession(prisma, auth.session, {
      action: AUDIT_ACTIONS.CHECK_DELETE,
      targetModule: 'checks',
      targetRecordId: id,
      targetRecordNo: check.checkNo,
      beforeState: { checkNo: check.checkNo, checkNumber: check.checkNumber, amount: Number(check.amount), status: check.status },
      note: `刪除支票 ${check.checkNo}`,
    });

    return NextResponse.json({ success: true, message: '支票已刪除' });
  } catch (error) {
    return handleApiError(error);
  }
}
