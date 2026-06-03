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
import { todayStr } from '@/lib/localDate';

export const dynamic = 'force-dynamic';


export async function GET(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.CHECK_VIEW);
  if (!auth.ok) return auth.response;
  
  try {
    const id = parseInt((await params).id);
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
    const id = parseInt((await params).id);
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

      const clearDate = data.clearDate || todayStr();
      await assertPeriodOpen(prisma, clearDate, check.warehouse);
      const actualAmount = data.actualAmount ? parseFloat(data.actualAmount) : Number(check.amount);
      const clearedBy = data.clearedBy || null;

      // 規則：有 paymentId 的支票 = 來自付款單，現金流已在「出納執行」時建立，此處不重複建立 CashTransaction（避免重複扣款）
      const fromPaymentOrder = !!check.paymentId;

      // 非付款單：先在 transaction 外確認帳戶
      let accountId = null, txType, sourceType;
      if (!fromPaymentOrder) {
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
      }

      const { updatedCheck, cashTransactionId } = await prisma.$transaction(async (tx) => {
        let cashTxId = null;
        if (!fromPaymentOrder) {
          const transactionNo = await nextCashTransactionNo(tx, clearDate);
          const categoryId = await getCategoryId(tx, sourceType);
          const transaction = await tx.cashTransaction.create({
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
          cashTxId = transaction.id;
          await recalcBalance(tx, accountId);
        }

        const updated = await tx.check.update({
          where: { id },
          data: {
            status: 'cleared',
            clearDate,
            actualAmount,
            clearedBy,
            ...(cashTxId ? { cashTransactionId: cashTxId } : {})
          },
          include: {
            sourceAccount: { select: { id: true, name: true, accountCode: true } },
            destinationAccount: { select: { id: true, name: true, accountCode: true } }
          }
        });

        return { updatedCheck: updated, cashTransactionId: cashTxId };
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

      const updatedCheck = await prisma.$transaction(async (tx) => {
        // If was cleared, create reverse transaction
        if (check.status === 'cleared') {
          const reverseDate = todayStr();

          // 找反向交易的帳戶與金額
          // 路徑 A：直接兌現的支票 → cashTransactionId 已存在，從 check type 推算帳戶
          // 路徑 B：付款單兌現的支票 → cashTransactionId 為 null，從 cashier_payment 交易找帳戶
          let reverseAccountId = null;
          let reverseAmount = Number(check.actualAmount || check.amount);
          let txType;

          if (check.cashTransactionId) {
            reverseAccountId = check.checkType === 'payable' ? check.sourceAccountId : check.destinationAccountId;
            txType = check.checkType === 'payable' ? '收入' : '支出';
          } else if (check.paymentId) {
            const originalTx = await tx.cashTransaction.findFirst({
              where: { sourceType: 'cashier_payment', sourceRecordId: check.paymentId, status: '已確認' },
              select: { accountId: true, amount: true }
            });
            if (originalTx) {
              reverseAccountId = originalTx.accountId;
              reverseAmount = Number(originalTx.amount);
              txType = '收入'; // cashier_payment 為支出，沖回為收入
            }
          }

          if (reverseAccountId) {
            const reverseTransactionNo = await nextCashTransactionNo(tx, reverseDate);
            const bounceCatId = await getCategoryId(tx, 'check_bounce');
            await tx.cashTransaction.create({
              data: {
                transactionNo: reverseTransactionNo,
                transactionDate: reverseDate,
                type: txType,
                warehouse: check.warehouse,
                accountId: reverseAccountId,
                supplierId: check.supplierId || null,
                categoryId: bounceCatId,
                amount: reverseAmount,
                description: `支票退票沖回 - ${check.checkNo} (${check.checkNumber})`,
                sourceType: 'check_bounce',
                sourceRecordId: check.id,
                status: '已確認'
              }
            });
            await recalcBalance(tx, reverseAccountId);
          }
        }

        return tx.check.update({
          where: { id },
          data: { status: 'bounced', bouncedReason: data.bouncedReason || null },
          include: {
            sourceAccount: { select: { id: true, name: true, accountCode: true } },
            destinationAccount: { select: { id: true, name: true, accountCode: true } }
          }
        });
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

    const beforeState = Object.fromEntries(
      Object.keys(updateData).map(k => [k, check[k] ?? null])
    );

    const updatedCheck = await prisma.check.update({
      where: { id },
      data: updateData,
      include: {
        sourceAccount: { select: { id: true, name: true, accountCode: true } },
        destinationAccount: { select: { id: true, name: true, accountCode: true } }
      }
    });

    auditFromSession(prisma, auth.session, {
      action: AUDIT_ACTIONS.CHECK_UPDATE,
      targetModule: 'checks',
      targetRecordId: id,
      targetRecordNo: check.checkNo,
      beforeState,
      afterState: updateData,
      note: `修改支票 ${check.checkNo}`,
    }).catch(e => console.error('[AUDIT_FAIL] check update:', e.message));

    return NextResponse.json(updatedCheck);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.CHECK_CREATE);
  if (!auth.ok) return auth.response;
  
  try {
    const id = parseInt((await params).id);

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
