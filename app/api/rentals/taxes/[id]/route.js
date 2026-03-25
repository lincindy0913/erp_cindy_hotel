import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { getCategoryId } from '@/lib/cash-category-helper';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { recalcBalance } from '@/lib/recalc-balance';
import { nextCashTransactionNo } from '@/lib/sequence-generator';

export const dynamic = 'force-dynamic';


export async function PUT(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.RENTAL_EDIT);
  if (!auth.ok) return auth.response;
  
  try {
    const { id } = await params;
    const taxId = parseInt(id);
    const body = await request.json();

    const { accountId, paymentDate } = body;

    if (!accountId) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請選擇付款帳戶', 400);
    }

    const tax = await prisma.propertyTax.findUnique({
      where: { id: taxId },
      include: {
        property: { select: { name: true } }
      }
    });

    if (!tax) {
      return createErrorResponse('NOT_FOUND', '找不到稅款紀錄', 404);
    }

    const acctId = parseInt(accountId);
    const txDate = paymentDate || new Date().toISOString().split('T')[0];
    const transactionNo = await nextCashTransactionNo(tx, txDate);

    // Create CashTransaction for tax payment
    const categoryId = await getCategoryId(prisma, 'rental_tax');
    const tx = await prisma.cashTransaction.create({
      data: {
        transactionNo,
        transactionDate: txDate,
        type: '支出',
        accountId: acctId,
        categoryId,
        amount: Number(tax.amount),
        description: `房屋稅款 - ${tax.property.name} - ${tax.taxYear} ${tax.taxType}`,
        sourceType: 'rental_tax',
        sourceRecordId: taxId,
        status: '已確認'
      }
    });

    // Update tax record
    await prisma.propertyTax.update({
      where: { id: taxId },
      data: {
        status: 'paid',
        cashTransactionId: tx.id,
        confirmedAt: new Date(),
        confirmedBy: body.confirmedBy || null
      }
    });

    // Recalculate balance
    await recalcBalance(prisma, acctId);

    return NextResponse.json({ success: true, transactionId: tx.id });
  } catch (error) {
    console.error('PUT /api/rentals/taxes/[id] error:', error.message || error);
    return handleApiError(error);
  }
}

// PATCH - 編輯稅款（金額、到期日、稅種）；若已繳納會同步更新金流
export async function PATCH(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.RENTAL_EDIT);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const taxId = parseInt(id);
    const body = await request.json();
    const { amount, dueDate, taxType } = body;

    const tax = await prisma.propertyTax.findUnique({
      where: { id: taxId },
      include: { property: { select: { name: true } } }
    });

    if (!tax) {
      return createErrorResponse('NOT_FOUND', '找不到稅款紀錄', 404);
    }

    if (tax.status === 'paid' || tax.cashTransactionId) {
      return createErrorResponse('VALIDATION_FAILED', '已繳款的稅款不可編輯', 400);
    }

    const updateData = {};
    if (amount !== undefined) updateData.amount = Number(amount);
    if (dueDate !== undefined) updateData.dueDate = dueDate;
    if (taxType !== undefined) updateData.taxType = taxType;

    if (Object.keys(updateData).length === 0) {
      return createErrorResponse('VALIDATION_FAILED', '請提供要更新的欄位', 400);
    }

    await prisma.propertyTax.update({
      where: { id: taxId },
      data: updateData
    });

    // Sync linked PaymentOrder when amount/dueDate/taxType changes
    if (tax.paymentOrderId) {
      const orderUpdate = {};
      if (amount !== undefined) {
        const newAmt = Number(amount);
        orderUpdate.amount = newAmt;
        orderUpdate.netAmount = newAmt;
      }
      if (dueDate !== undefined) {
        orderUpdate.dueDate = dueDate;
      }
      if (taxType !== undefined || amount !== undefined) {
        const newTaxType = taxType || tax.taxType;
        orderUpdate.supplierName = `房屋稅款 - ${tax.property.name} - ${tax.taxYear} ${newTaxType}`;
        orderUpdate.summary = orderUpdate.supplierName;
      }
      if (Object.keys(orderUpdate).length > 0) {
        await prisma.paymentOrder.update({
          where: { id: tax.paymentOrderId },
          data: orderUpdate
        });
      }
    }

    const updated = await prisma.propertyTax.findUnique({
      where: { id: taxId },
      include: { property: { select: { name: true } } }
    });
    return NextResponse.json(updated);
  } catch (error) {
    console.error('PATCH /api/rentals/taxes/[id] error:', error.message || error);
    return handleApiError(error);
  }
}

// DELETE - 刪除稅款（僅待繳可刪除；已付款不可刪除）
export async function DELETE(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.RENTAL_EDIT);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const taxId = parseInt(id);

    const tax = await prisma.propertyTax.findUnique({
      where: { id: taxId }
    });

    if (!tax) {
      return createErrorResponse('NOT_FOUND', '找不到稅款紀錄', 404);
    }

    if (tax.status === 'paid' || tax.cashTransactionId) {
      return createErrorResponse('VALIDATION_FAILED', '已付款的稅款不可刪除', 400);
    }

    // Delete linked PaymentOrder if exists
    if (tax.paymentOrderId) {
      await prisma.paymentOrder.delete({ where: { id: tax.paymentOrderId } }).catch(() => {});
    }

    await prisma.propertyTax.delete({
      where: { id: taxId }
    });

    return NextResponse.json({ message: '已刪除' });
  } catch (error) {
    console.error('DELETE /api/rentals/taxes/[id] error:', error.message || error);
    return handleApiError(error);
  }
}
