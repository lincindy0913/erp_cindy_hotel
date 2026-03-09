import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

// Helper: generate sequence number with prefix
async function generateNo(tx, model, prefix, field = 'purchaseNo') {
  const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const fullPrefix = `${prefix}-${today}-`;

  let maxSeq = 0;
  if (model === 'purchaseMaster') {
    const existing = await tx.purchaseMaster.findMany({
      where: { purchaseNo: { startsWith: fullPrefix } },
      select: { purchaseNo: true }
    });
    for (const item of existing) {
      const seq = parseInt(item.purchaseNo.substring(fullPrefix.length)) || 0;
      if (seq > maxSeq) maxSeq = seq;
    }
  } else if (model === 'salesMaster') {
    const existing = await tx.salesMaster.findMany({
      where: { salesNo: { startsWith: fullPrefix } },
      select: { salesNo: true }
    });
    for (const item of existing) {
      const seq = parseInt(item.salesNo.substring(fullPrefix.length)) || 0;
      if (seq > maxSeq) maxSeq = seq;
    }
  } else if (model === 'commonExpenseRecord') {
    const existing = await tx.commonExpenseRecord.findMany({
      where: { recordNo: { startsWith: fullPrefix } },
      select: { recordNo: true }
    });
    for (const item of existing) {
      const seq = parseInt(item.recordNo.substring(fullPrefix.length)) || 0;
      if (seq > maxSeq) maxSeq = seq;
    }
  }

  return `${fullPrefix}${String(maxSeq + 1).padStart(4, '0')}`;
}

