import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

// GET: single maintenance
export async function GET(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.RENTAL_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const record = await prisma.rentalMaintenance.findUnique({
      where: { id: parseInt(id) },
      include: {
        property: { select: { id: true, name: true, buildingName: true } }
      }
    });
    if (!record) {
      return createErrorResponse('NOT_FOUND', '找不到維護紀錄', 404);
    }
    return NextResponse.json({
      ...record,
      amount: Number(record.amount),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString()
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// PUT: 編輯維護紀錄（僅待付可編輯）；已付款不可編輯
export async function PUT(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.RENTAL_EDIT);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const maintenanceId = parseInt(id);
    const body = await request.json();

    const record = await prisma.rentalMaintenance.findUnique({
      where: { id: maintenanceId },
      include: { property: { select: { name: true } } }
    });

    if (!record) {
      return createErrorResponse('NOT_FOUND', '找不到維護紀錄', 404);
    }

    if (record.status === 'paid' || record.cashTransactionId) {
      return createErrorResponse('VALIDATION_FAILED', '已付款的維護費不可編輯', 400);
    }

    const {
      propertyId,
      maintenanceDate,
      category,
      amount,
      accountingSubjectId,
      supplierId,
      isEmployeeAdvance,
      advancedBy,
      advancePaymentMethod,
      note
    } = body;

    const updateData = {};
    if (propertyId != null) updateData.propertyId = parseInt(propertyId);
    if (maintenanceDate != null) updateData.maintenanceDate = maintenanceDate;
    if (category != null) updateData.category = category;
    if (amount != null) updateData.amount = parseFloat(amount);
    if (accountingSubjectId != null) updateData.accountingSubjectId = parseInt(accountingSubjectId);
    if (supplierId !== undefined) updateData.supplierId = supplierId ? parseInt(supplierId) : null;
    if (isEmployeeAdvance !== undefined) {
      updateData.isEmployeeAdvance = !!isEmployeeAdvance;
      updateData.advancedBy = isEmployeeAdvance ? (advancedBy || null) : null;
      updateData.advancePaymentMethod = isEmployeeAdvance ? (advancePaymentMethod || '現金') : null;
    }
    if (note !== undefined) updateData.note = note || null;

    const updated = await prisma.rentalMaintenance.update({
      where: { id: maintenanceId },
      data: updateData,
      include: {
        property: { select: { id: true, name: true, buildingName: true } }
      }
    });

    // Sync linked PaymentOrder when amount/note/category changes
    if (record.paymentOrderId) {
      const orderUpdate = {};
      if (amount != null) {
        const newAmt = parseFloat(amount);
        orderUpdate.amount = newAmt;
        orderUpdate.netAmount = newAmt;
      }
      if (category != null || amount != null || note !== undefined) {
        const advanceLabel = (updated.isEmployeeAdvance && updated.advancedBy) ? ` (員工代墊: ${updated.advancedBy})` : '';
        const summary = `租賃維護費 - ${updated.property.name} - ${updated.category}${advanceLabel}`;
        orderUpdate.supplierName = null;
        orderUpdate.summary = summary;
      }
      if (note !== undefined) orderUpdate.note = note || null;
      if (Object.keys(orderUpdate).length > 0) {
        await prisma.paymentOrder.update({
          where: { id: record.paymentOrderId },
          data: orderUpdate
        });
      }
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error('PUT /api/rentals/maintenance/[id] error:', error);
    return handleApiError(error);
  }
}

// DELETE: 僅未付款可刪除
export async function DELETE(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.RENTAL_EDIT);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const maintenanceId = parseInt(id);

    const record = await prisma.rentalMaintenance.findUnique({
      where: { id: maintenanceId }
    });

    if (!record) {
      return createErrorResponse('NOT_FOUND', '找不到維護紀錄', 404);
    }

    if (record.status === 'paid' || record.cashTransactionId) {
      return createErrorResponse('VALIDATION_FAILED', '已付款的維護費不可刪除', 400);
    }

    // Delete linked PaymentOrder if exists
    if (record.paymentOrderId) {
      await prisma.paymentOrder.delete({ where: { id: record.paymentOrderId } }).catch(() => {});
    }

    await prisma.rentalMaintenance.delete({
      where: { id: maintenanceId }
    });

    return NextResponse.json({ message: '已刪除' });
  } catch (error) {
    console.error('DELETE /api/rentals/maintenance/[id] error:', error);
    return handleApiError(error);
  }
}
