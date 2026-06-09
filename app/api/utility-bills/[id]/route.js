import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../auth/[...nextauth]/route';
import { todayStr } from '@/lib/localDate';
import { nextSequence } from '@/lib/sequence-generator';
import { assertPeriodOpen } from '@/lib/period-lock';

// ── 從 summaryJson 計算合計金額（parseFloat 保留小數，四捨五入到分）──
function calcTotal(summaryJson, billType) {
  try {
    const raw = typeof summaryJson === 'string' ? JSON.parse(summaryJson) : summaryJson;
    const items = Array.isArray(raw) ? raw : [raw];
    return items.reduce((sum, item) => {
      const v = billType === '電費'
        ? (item.應繳總金額 || item.電費金額 || '0')
        : (item.總金額 || '0');
      return sum + (Math.round(parseFloat(String(v).replace(/,/g, '')) * 100) / 100 || 0);
    }, 0);
  } catch { return 0; }
}

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.EXPENSE_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const id = parseInt((await params).id, 10);
    if (isNaN(id)) return createErrorResponse('VALIDATION_FAILED', 'Invalid id', 400);

    const record = await prisma.utilityBillRecord.findUnique({
      where: { id },
    });
    if (!record) return createErrorResponse('NOT_FOUND', '找不到水電帳單記錄', 404);

    return NextResponse.json({
      id: record.id,
      warehouse: record.warehouse,
      billYear: record.billYear,
      billMonth: record.billMonth,
      billType: record.billType,
      summaryJson: typeof record.summaryJson === 'string' ? JSON.parse(record.summaryJson) : record.summaryJson,
      fileName: record.fileName,
      createdAt: record.createdAt.toISOString(),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.EXPENSE_CREATE);
  if (!auth.ok) return auth.response;

  try {
    const id = parseInt((await params).id, 10);
    if (isNaN(id)) return createErrorResponse('VALIDATION_FAILED', 'Invalid id', 400);

    const body = await request.json();
    const { summaryJson, fileName } = body;

    if (summaryJson == null && fileName === undefined) {
      return createErrorResponse('VALIDATION_FAILED', 'No fields to update', 400);
    }

    const { record, totalAmount, paymentOrderSynced } = await prisma.$transaction(async (tx) => {
      // Re-read inside transaction for current billType and paymentOrderId
      const existing = await tx.utilityBillRecord.findUnique({ where: { id } });
      if (!existing) throw new Error('NOT_FOUND:找不到記錄');

      // Period lock: block edits on closed months
      const periodDate = `${existing.billYear}-${String(existing.billMonth).padStart(2, '0')}-01`;
      await assertPeriodOpen(tx, periodDate, existing.warehouse);

      const update = {};
      if (summaryJson != null) {
        update.summaryJson = typeof summaryJson === 'string' ? summaryJson : JSON.stringify(summaryJson);
      }
      if (fileName !== undefined) update.fileName = fileName ? String(fileName).trim() : null;

      // Recalculate totalAmount whenever summaryJson changes
      let newTotal = existing.totalAmount !== null ? Number(existing.totalAmount) : null;
      if (summaryJson != null) {
        newTotal = calcTotal(update.summaryJson, existing.billType);
        update.totalAmount = newTotal > 0 ? newTotal : null;
      }

      const rec = await tx.utilityBillRecord.update({ where: { id }, data: update });

      // Sync payment order if still '待出納'
      let synced = false;
      if (summaryJson != null && existing.paymentOrderId && newTotal > 0) {
        const po = await tx.paymentOrder.findUnique({
          where: { id: existing.paymentOrderId },
          select: { status: true },
        });
        if (po?.status === '待出納') {
          await tx.paymentOrder.update({
            where: { id: existing.paymentOrderId },
            data: { amount: newTotal, netAmount: newTotal },
          });
          synced = true;
        }
      }

      return { record: rec, totalAmount: newTotal, paymentOrderSynced: synced };
    });

    return NextResponse.json({
      id: record.id,
      message: '已更新',
      warehouse: record.warehouse,
      billYear: record.billYear,
      billMonth: record.billMonth,
      billType: record.billType,
      totalAmount,
      paymentOrderSynced,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// PATCH /api/utility-bills/[id]
// action='createPaymentOrder' → 為現有記錄建立付款單（用於舊有未連結的記錄）
export async function PATCH(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.EXPENSE_CREATE);
  if (!auth.ok) return auth.response;

  try {
    const id = parseInt((await params).id, 10);
    if (isNaN(id)) return createErrorResponse('VALIDATION_FAILED', 'Invalid id', 400);

    const record = await prisma.utilityBillRecord.findUnique({ where: { id } });
    if (!record) return createErrorResponse('NOT_FOUND', '找不到水電帳單記錄', 404);

    // 若已有有效付款單，直接回傳
    if (record.paymentOrderId) {
      const po = await prisma.paymentOrder.findUnique({
        where: { id: record.paymentOrderId },
        select: { orderNo: true, status: true },
      });
      if (po && po.status !== '已取消') {
        return NextResponse.json({ ok: true, already: true, orderNo: po.orderNo, status: po.status });
      }
    }

    // 計算金額
    const totalAmount = calcTotal(record.summaryJson, record.billType);
    if (totalAmount <= 0) {
      return createErrorResponse('VALIDATION_FAILED', '無法計算繳費金額，請先確認帳單明細中的金額欄位', 400);
    }

    const session = auth.session;
    const userName = session?.user?.name || session?.user?.email || 'system';

    // 找廠商（transaction 外，唯讀）
    const supplierKeyword = record.billType === '電費' ? '台電' : '台水';
    const supplierFullName = record.billType === '電費' ? '台灣電力公司' : '台灣自來水股份有限公司';
    let supplier = await prisma.supplier.findFirst({
      where: { OR: [{ name: { contains: supplierKeyword } }, { name: supplierFullName }], isActive: true },
      select: { id: true, name: true },
    });

    const { orderNo } = await prisma.$transaction(async (tx) => {
      if (!supplier) {
        supplier = await tx.supplier.create({
          data: { name: supplierFullName, isActive: true },
          select: { id: true, name: true },
        });
      }

      const dateStr = todayStr().replace(/-/g, '');
      const poNo = await nextSequence(tx, 'paymentOrder', 'orderNo', `PAY-${dateStr}-`, 3);

      const po = await tx.paymentOrder.create({
        data: {
          orderNo: poNo,
          invoiceIds: [],
          supplierId:    supplier?.id   || null,
          supplierName:  supplier?.name || supplierFullName,
          warehouse:     record.warehouse,
          paymentMethod: '轉帳',
          amount:        totalAmount,
          discount:      0,
          netAmount:     totalAmount,
          summary:       `${record.warehouse} ${record.billYear}年${record.billMonth}月 ${record.billType}`,
          status:        '待出納',
          createdBy:     userName,
          sourceType:    'utility_bill',
          sourceRecordId: record.id,
        },
      });

      await tx.utilityBillRecord.update({
        where: { id },
        data: { paymentOrderId: po.id, totalAmount },
      });

      return { orderNo: po.orderNo };
    });

    return NextResponse.json({ ok: true, orderNo, totalAmount });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.EXPENSE_CREATE);
  if (!auth.ok) return auth.response;

  try {
    const id = parseInt((await params).id, 10);
    if (isNaN(id)) return createErrorResponse('VALIDATION_FAILED', 'Invalid id', 400);

    const record = await prisma.utilityBillRecord.findUnique({
      where: { id },
      select: { id: true, paymentOrderId: true, billType: true, billYear: true, billMonth: true, warehouse: true },
    });
    if (!record) return createErrorResponse('NOT_FOUND', '找不到水電帳單記錄', 404);

    // Check associated payment order before deleting
    if (record.paymentOrderId) {
      const po = await prisma.paymentOrder.findUnique({
        where: { id: record.paymentOrderId },
        select: { id: true, status: true, orderNo: true },
      });

      if (po && po.status !== '已取消') {
        if (po.status === '待出納') {
          // Auto-cancel the payment order and delete in one transaction
          await prisma.$transaction([
            prisma.paymentOrder.update({
              where: { id: po.id },
              data: { status: '已取消' },
            }),
            prisma.utilityBillRecord.delete({ where: { id } }),
          ]);
          return NextResponse.json({
            message: '已刪除，關聯付款單已自動作廢',
            cancelledOrderNo: po.orderNo,
          });
        }

        // PO already executed or in a non-cancellable state → block
        return NextResponse.json(
          {
            error: `無法刪除：關聯付款單 ${po.orderNo} 狀態為「${po.status}」，請先在付款單管理中處理後再刪除水電記錄`,
            paymentOrderNo: po.orderNo,
            paymentOrderStatus: po.status,
          },
          { status: 422 }
        );
      }
    }

    // No PO or PO already cancelled → safe to delete
    await prisma.utilityBillRecord.delete({ where: { id } });
    return NextResponse.json({ message: '已刪除' });
  } catch (error) {
    return handleApiError(error);
  }
}
