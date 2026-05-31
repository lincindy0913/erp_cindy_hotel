import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { localDateStr } from '@/lib/localDate';
import { nextSequence } from '@/lib/sequence-generator';

export const dynamic = 'force-dynamic';

/**
 * POST — atomically creates one engineering payment order + N material requisition records.
 * All writes succeed or all roll back.
 *
 * Body: {
 *   paymentMethod, netAmount, supplierId?, supplierName?, warehouse?,
 *   dueDate?, accountId?, summary?, note?, sourceRecordId?,
 *   materials: [{ projectId, contractId?, termId?, description, quantity, unit?, unitPrice, note? }]
 * }
 */
export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.ENGINEERING_CREATE);
  if (!auth.ok) return auth.response;

  try {
    const session = auth.session;
    const body = await request.json();

    const {
      paymentMethod,
      netAmount,
      supplierId,
      supplierName,
      warehouse,
      dueDate,
      accountId,
      summary,
      note,
      sourceRecordId,
      materials = [],
    } = body;

    if (!paymentMethod) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請填寫付款方式', 400);
    }
    const parsedNet = parseFloat(netAmount);
    if (!parsedNet || parsedNet <= 0) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請填寫應付金額', 400);
    }

    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      // Generate PAY-YYYYMMDD-XXXX order number（SELECT FOR UPDATE 防競態）
      const dateStr = localDateStr(now).replace(/-/g, '');
      const prefix = `PAY-${dateStr}-`;
      const orderNo = await nextSequence(tx, 'paymentOrder', 'orderNo', prefix);

      const order = await tx.paymentOrder.create({
        data: {
          orderNo,
          invoiceIds: [],
          supplierId: supplierId ? parseInt(supplierId) : null,
          supplierName: supplierName || null,
          warehouse: warehouse || null,
          paymentMethod,
          amount: parsedNet,
          discount: 0,
          netAmount: parsedNet,
          dueDate: dueDate || null,
          accountId: accountId ? parseInt(accountId) : null,
          summary: summary || null,
          note: note || null,
          status: '待出納',
          sourceType: 'engineering',
          sourceRecordId: sourceRecordId ? parseInt(sourceRecordId) : null,
          createdBy: session?.user?.email || null,
        },
      });

      const materialIds = [];

      for (const mat of materials) {
        const matProjectId = mat.projectId ? parseInt(mat.projectId) : null;
        const matQty = parseFloat(mat.quantity) || 0;
        if (!matProjectId || matQty <= 0) continue;

        const proj = await tx.engineeringProject.findUnique({
          where: { id: matProjectId },
          select: { warehouse: true, departmentRef: { select: { name: true } } },
        });

        const created = await tx.engineeringMaterial.create({
          data: {
            projectId: matProjectId,
            productId: mat.productId ? parseInt(mat.productId) : null,
            contractId: mat.contractId ? parseInt(mat.contractId) : null,
            termId: mat.termId ? parseInt(mat.termId) : null,
            description: mat.description?.trim() || null,
            quantity: matQty,
            unit: mat.unit?.trim() || null,
            unitPrice: parseFloat(mat.unitPrice) || 0,
            usedAt: localDateStr(now),
            note: mat.note?.trim() || `付款單 ${orderNo} 領用`,
          },
        });
        materialIds.push(created.id);

        // Auto-create inventory requisition for in-stock products
        if (mat.productId && (proj?.warehouse || warehouse)) {
          const productId = parseInt(mat.productId);
          const prod = await tx.product.findUnique({
            where: { id: productId },
            select: { isInStock: true },
          });
          if (prod?.isInStock) {
            const qty = Math.round(matQty);
            if (qty >= 1) {
              const wh = proj?.warehouse || warehouse;
              const date = localDateStr(now);
              const reqPrefix = `REQ-${date.replace(/-/g, '')}-`;
              const requisitionNo = await nextSequence(tx, 'inventoryRequisition', 'requisitionNo', reqPrefix);
              await tx.inventoryRequisition.create({
                data: {
                  requisitionNo,
                  warehouse: wh,
                  department: proj?.departmentRef?.name || null,
                  productId,
                  quantity: qty,
                  requisitionDate: date,
                  status: '已領用',
                  note: `工程材料領用（工程案 ID: ${matProjectId}）`,
                  sourceType: 'engineering_material',
                  sourceRecordId: created.id,
                },
              });
            }
          }
        }
      }

      return { order, materialIds, orderNo };
    });

    return NextResponse.json(
      {
        ...result.order,
        amount: Number(result.order.amount),
        netAmount: Number(result.order.netAmount),
        orderNo: result.orderNo,
        materialIds: result.materialIds,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('POST /api/engineering/payment-orders-with-materials error:', error.message || error);
    return handleApiError(error);
  }
}
