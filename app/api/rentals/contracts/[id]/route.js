import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { getCategoryId } from '@/lib/cash-category-helper';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { recalcBalance } from '@/lib/recalc-balance';
import { auditFromSession, AUDIT_ACTIONS } from '@/lib/audit';
import { nextCashTransactionNo, nextSequence } from '@/lib/sequence-generator';
import { todayStr } from '@/lib/localDate';

export const dynamic = 'force-dynamic';


export async function GET(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.RENTAL_VIEW);
  if (!auth.ok) return auth.response;
  
  try {
    const { id } = await params;
    const contract = await prisma.rentalContract.findUnique({
      where: { id: parseInt(id) },
      include: {
        property: {
          select: { id: true, name: true, buildingName: true, address: true }
        },
        tenant: {
          select: {
            id: true, tenantCode: true, tenantType: true, fullName: true,
            companyName: true, phone: true, email: true
          }
        },
        rentalIncomes: {
          orderBy: [{ incomeYear: 'desc' }, { incomeMonth: 'desc' }]
        }
      }
    });

    if (!contract) {
      return createErrorResponse('NOT_FOUND', '找不到合約', 404);
    }

    return NextResponse.json(contract);
  } catch (error) {
    console.error('GET /api/rentals/contracts/[id] error:', error.message || error);
    return handleApiError(error);
  }
}

