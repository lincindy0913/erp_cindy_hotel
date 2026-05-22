/**
 * GET    /api/bnb/ota-commission?month=YYYY-MM&source=Booking&warehouse=民宿
 *   → 回傳該月/來源/館別是否已有傭金記錄（含 PaymentOrder 狀態）
 *
 * GET    /api/bnb/ota-commission           (無 month)
 *   → 回傳全部列表（給歷史頁）
 *
 * POST   /api/bnb/ota-commission
 *   body: { commissionMonth, otaSource, warehouse, commissionAmount, paymentMethod, note }
 *   → 建立 BnbOtaCommission，狀態 = 草稿（不建立 PaymentOrder）
 *
 * PATCH  /api/bnb/ota-commission?id=123
 *   body: { commissionAmount, paymentMethod, note }          → 更新金額/備註（草稿或待出納）
 *   body: { action: 'confirm' }                              → 確認送出：建立 PaymentOrder，狀態改為待出納
 *
 * DELETE /api/bnb/ota-commission?id=123
 *   → 取消傭金（status='已取消'），需有 BNB_EDIT
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { assertBnbMonthOpen } from '@/lib/bnb-lock';

export const dynamic = 'force-dynamic';

/** 產生付款單號 PAY-YYYYMMDD-NNN */
async function generatePaymentOrderNo(tx) {
  const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const prefix = `PAY-${today}-`;
  const existing = await tx.paymentOrder.findMany({
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

/** 查找或建立 OTA 廠商 */
async function findOrCreateSupplier(otaSource) {
  let supplier = await prisma.supplier.findFirst({
    where: { name: { contains: otaSource }, isActive: true },
    select: { id: true, name: true },
  });
  if (!supplier) {
    supplier = await prisma.supplier.create({
      data: { name: otaSource, isActive: true },
      select: { id: true, name: true },
    });
  }
  return supplier;
}

// ── GET ─────────────────────────────────────────────────────────
export async function GET(request) {
  const auth = await requireAnyPermission([PERMISSIONS.BNB_VIEW, PERMISSIONS.BNB_CREATE, PERMISSIONS.BNB_EDIT]);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const month     = searchParams.get('month') || '';
  const source    = searchParams.get('source') || 'Booking';
  const warehouse = searchParams.get('warehouse') || '民宿';

  try {
    if (month) {
      // 查單筆
      const record = await prisma.bnbOtaCommission.findUnique({
        where: { commissionMonth_otaSource_warehouse: { commissionMonth: month, otaSource: source, warehouse } },
      });
      if (!record) return NextResponse.json({ exists: false });

      // 查關聯 PaymentOrder 狀態
      let orderStatus = null;
      if (record.paymentOrderId) {
        const po = await prisma.paymentOrder.findUnique({
          where: { id: record.paymentOrderId },
          select: { status: true, orderNo: true },
        });
        if (po) orderStatus = { status: po.status, orderNo: po.orderNo };
      }
      return NextResponse.json({ exists: true, record, orderStatus });
    }

    // 若無 month → 回傳全部列表（給歷史頁）
    const source2    = searchParams.get('source') || undefined;
    const warehouse2 = searchParams.get('warehouse') || undefined;
    const where = {};
    if (source2)    where.otaSource  = source2;
    if (warehouse2) where.warehouse  = warehouse2;

    const list = await prisma.bnbOtaCommission.findMany({
      where,
      orderBy: [{ commissionMonth: 'desc' }, { otaSource: 'asc' }],
    });

    // 批次查詢 PaymentOrder 狀態
    const poIds = list.filter(r => r.paymentOrderId).map(r => r.paymentOrderId);
    const orders = poIds.length
      ? await prisma.paymentOrder.findMany({
          where: { id: { in: poIds } },
          select: { id: true, status: true, orderNo: true },
        })
      : [];
    const orderMap = Object.fromEntries(orders.map(o => [o.id, o]));

    const rows = list.map(r => ({
      ...r,
      commissionAmount: Number(r.commissionAmount),
      paymentOrder: r.paymentOrderId ? orderMap[r.paymentOrderId] || null : null,
    }));

    return NextResponse.json({ rows });
  } catch (error) {
    return handleApiError(error);
  }
}

// ── POST ── 建立草稿（不建立 PaymentOrder）─────────────────────
export async function POST(request) {
  const auth = await requireAnyPermission([PERMISSIONS.BNB_CREATE, PERMISSIONS.BNB_EDIT]);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { commissionMonth, otaSource, warehouse, commissionAmount, paymentMethod, note } = body;

    if (!commissionMonth || !otaSource || !commissionAmount) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '缺少必填欄位', 400);
    }
    if (isNaN(Number(commissionAmount)) || Number(commissionAmount) <= 0) {
      return createErrorResponse('INVALID_PARAMETER', '傭金金額無效', 400);
    }

    await assertBnbMonthOpen(commissionMonth, warehouse || '民宿');

    // 防止重複建立（非已取消的記錄）
    const existing = await prisma.bnbOtaCommission.findUnique({
      where: {
        commissionMonth_otaSource_warehouse: {
          commissionMonth,
          otaSource,
          warehouse: warehouse || '民宿',
        },
      },
    });
    if (existing && existing.status !== '已取消') {
      return createErrorResponse('DUPLICATE', '該月份/來源/館別傭金已存在，請到 OTA傭金 分頁編輯或確認', 409);
    }

    const userName = auth.session?.user?.name || auth.session?.user?.email || 'system';
    const wh       = warehouse || '民宿';
    const pm       = paymentMethod || '轉帳';
    const amt      = Number(commissionAmount);

    const supplier = await findOrCreateSupplier(otaSource);

    // 建立或更新（已取消者）為草稿，不建立 PaymentOrder
    const commission = existing
      ? await prisma.bnbOtaCommission.update({
          where: { id: existing.id },
          data: {
            commissionAmount: amt,
            paymentMethod:    pm,
            note:             note || null,
            supplierId:       supplier?.id   || null,
            supplierName:     supplier?.name || otaSource,
            paymentOrderId:   null,
            status:           '草稿',
            confirmedBy:      userName,
            confirmedAt:      new Date(),
          },
        })
      : await prisma.bnbOtaCommission.create({
          data: {
            commissionMonth,
            otaSource,
            warehouse: wh,
            commissionAmount: amt,
            paymentMethod:    pm,
            note:             note || null,
            supplierId:       supplier?.id   || null,
            supplierName:     supplier?.name || otaSource,
            paymentOrderId:   null,
            status:           '草稿',
            confirmedBy:      userName,
            confirmedAt:      new Date(),
          },
        });

    return NextResponse.json({
      ok: true,
      commissionId: commission.id,
      status: '草稿',
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// ── PATCH ── 編輯金額/備註 或 確認送出出納 ───────────────────────
export async function PATCH(request) {
  const auth = await requireAnyPermission([PERMISSIONS.BNB_EDIT]);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const id = parseInt(searchParams.get('id'));
    if (!id) return createErrorResponse('REQUIRED_FIELD_MISSING', '缺少 id', 400);

    const body = await request.json();

    const record = await prisma.bnbOtaCommission.findUnique({ where: { id } });
    if (!record) return createErrorResponse('NOT_FOUND', '找不到該筆傭金記錄', 404);
    if (record.status === '已付款') {
      return createErrorResponse('FORBIDDEN', '已付款的傭金無法修改', 400);
    }
    if (record.status === '已取消') {
      return createErrorResponse('FORBIDDEN', '已取消的傭金無法修改', 400);
    }

    // ── 確認送出出納 ─────────────────────────────────────────
    if (body.action === 'confirm') {
      if (record.status !== '草稿') {
        return createErrorResponse('VALIDATION_FAILED', '只有草稿狀態的傭金可以確認送出', 400);
      }

      await assertBnbMonthOpen(record.commissionMonth, record.warehouse);

      const userName = auth.session?.user?.name || auth.session?.user?.email || 'system';
      const supplier = await findOrCreateSupplier(record.otaSource);

      const result = await prisma.$transaction(async (tx) => {
        const orderNo = await generatePaymentOrderNo(tx);
        const po = await tx.paymentOrder.create({
          data: {
            orderNo,
            invoiceIds:    [],
            supplierId:    supplier?.id   || null,
            supplierName:  supplier?.name || record.otaSource,
            warehouse:     record.warehouse,
            paymentMethod: record.paymentMethod,
            amount:        Number(record.commissionAmount),
            discount:      0,
            netAmount:     Number(record.commissionAmount),
            summary:       `${record.otaSource} 傭金 — ${record.warehouse} ${record.commissionMonth}`,
            note:          record.note || null,
            status:        '待出納',
            createdBy:     userName,
            sourceType:    'bnb_ota_commission',
            sourceRecordId: null,  // 先建後回填
          },
        });

        const updated = await tx.bnbOtaCommission.update({
          where: { id },
          data: {
            status:        '待出納',
            paymentOrderId: po.id,
            supplierId:    supplier?.id   || null,
            supplierName:  supplier?.name || record.otaSource,
            confirmedBy:   userName,
            confirmedAt:   new Date(),
          },
        });

        // 回填 sourceRecordId
        await tx.paymentOrder.update({
          where: { id: po.id },
          data:  { sourceRecordId: updated.id },
        });

        return { orderNo: po.orderNo, orderId: po.id };
      });

      return NextResponse.json({ ok: true, orderNo: result.orderNo, orderId: result.orderId });
    }

    // ── 編輯金額/備註 ────────────────────────────────────────
    const { commissionAmount, paymentMethod, note } = body;
    const amt = commissionAmount !== undefined ? Number(commissionAmount) : undefined;
    if (amt !== undefined && (isNaN(amt) || amt <= 0)) {
      return createErrorResponse('INVALID_PARAMETER', '傭金金額無效', 400);
    }

    const updateData = {};
    if (amt !== undefined) updateData.commissionAmount = amt;
    if (paymentMethod !== undefined) updateData.paymentMethod = paymentMethod;
    if (note !== undefined) updateData.note = note || null;

    // 若有關聯 PaymentOrder（待出納狀態），同步更新金額
    if (amt !== undefined && record.paymentOrderId) {
      await prisma.paymentOrder.update({
        where: { id: record.paymentOrderId },
        data: { amount: amt, netAmount: amt },
      });
    }

    const updated = await prisma.bnbOtaCommission.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ ok: true, record: { ...updated, commissionAmount: Number(updated.commissionAmount) } });
  } catch (error) {
    return handleApiError(error);
  }
}

// ── DELETE (取消傭金) ─────────────────────────────────────────────
export async function DELETE(request) {
  const auth = await requireAnyPermission([PERMISSIONS.BNB_EDIT]);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const id = parseInt(searchParams.get('id'));
    if (!id) return createErrorResponse('REQUIRED_FIELD_MISSING', '缺少 id', 400);

    const record = await prisma.bnbOtaCommission.findUnique({ where: { id } });
    if (!record) return createErrorResponse('NOT_FOUND', '找不到該筆傭金記錄', 404);
    await assertBnbMonthOpen(record.commissionMonth, record.warehouse);
    if (record.status === '已付款') {
      return createErrorResponse('FORBIDDEN', '已付款的傭金無法取消', 400);
    }

    // 將 PaymentOrder 也取消（若存在且尚未執行）
    if (record.paymentOrderId) {
      const po = await prisma.paymentOrder.findUnique({
        where: { id: record.paymentOrderId },
        select: { status: true },
      });
      if (po && po.status === '待出納') {
        await prisma.paymentOrder.update({
          where: { id: record.paymentOrderId },
          data:  { status: '已取消' },
        });
      }
    }

    await prisma.bnbOtaCommission.update({
      where: { id },
      data:  { status: '已取消' },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
