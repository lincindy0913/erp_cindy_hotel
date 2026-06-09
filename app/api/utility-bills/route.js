import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../auth/[...nextauth]/route';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { applyWarehouseFilter } from '@/lib/warehouse-access';
import { todayStr } from '@/lib/localDate';
import { nextSequence } from '@/lib/sequence-generator';
import { assertPeriodOpen } from '@/lib/period-lock';

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
      return sum + (Math.round(parseFloat(String(v).replace(/,/g, '')) * 100) / 100 || 0);
    }, 0);
  } catch { return 0; }
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
      return createErrorResponse('REQUIRED_FIELD_MISSING', '缺少欄位：warehouse, billYear, billMonth, billType, summaryJson', 400);
    }

    const year = parseInt(billYear, 10);
    const month = parseInt(billMonth, 10);
    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
      return createErrorResponse('VALIDATION_FAILED', '年度或月份不正確', 400);
    }

    const jsonStr = typeof summaryJson === 'string' ? summaryJson : JSON.stringify(summaryJson);
    const totalAmount = calcTotalFromJson(jsonStr, billType);
    const userName = session?.user?.name || session?.user?.email || 'system';

    const billTypeNorm = billType === '水費' ? '水費' : '電費';
    const data = {
      warehouse: String(warehouse).trim(),
      billYear: year,
      billMonth: month,
      billType: billTypeNorm,
      summaryJson: jsonStr,
      fileName: fileName ? String(fileName).trim() : null,
      totalAmount: totalAmount > 0 ? totalAmount : null,
    };

    // 廠商查詢在 transaction 外（read-only，允許略早一步）
    const supplierKeyword  = billTypeNorm === '電費' ? '台電' : '台水';
    const supplierFullName = billTypeNorm === '電費' ? '台灣電力公司' : '台灣自來水股份有限公司';
    let supplier = await prisma.supplier.findFirst({
      where: { OR: [{ name: { contains: supplierKeyword } }, { name: supplierFullName }], isActive: true },
      select: { id: true, name: true },
    });

    const { record, paymentOrderId, paymentOrderNo, paymentOrderStatus } =
      await prisma.$transaction(async (tx) => {
        // ── Period lock: use first day of billing month ───────────────────
        const periodDate = `${year}-${String(month).padStart(2, '0')}-01`;
        await assertPeriodOpen(tx, periodDate, data.warehouse);

        // ── Step 1: upsert UtilityBillRecord ─────────────────────────────
        const rec = await tx.utilityBillRecord.upsert({
          where: {
            warehouse_billYear_billMonth_billType: {
              warehouse: data.warehouse,
              billYear:  data.billYear,
              billMonth: data.billMonth,
              billType:  data.billType,
            },
          },
          create: data,
          update: {
            summaryJson:  data.summaryJson,
            fileName:     data.fileName,
            totalAmount:  data.totalAmount,
          },
        });

        if (totalAmount <= 0) {
          return { record: rec, paymentOrderId: null, paymentOrderNo: null, paymentOrderStatus: null };
        }

        // ── Step 2: 找或建立廠商（transaction 內確保一致）────────────────
        if (!supplier) {
          supplier = await tx.supplier.create({
            data: { name: supplierFullName, isActive: true },
            select: { id: true, name: true },
          });
        }

        // ── Step 3: 建立或更新付款單 ──────────────────────────────────────
        let poId = rec.paymentOrderId;
        let poNo = null;
        let poStatus = null;

        if (poId) {
          const existingPO = await tx.paymentOrder.findUnique({
            where: { id: poId },
            select: { status: true, orderNo: true },
          });
          if (existingPO) {
            poNo     = existingPO.orderNo;
            poStatus = existingPO.status;
            if (existingPO.status === '待出納') {
              await tx.paymentOrder.update({
                where: { id: poId },
                data: { amount: totalAmount, netAmount: totalAmount },
              });
            }
          } else {
            poId = null; // 原單號不存在，重建
          }
        }

        if (!poId) {
          const dateStr = todayStr().replace(/-/g, '');
          const orderNo = await nextSequence(tx, 'paymentOrder', 'orderNo', `PAY-${dateStr}-`, 3);
          const summary = `${data.warehouse} ${year}年${month}月 ${data.billType}`;
          const po = await tx.paymentOrder.create({
            data: {
              orderNo,
              invoiceIds:    [],
              supplierId:    supplier?.id   || null,
              supplierName:  supplier?.name || supplierFullName,
              warehouse:     data.warehouse,
              paymentMethod: '轉帳',
              amount:        totalAmount,
              discount:      0,
              netAmount:     totalAmount,
              summary,
              status:        '待出納',
              createdBy:     userName,
              sourceType:    'utility_bill',
              sourceRecordId: rec.id,
            },
          });
          poId     = po.id;
          poNo     = po.orderNo;
          poStatus = '待出納';
        }

        // ── Step 4: 回填 paymentOrderId ───────────────────────────────────
        if (rec.paymentOrderId !== poId) {
          await tx.utilityBillRecord.update({
            where: { id: rec.id },
            data: { paymentOrderId: poId },
          });
        }

        return { record: rec, paymentOrderId: poId, paymentOrderNo: poNo, paymentOrderStatus: poStatus };
      });

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
