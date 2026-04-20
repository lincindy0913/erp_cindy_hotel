import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

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
      // Generate PAY-YYYYMMDD-XXXX order number
      const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
      const prefix = `PAY-${dateStr}-`;
      const existing = await tx.paymentOrder.findMany({
        where: { orderNo: { startsWith: prefix } },
        select: { orderNo: true },
      });
      let maxSeq = 0;
      for (const item of existing) {
        const seq = parseInt(item.orderNo.substring(prefix.length)) || 0;
        if (seq > maxSeq) maxSeq = seq;
      }
      const orderNo = `${prefix}${String(maxSeq + 1).padStart(4, '0')}`;

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
            usedAt: now.toISOString().slice(0, 10),
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
              const date = now.toISOString().slice(0, 10);
              const reqPrefix = `REQ-${date.replace(/-/g, '')}`;
              const lastReq = await tx.inventoryRequisition.findFirst({
                where: { requisitionNo: { startsWith: reqPrefix } },
                orderBy: { requisitionNo: 'desc' },
              });
              const seq = lastReq ? parseInt(lastReq.requisitionNo.slice(-4), 10) + 1 : 1;
              const requisitionNo = `${reqPrefix}-${String(seq).padStart(4, '0')}`;
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
