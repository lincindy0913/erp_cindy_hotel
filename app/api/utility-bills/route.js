import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../auth/[...nextauth]/route';
import { handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { applyWarehouseFilter } from '@/lib/warehouse-access';

export const dynamic = 'force-dynamic';

// ── 計算 summaryJson 合計金額 ───────────────────────────────────
function calcTotalFromJson(summaryJson, billType) {
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
async function generatePaymentOrderNo() {
  const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const prefix = `PAY-${today}-`;
  const existing = await prisma.paymentOrder.findMany({
    where: { orderNo: { startsWith: prefix } },
    select: { orderNo: true },
  });
  let maxSeq = 0;
  for (const item of existing) {
    const seq = parseInt(item.orderNo.substring(prefix.length)) || 0;
    if (seq > maxSeq) maxSeq = seq;
  }
  return `${prefix}${String(maxSeq + 1).padStart(3, '0')}`;
}

// GET: 列表，可篩選 館別、年、月、類型
export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.EXPENSE_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const warehouse = searchParams.get('warehouse');
    const year = searchParams.get('year');
    const month = searchParams.get('month');
    const billType = searchParams.get('billType');
    const withPayment = searchParams.get('withPayment') === 'true';

    const where = {};
    if (warehouse) where.warehouse = warehouse;
    if (year) where.billYear = parseInt(year, 10);
    if (month) where.billMonth = parseInt(month, 10);
    if (billType) where.billType = billType;

    // Warehouse-level access control
    const wf = applyWarehouseFilter(auth.session, where);
    if (!wf.ok) return wf.response;

    const list = await prisma.utilityBillRecord.findMany({
      where,
      orderBy: [{ billYear: 'desc' }, { billMonth: 'desc' }, { warehouse: 'asc' }],
    });

    // 若需要付款狀態，批次查 PaymentOrder
    let poMap = {};
    if (withPayment) {
      const poIds = list.filter(r => r.paymentOrderId).map(r => r.paymentOrderId);
      if (poIds.length > 0) {
        const orders = await prisma.paymentOrder.findMany({
          where: { id: { in: poIds } },
          select: { id: true, orderNo: true, status: true, netAmount: true, dueDate: true },
        });
        poMap = Object.fromEntries(orders.map(o => [o.id, o]));
      }
    }

    return NextResponse.json(list.map(r => ({
      id: r.id,
      warehouse: r.warehouse,
      billYear: r.billYear,
      billMonth: r.billMonth,
      billType: r.billType,
      summaryJson: r.summaryJson,
      fileName: r.fileName,
      totalAmount: r.totalAmount !== null ? Number(r.totalAmount) : null,
      paymentOrderId: r.paymentOrderId,
      paymentOrder: r.paymentOrderId && poMap[r.paymentOrderId]
        ? { ...poMap[r.paymentOrderId], netAmount: Number(poMap[r.paymentOrderId].netAmount) }
        : null,
      createdAt: r.createdAt.toISOString(),
    })));
  } catch (error) {
    return handleApiError(error);
  }
}

// POST: 儲存一筆解析結果，並自動建立付款單
export async function POST(request) {
  const authPost = await requirePermission(PERMISSIONS.EXPENSE_CREATE);
  if (!authPost.ok) return authPost.response;

  try {
    const session = authPost.session;
    const body = await request.json();
    const { warehouse, billYear, billMonth, billType, summaryJson, fileName } = body;

    if (!warehouse || billYear == null || billMonth == null || !billType || !summaryJson) {
      return NextResponse.json(
        { error: '缺少欄位：warehouse, billYear, billMonth, billType, summaryJson' },
        { status: 400 }
      );
    }

    const year = parseInt(billYear, 10);
    const month = parseInt(billMonth, 10);
    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
      return NextResponse.json({ error: '年度或月份不正確' }, { status: 400 });
    }

    const jsonStr = typeof summaryJson === 'string' ? summaryJson : JSON.stringify(summaryJson);
    const totalAmount = calcTotalFromJson(jsonStr, billType);

    const data = {
      warehouse: String(warehouse).trim(),
      billYear: year,
      billMonth: month,
      billType: billType === '水費' ? '水費' : '電費',
      summaryJson: jsonStr,
      fileName: fileName ? String(fileName).trim() : null,
      totalAmount: totalAmount > 0 ? totalAmount : null,
    };

    // Upsert UtilityBillRecord
    const record = await prisma.utilityBillRecord.upsert({
      where: {
        warehouse_billYear_billMonth_billType: {
          warehouse: data.warehouse,
          billYear: data.billYear,
          billMonth: data.billMonth,
          billType: data.billType,
        },
      },
      create: data,
      update: {
        summaryJson: data.summaryJson,
        fileName: data.fileName,
        totalAmount: data.totalAmount,
      },
    });

    // ── 自動建立或更新付款單 ──────────────────────────────────
    let paymentOrderId = record.paymentOrderId;
    let paymentOrderNo = null;
    let paymentOrderStatus = null;

    if (totalAmount > 0) {
      const userName = session?.user?.name || session?.user?.email || 'system';

      // 找或建立廠商（台電 / 台水）
      const supplierKeyword = data.billType === '電費' ? '台電' : '台水';
      const supplierFullName = data.billType === '電費' ? '台灣電力公司' : '台灣自來水股份有限公司';
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

      if (paymentOrderId) {
        // 若已有付款單且還是待出納 → 更新金額
        const existingPO = await prisma.paymentOrder.findUnique({
          where: { id: paymentOrderId },
          select: { status: true, orderNo: true },
        });
        if (existingPO) {
          paymentOrderNo = existingPO.orderNo;
          paymentOrderStatus = existingPO.status;
          if (existingPO.status === '待出納') {
            await prisma.paymentOrder.update({
              where: { id: paymentOrderId },
              data: { amount: totalAmount, netAmount: totalAmount },
            });
          }
          // 若已付款或已取消，保留原單號不重建
        } else {
          paymentOrderId = null; // 原單號不存在，重建
        }
      }

      if (!paymentOrderId) {
        // 建立新付款單
        const orderNo = await generatePaymentOrderNo();
        const summary = `${data.warehouse} ${year}年${month}月 ${data.billType}`;
        const po = await prisma.paymentOrder.create({
          data: {
            orderNo,
            invoiceIds: [],
            supplierId:   supplier?.id   || null,
            supplierName: supplier?.name || supplierFullName,
            warehouse:    data.warehouse,
            paymentMethod: '轉帳',
            amount:       totalAmount,
            discount:     0,
            netAmount:    totalAmount,
            summary,
            status:       '待出納',
            createdBy:    userName,
            sourceType:   'utility_bill',
            sourceRecordId: record.id,
          },
        });
        paymentOrderId = po.id;
        paymentOrderNo = po.orderNo;
        paymentOrderStatus = '待出納';

        // 回填 paymentOrderId 到 UtilityBillRecord
        await prisma.utilityBillRecord.update({
          where: { id: record.id },
          data: { paymentOrderId },
        });
      }
    }

    return NextResponse.json({
      id: record.id,
      message: '已儲存',
      warehouse: record.warehouse,
      billYear: record.billYear,
      billMonth: record.billMonth,
      billType: record.billType,
      totalAmount,
      paymentOrderId,
      paymentOrderNo,
      paymentOrderStatus,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