// POST: Execute purchase-type template
// Creates: PurchaseMaster + optional SalesMaster + CommonExpenseRecord
export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.EXPENSE_CREATE);
  if (!auth.ok) return auth.response;

  try {
    const data = await request.json();

    // Validate required fields
    if (!data.templateId) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請選擇費用範本', 400);
    }
    if (!data.warehouse?.trim()) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請選擇館別', 400);
    }
    if (!data.expenseMonth?.trim()) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請選擇費用月份', 400);
    }
    if (!data.supplierId) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請選擇廠商', 400);
    }
    if (!data.items || data.items.length === 0) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請至少新增一筆進貨品項', 400);
    }
    if (!data.createdBy?.trim()) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '缺少建立者資訊', 400);
    }

    // Calculate totals
    const totalAmount = data.items.reduce((sum, item) => {
      return sum + (parseFloat(item.quantity) * parseFloat(item.unitPrice));
    }, 0);

    // Check for duplicate
    const duplicate = await prisma.commonExpenseRecord.findFirst({
      where: {
        templateId: parseInt(data.templateId),
        warehouse: data.warehouse.trim(),
        expenseMonth: data.expenseMonth.trim(),
        executionType: 'purchase',
        status: { not: '已作廢' }
      }
    });

    if (duplicate && !data.allowDuplicate) {
      return createErrorResponse('CONFLICT_UNIQUE',
        `此範本在 ${data.warehouse} ${data.expenseMonth} 已有記錄 (${duplicate.recordNo})，確定要再新增嗎？`,
        409, { duplicate: true });
    }

    const result = await prisma.$transaction(async (tx) => {
      const purchaseDate = `${data.expenseMonth}-01`;
      const supplierId = parseInt(data.supplierId);

      // 1. Create PurchaseMaster + PurchaseDetail
      const purchaseNo = await generateNo(tx, 'purchaseMaster', 'PUR');
      const purchaseMaster = await tx.purchaseMaster.create({
        data: {
          purchaseNo,
          warehouse: data.warehouse.trim(),
          department: data.department || '',
          supplierId,
          purchaseDate,
          paymentTerms: data.paymentTerms || '月結',
          taxType: data.taxType || null,
          amount: totalAmount,
          tax: 0,
          totalAmount: totalAmount,
          status: '待入庫',
          details: {
            create: data.items.map(item => ({
              productId: parseInt(item.productId),
              quantity: parseInt(item.quantity),
              unitPrice: parseFloat(item.unitPrice),
              note: item.note || '',
              status: '待入庫',
              inventoryWarehouse: item.inventoryWarehouse || null
            }))
          }
        },
        include: { details: true }
      });

      // 2. Record price history
      for (const item of data.items) {
        if (item.productId && item.unitPrice) {
          await tx.priceHistory.create({
            data: {
              supplierId,
              productId: parseInt(item.productId),
              purchaseDate,
              unitPrice: parseFloat(item.unitPrice)
            }
          });
        }
      }

      // 3. Optionally create SalesMaster (invoice) if invoice info provided
      let salesMaster = null;
      if (data.invoiceNo?.trim()) {
        const salesNo = await generateNo(tx, 'salesMaster', 'INV');
        salesMaster = await tx.salesMaster.create({
          data: {
            salesNo,
            invoiceNo: data.invoiceNo.trim(),
            invoiceDate: data.invoiceDate || purchaseDate,
            invoiceTitle: data.invoiceTitle || null,
            taxType: data.taxType || null,
            invoiceAmount: totalAmount,
            amount: totalAmount,
            tax: 0,
            totalAmount: totalAmount,
            status: '待核銷',
            details: {
              create: data.items.map(item => ({
                purchaseItemId: `${purchaseMaster.id}-${item.productId}`,
                purchaseId: purchaseMaster.id,
                purchaseNo: purchaseNo,
                purchaseDate: purchaseDate,
                warehouse: data.warehouse.trim(),
                supplierId,
                productId: parseInt(item.productId),
                quantity: parseInt(item.quantity),
                unitPrice: parseFloat(item.unitPrice),
                subtotal: parseFloat(item.quantity) * parseFloat(item.unitPrice)
              }))
            }
          },
          include: { details: true }
        });
      }

      // 4. Create CommonExpenseRecord
      const recordNo = await generateNo(tx, 'commonExpenseRecord', 'EXP');
      const record = await tx.commonExpenseRecord.create({
        data: {
          recordNo,
          templateId: parseInt(data.templateId),
          executionType: 'purchase',
          warehouse: data.warehouse.trim(),
          expenseMonth: data.expenseMonth.trim(),
          supplierId,
          supplierName: data.supplierName || null,
          paymentMethod: data.paymentTerms || '月結',
          totalDebit: totalAmount,
          totalCredit: totalAmount,
          purchaseMasterId: purchaseMaster.id,
          salesMasterId: salesMaster?.id || null,
          purchaseNo: purchaseNo,
          salesNo: salesMaster?.salesNo || null,
          status: '已確認',
          confirmedBy: data.createdBy.trim(),
          confirmedAt: new Date(),
          note: data.note || null,
          createdBy: data.createdBy.trim(),
          entryLines: {
            create: [
              {
                entryType: 'debit',
                accountingCode: '5100',
                accountingName: '進貨成本',
                summary: `${data.supplierName || '廠商'} - 每月進貨費用 ${data.expenseMonth}`,
                amount: totalAmount,
                sortOrder: 0
              },
              {
                entryType: 'credit',
                accountingCode: '2100',
                accountingName: '應付帳款',
                summary: `${data.supplierName || '廠商'} - 每月進貨費用 ${data.expenseMonth}`,
                amount: totalAmount,
                sortOrder: 1
              }
            ]
          }
        },
        include: {
          template: { select: { id: true, name: true } },
          entryLines: { orderBy: { sortOrder: 'asc' } }
        }
      });

      return {
        record,
        purchaseNo,
        salesNo: salesMaster?.salesNo || null,
        totalAmount
      };
    });

    return NextResponse.json({
      ...result.record,
      totalDebit: Number(result.record.totalDebit),
      totalCredit: Number(result.record.totalCredit),
      entryLines: result.record.entryLines.map(l => ({ ...l, amount: Number(l.amount) })),
      createdAt: result.record.createdAt.toISOString(),
      updatedAt: result.record.updatedAt.toISOString(),
      confirmedAt: result.record.confirmedAt?.toISOString() || null,
      linkedPurchaseNo: result.purchaseNo,
      linkedSalesNo: result.salesNo,
      totalAmount: result.totalAmount
    }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