export async function PATCH(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.RENTAL_EDIT);
  if (!auth.ok) return auth.response;
  
  try {
    const { id } = await params;
    const contractId = parseInt(id);
    const body = await request.json();

    const existing = await prisma.rentalContract.findUnique({
      where: { id: contractId }
    });

    if (!existing) {
      return createErrorResponse('NOT_FOUND', '找不到合約', 404);
    }

    // Handle deposit receive action
    if (body.action === 'depositReceive') {
      if (existing.depositReceived) {
        return createErrorResponse('ALREADY_RECEIVED', '押金已收取，不可重複建帳', 409);
      }

      const accountId = existing.depositAccountId || existing.rentAccountId;
      const today = todayStr();
      const transactionNo = await nextCashTransactionNo(prisma, today);
      const depositInCatId = await getCategoryId(prisma, 'rental_deposit_in');

      let cashTxId;
      await prisma.$transaction(async (tx) => {
        const cashTxRecord = await tx.cashTransaction.create({
          data: {
            transactionNo,
            transactionDate: today,
            type: '收入',
            accountId,
            categoryId: depositInCatId,
            amount: Number(existing.depositAmount),
            description: `押金收取 - 合約 ${existing.contractNo}`,
            sourceType: 'rental_deposit_in',
            sourceRecordId: contractId,
            status: '已確認'
          },
          select: { id: true },
        });
        cashTxId = cashTxRecord.id;

        await tx.rentalContract.update({
          where: { id: contractId },
          data: {
            depositReceived: true,
            depositCashTransactionId: cashTxRecord.id,
          },
        });
      });

      await recalcBalance(prisma, accountId);
      return NextResponse.json({ success: true, transactionId: cashTxId });
    }

    // Handle deposit refund action — create PaymentOrder for cashier to execute
    if (body.action === 'depositRefund') {
      if (!existing.depositReceived) {
        return createErrorResponse('NOT_RECEIVED', '押金尚未收取，無法退還', 400);
      }
      if (existing.depositRefunded) {
        return createErrorResponse('ALREADY_REFUNDED', '此合約押金已退還', 409);
      }

      const amt = Number(existing.depositAmount);
      const today = todayStr();
      const dateStr = today.replace(/-/g, '');
      const prefix = `RENT-${dateStr}-`;
      const summary = `押金退還 - 合約 ${existing.contractNo}`;
      const accountId = existing.depositAccountId || existing.rentAccountId;

      let order;
      await prisma.$transaction(async (tx) => {
        const orderNo = await nextSequence(tx, 'paymentOrder', 'orderNo', prefix);
        order = await tx.paymentOrder.create({
          data: {
            orderNo,
            invoiceIds: [],
            supplierName: summary,
            paymentMethod: '轉帳',
            amount: amt,
            discount: 0,
            netAmount: amt,
            dueDate: today,
            accountId: accountId || null,
            summary,
            sourceType: 'rental_deposit_out',
            sourceRecordId: contractId,
            status: '待出納'
          }
        });

        await tx.rentalContract.update({
          where: { id: contractId },
          data: {
            depositRefunded: true,
            depositRefundPaymentOrderId: order.id,
          },
        });
      });

      return NextResponse.json({ success: true, paymentOrderId: order.id, orderNo: order.orderNo });
    }

    // Standard update
    if (body.propertyId !== undefined || body.tenantId !== undefined) {
      return createErrorResponse(
        'FORBIDDEN',
        '合約的物業與承租人不可修改，如需變更請終止此合約並重新建立',
        403
      );
    }

    // 日期變更時檢查是否與同物業其他有效/待生效合約重疊
    if (body.startDate !== undefined || body.endDate !== undefined) {
      const newStart = body.startDate ?? existing.startDate;
      const newEnd   = body.endDate   ?? existing.endDate;
      if (newStart >= newEnd) {
        return createErrorResponse('VALIDATION_FAILED', '合約結束日期必須晚於開始日期', 400);
      }
      const overlapping = await prisma.rentalContract.findFirst({
        where: {
          propertyId: existing.propertyId,
          status: { in: ['active', 'pending'] },
          startDate: { lte: newEnd },
          endDate:   { gte: newStart },
          id: { not: contractId },
        },
        select: { id: true, contractNo: true, status: true },
      });
      if (overlapping) {
        return NextResponse.json({
          error: `此物業在該期間已有${overlapping.status === 'active' ? '有效' : '待生效'}合約（${overlapping.contractNo}）`,
          code: 'ACTIVE_CONTRACT_EXISTS',
          conflictContractId: overlapping.id,
          conflictContractNo: overlapping.contractNo,
        }, { status: 409 });
      }
    }

    const updateData = {};
    if (body.startDate !== undefined) updateData.startDate = body.startDate;
    if (body.endDate !== undefined) updateData.endDate = body.endDate;
    if (body.monthlyRent !== undefined) updateData.monthlyRent = parseFloat(body.monthlyRent);
    if (body.paymentDueDay !== undefined) updateData.paymentDueDay = parseInt(body.paymentDueDay);
    if (body.preferredPayMethod !== undefined) updateData.preferredPayMethod = body.preferredPayMethod;
    if (body.depositAmount !== undefined) updateData.depositAmount = parseFloat(body.depositAmount);
    if (body.depositAccountId !== undefined) updateData.depositAccountId = body.depositAccountId ? parseInt(body.depositAccountId) : null;
    if (body.rentAccountId !== undefined) updateData.rentAccountId = parseInt(body.rentAccountId);
    if (body.accountingSubjectId !== undefined) updateData.accountingSubjectId = body.accountingSubjectId ? parseInt(body.accountingSubjectId) : null;
    if (body.status !== undefined) updateData.status = body.status;
    if (body.autoRenew !== undefined) updateData.autoRenew = body.autoRenew;
    if (body.renewNotifyDays !== undefined) updateData.renewNotifyDays = parseInt(body.renewNotifyDays);
    if (body.specialTerms !== undefined) updateData.specialTerms = body.specialTerms;
    if (body.note !== undefined) updateData.note = body.note;

    const contract = await prisma.rentalContract.update({
      where: { id: contractId },
      data: updateData,
      include: {
        property: { select: { id: true, name: true } },
        tenant: { select: { id: true, fullName: true, companyName: true, tenantType: true } }
      }
    });

    // Update property status based on contract status
    if (body.status === 'active') {
      await prisma.rentalProperty.update({
        where: { id: contract.propertyId },
        data: { status: 'rented' }
      });
      // 若此合約是從舊合約續約而來，且舊合約尚未 expired，自動 expire 舊合約
      if (existing.previousContractId && existing.status !== 'active') {
        const prev = await prisma.rentalContract.findUnique({ where: { id: existing.previousContractId } });
        if (prev && !['expired', 'terminated'].includes(prev.status)) {
          await prisma.rentalContract.update({
            where: { id: existing.previousContractId },
            data: { status: 'expired' }
          });
        }
      }
    } else if (['terminated', 'expired', 'cancelled'].includes(body.status)) {
      // 若無其他有效合約，物業改回空置
      const otherActive = await prisma.rentalContract.count({
        where: { propertyId: contract.propertyId, status: 'active', id: { not: contractId } }
      });
      if (otherActive === 0) {
        await prisma.rentalProperty.update({
          where: { id: contract.propertyId },
          data: { status: 'available' }
        });
      }
    } else if (body.status === 'pending') {
      // 合約退回待審核（尚未生效），若物業本來因此合約才 rented，改回 available
      if (existing.status === 'active') {
        const otherActive = await prisma.rentalContract.count({
          where: { propertyId: contract.propertyId, status: 'active', id: { not: contractId } }
        });
        if (otherActive === 0) {
          await prisma.rentalProperty.update({
            where: { id: contract.propertyId },
            data: { status: 'available' }
          });
        }
      }
    }

    const actionLabel = body.action === 'depositReceive' ? '押金收取' : body.action === 'depositRefund' ? '押金退還' : '合約更新';
    await auditFromSession(prisma, auth.session, {
      action: AUDIT_ACTIONS.RENTAL_CONTRACT_UPDATE,
      targetModule: 'rentals',
      targetRecordId: contractId,
      targetRecordNo: existing.contractNo,
      beforeState: { status: existing.status },
      afterState: { status: contract.status || existing.status, action: body.action || 'update' },
      note: `${actionLabel} ${existing.contractNo}`,
    });

    return NextResponse.json(contract);
  } catch (error) {
    console.error('PUT /api/rentals/contracts/[id] error:', error.message || error);
    return handleApiError(error);
  }
}

