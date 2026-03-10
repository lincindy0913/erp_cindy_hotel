import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { getCategoryId } from '@/lib/cash-category-helper';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

// Generate transaction number: CF-YYYYMMDD-XXXX
async function generateTransactionNo(date) {
  const dateStr = (date || new Date().toISOString().split('T')[0]).replace(/-/g, '');
  const prefix = `CF-${dateStr}-`;

  const existing = await prisma.cashTransaction.findMany({
    where: { transactionNo: { startsWith: prefix } },
    select: { transactionNo: true }
  });

  let maxSeq = 0;
  for (const t of existing) {
    const seq = parseInt(t.transactionNo.substring(prefix.length)) || 0;
    if (seq > maxSeq) maxSeq = seq;
  }

  return `${prefix}${String(maxSeq + 1).padStart(4, '0')}`;
}

// Recalculate account balance
async function recalcBalance(accountId) {
  const incomes = await prisma.cashTransaction.aggregate({
    where: { accountId, type: '收入' },
    _sum: { amount: true }
  });
  const expenses = await prisma.cashTransaction.aggregate({
    where: { accountId, type: '支出' },
    _sum: { amount: true }
  });
  const account = await prisma.cashAccount.findUnique({ where: { id: accountId } });
  const newBalance = Number(account.openingBalance) + Number(incomes._sum.amount || 0) - Number(expenses._sum.amount || 0);
  await prisma.cashAccount.update({
    where: { id: accountId },
    data: { currentBalance: newBalance }
  });
}

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
    console.error('GET /api/rentals/contracts/[id] error:', error);
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
      const transactionNo = await generateTransactionNo(today);

      const depositInCatId = await getCategoryId(prisma, 'rental_deposit_in');
      const tx = await prisma.cashTransaction.create({
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
          depositCashTransactionId: tx.id
        }
      });

      await recalcBalance(accountId);

      return NextResponse.json({ success: true, transactionId: tx.id });
    }

    // Handle deposit refund action
    if (body.action === 'depositRefund') {
      const accountId = existing.depositAccountId || existing.rentAccountId;
      const today = new Date().toISOString().split('T')[0];
      const transactionNo = await generateTransactionNo(today);

      const depositOutCatId = await getCategoryId(prisma, 'rental_deposit_out');
      const tx = await prisma.cashTransaction.create({
        data: {
          transactionNo,
          transactionDate: today,
          type: '支出',
          accountId,
          categoryId: depositOutCatId,
          amount: Number(existing.depositAmount),
          description: `押金退還 - 合約 ${existing.contractNo}`,
          sourceType: 'rental_deposit_out',
          sourceRecordId: contractId,
          status: '已確認'
        }
      });

      await prisma.rentalContract.update({
        where: { id: contractId },
        data: {
          depositRefunded: true,
          depositRefundCashTransactionId: tx.id
        }
      });

      await recalcBalance(accountId);

      return NextResponse.json({ success: true, transactionId: tx.id });
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

    return NextResponse.json(contract);
  } catch (error) {
    console.error('PUT /api/rentals/contracts/[id] error:', error);
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
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/rentals/contracts/[id] error:', error);
    return handleApiError(error);
  }
}
