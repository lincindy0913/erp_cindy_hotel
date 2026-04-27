import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { getCategoryId } from '@/lib/cash-category-helper';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { recalcBalance } from '@/lib/recalc-balance';
import { auditFromSession, AUDIT_ACTIONS } from '@/lib/audit';
import { nextCashTransactionNo } from '@/lib/sequence-generator';

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

export async function PUT(request, { params }) {
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
      const accountId = existing.depositAccountId || existing.rentAccountId;
      const today = new Date().toISOString().split('T')[0];
      const transactionNo = await nextCashTransactionNo(prisma, today);

      const depositInCatId = await getCategoryId(prisma, 'rental_deposit_in');
      const cashTxRecord = await prisma.cashTransaction.create({
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
        }
      });

      await prisma.rentalContract.update({
        where: { id: contractId },
        data: {
          depositReceived: true,
          depositCashTransactionId: cashTxRecord.id
        }
      });

      await recalcBalance(prisma, accountId);

      return NextResponse.json({ success: true, transactionId: cashTxRecord.id });
    }

    // Handle deposit refund action — create PaymentOrder for cashier to execute
    if (body.action === 'depositRefund') {
      const amt = Number(existing.depositAmount);
      const today = new Date().toISOString().split('T')[0];
      const dateStr = today.replace(/-/g, '');
      const prefix = `RENT-${dateStr}-`;

      const existingOrders = await prisma.paymentOrder.findMany({
        where: { orderNo: { startsWith: prefix } },
        select: { orderNo: true }
      });
      let maxSeq = 0;
      for (const item of existingOrders) {
        const seq = parseInt(item.orderNo.substring(prefix.length)) || 0;
        if (seq > maxSeq) maxSeq = seq;
      }
      const orderNo = `${prefix}${String(maxSeq + 1).padStart(4, '0')}`;

      const summary = `押金退還 - 合約 ${existing.contractNo}`;
      const accountId = existing.depositAccountId || existing.rentAccountId;

      const order = await prisma.paymentOrder.create({
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

      await prisma.rentalContract.update({
        where: { id: contractId },
        data: {
          depositRefunded: true,
          depositRefundPaymentOrderId: order.id
        }
      });

      return NextResponse.json({ success: true, paymentOrderId: order.id, orderNo: order.orderNo });
    }

    // Standard update
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
    } else if (body.status === 'terminated' || body.status === 'expired') {
      // Check if there are other active contracts for this property
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

    const contract = await prisma.rentalContract.findUnique({
      where: { id: contractId }
    });

    if (!contract) {
      return createErrorResponse('NOT_FOUND', '找不到合約', 404);
    }

    if (contract.status !== 'pending') {
      return createErrorResponse('VALIDATION_FAILED', '只能刪除待審核狀態的合約', 400);
    }

    await prisma.rentalContract.delete({ where: { id: contractId } });

    await auditFromSession(prisma, auth.session, {
      action: AUDIT_ACTIONS.RENTAL_CONTRACT_DELETE,
      targetModule: 'rentals',
      targetRecordId: contractId,
      targetRecordNo: contract.contractNo,
      beforeState: { contractNo: contract.contractNo, status: contract.status },
      note: `刪除租約 ${contract.contractNo}`,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/rentals/contracts/[id] error:', error.message || error);
    return handleApiError(error);
  }
}