export async function DELETE(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.RENTAL_EDIT);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const contractId = parseInt(id);
    const { searchParams } = new URL(request.url);
    const force = searchParams.get('force') === 'true';

    const contract = await prisma.rentalContract.findUnique({
      where: { id: contractId }
    });

    if (!contract) {
      return createErrorResponse('NOT_FOUND', '找不到合約', 404);
    }

    if (contract.status !== 'pending' && !force) {
      return createErrorResponse('VALIDATION_FAILED', '只能刪除待審核狀態的合約；若確認為重複登打，請使用強制刪除', 400);
    }

    const reassignTo = searchParams.get('reassignTo') ? parseInt(searchParams.get('reassignTo')) : null;

    // 確認是否有已收款的 income 記錄
    const [paidCount, totalCount] = await Promise.all([
      prisma.rentalIncome.count({
        where: { contractId, status: { in: ['completed', 'paid', 'partial'] } },
      }),
      prisma.rentalIncome.count({ where: { contractId } }),
    ]);

    if (paidCount > 0 && !reassignTo) {
      return NextResponse.json(
        { error: `此合約有 ${paidCount} 筆已收款記錄，請選擇要移轉到的目標合約後再刪除。`, code: 'HAS_PAID_RECORDS', paidCount },
        { status: 400 }
      );
    }

    await prisma.$transaction(async tx => {
      if (reassignTo && totalCount > 0) {
        // 取得本合約所有 income 記錄
        const sourceIncomes = await tx.rentalIncome.findMany({
          where: { contractId },
          select: { id: true, incomeYear: true, incomeMonth: true, status: true },
        });

        for (const inc of sourceIncomes) {
          // 確認目標合約同月份是否已有記錄
          const targetIncome = await tx.rentalIncome.findUnique({
            where: { contractId_incomeYear_incomeMonth: { contractId: reassignTo, incomeYear: inc.incomeYear, incomeMonth: inc.incomeMonth } },
            select: { id: true, status: true },
          });

          if (!targetIncome) {
            // 目標無同月份 → 直接移轉
            await tx.rentalIncome.update({ where: { id: inc.id }, data: { contractId: reassignTo } });
          } else if (['completed', 'paid', 'partial'].includes(inc.status) && targetIncome.status === 'pending') {
            // 本合約已收款，目標是 pending → 刪目標 pending，移轉本合約已收款記錄
            await tx.rentalIncome.delete({ where: { id: targetIncome.id } });
            await tx.rentalIncome.update({ where: { id: inc.id }, data: { contractId: reassignTo } });
          } else {
            // 目標已有有效記錄 → 刪除本合約此月份記錄（payments 會 cascade 刪除）
            await tx.rentalIncome.delete({ where: { id: inc.id } });
          }
        }
      } else if (totalCount > 0) {
        // 無 reassign 且只有 pending income → 直接刪除
        await tx.rentalIncome.deleteMany({ where: { contractId } });
      }

      // 解除其他合約對本合約的 previousContractId 參照
      await tx.rentalContract.updateMany({
        where: { previousContractId: contractId },
        data: { previousContractId: null },
      });

      await tx.rentalContract.delete({ where: { id: contractId } });
    });

    await auditFromSession(prisma, auth.session, {
      action: AUDIT_ACTIONS.RENTAL_CONTRACT_DELETE,
      targetModule: 'rentals',
      targetRecordId: contractId,
      targetRecordNo: contract.contractNo,
      beforeState: { contractNo: contract.contractNo, status: contract.status },
      note: `刪除租約 ${contract.contractNo}（${reassignTo ? `移轉 income 至合約#${reassignTo}` : force ? '強制刪除重複' : '一般刪除'}）`,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/rentals/contracts/[id] error:', error.message || error);
    return handleApiError(error);
  }
}
