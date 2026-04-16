import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../auth/[...nextauth]/route';

// ── 從 summaryJson 計算合計金額 ────────────────────────────────
function calcTotal(summaryJson, billType) {
  try {
    const raw = typeof summaryJson === 'string' ? JSON.parse(summaryJson) : summaryJson;
    const items = Array.isArray(raw) ? raw : [raw];
    return items.reduce((sum, item) => {
      const v = billType === '電費'
        ? (item.應繳總金額 || item.電費金額 || '0')
        : (item.總金額 || '0');
      return sum + (parseInt(String(v).replace(/,/g, '')) || 0);
    }, 0);
  } catch { return 0; }
}

// ── 產生 PAY-YYYYMMDD-NNN 單號 ────────────────────────────────
async function genOrderNo() {
  const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const prefix = `PAY-${today}-`;
  const existing = await prisma.paymentOrder.findMany({
    where: { orderNo: { startsWith: prefix } },
    select: { orderNo: true },
  });
  let max = 0;
  for (const e of existing) {
    const n = parseInt(e.orderNo.substring(prefix.length)) || 0;
    if (n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.EXPENSE_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

    const record = await prisma.utilityBillRecord.findUnique({
      where: { id },
    });
    if (!record) return NextResponse.json({ error: 'Not found' }, { status: 404 });

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
    const id = parseInt(params.id, 10);
    if (isNaN(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

    const body = await request.json();
    const { summaryJson, fileName } = body;

    const update = {};
    if (summaryJson != null) {
      update.summaryJson = typeof summaryJson === 'string' ? summaryJson : JSON.stringify(summaryJson);
    }
    if (fileName !== undefined) update.fileName = fileName ? String(fileName).trim() : null;

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const record = await prisma.utilityBillRecord.update({
      where: { id },
      data: update,
    });

    return NextResponse.json({
      id: record.id,
      message: '已更新',
      warehouse: record.warehouse,
      billYear: record.billYear,
      billMonth: record.billMonth,
      billType: record.billType,
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
    const id = parseInt(params.id, 10);
    if (isNaN(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

    const record = await prisma.utilityBillRecord.findUnique({ where: { id } });
    if (!record) return NextResponse.json({ error: '找不到記錄' }, { status: 404 });

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
      return NextResponse.json({ error: '無法計算繳費金額，請先確認帳單明細中的金額欄位' }, { status: 400 });
    }

    const session = auth.session;
    const userName = session?.user?.name || session?.user?.email || 'system';

    // 找或建立廠商
    const supplierKeyword = record.billType === '電費' ? '台電' : '台水';
    const supplierFullName = record.billType === '電費' ? '台灣電力公司' : '台灣自來水股份有限公司';
    let supplier = await prisma.supplier.findFirst({
      where: { OR: [{ name: { contains: supplierKeyword } }, { name: supplierFullName }], isActive: true },
      select: { id: true, name: true },
    });
    if (!supplier) {
      supplier = await prisma.supplier.create({
        data: { name: supplierFullName, isActive: true },
        select: { id: true, name: true },
      });
    }

    // 建立付款單
    const orderNo = await genOrderNo();
    const po = await prisma.paymentOrder.create({
      data: {
        orderNo,
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

    // 回填 paymentOrderId 和 totalAmount
    await prisma.utilityBillRecord.update({
      where: { id },
      data: { paymentOrderId: po.id, totalAmount },
    });

    return NextResponse.json({ ok: true, orderNo: po.orderNo, totalAmount });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.EXPENSE_CREATE);
  if (!auth.ok) return auth.response;

  try {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

    await prisma.utilityBillRecord.delete({ where: { id } });
    return NextResponse.json({ message: '已刪除' });
  } catch (error) {
    return handleApiError(error);
  }
}
