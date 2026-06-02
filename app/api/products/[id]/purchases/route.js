import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export async function GET(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.PURCHASING_VIEW);
  if (!auth.ok) return auth.response;
  
  try {
    const productId = parseInt((await params).id);

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      return createErrorResponse('NOT_FOUND', '產品不存在', 404);
    }

    const { searchParams } = new URL(request.url);
    const page  = Math.max(parseInt(searchParams.get('page')  || '1'), 1);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);
    const skip  = (page - 1) * limit;

    // 查找包含此產品的進貨明細，並 join 進貨主檔和廠商
    const [details, totalCount] = await Promise.all([
      prisma.purchaseDetail.findMany({
        where: { productId },
        include: {
          purchaseMaster: {
            include: { supplier: { select: { id: true, name: true } } },
          },
        },
        orderBy: { purchaseMaster: { purchaseDate: 'desc' } },
        skip,
        take: limit,
      }),
      prisma.purchaseDetail.count({ where: { productId } }),
    ]);

    const purchaseRecords = details.map(detail => ({
      purchaseId:   detail.purchaseMaster.id,
      purchaseNo:   detail.purchaseMaster.purchaseNo,
      warehouse:    detail.purchaseMaster.warehouse    || '',
      department:   detail.purchaseMaster.department   || '',
      supplierId:   detail.purchaseMaster.supplierId,
      supplierName: detail.purchaseMaster.supplier?.name || '未知廠商',
      purchaseDate: detail.purchaseMaster.purchaseDate,
      paymentTerms: detail.purchaseMaster.paymentTerms || '',
      status:       detail.purchaseMaster.status,
      quantity:     detail.quantity,
      unitPrice:    Number(detail.unitPrice),
      subtotal:     detail.quantity * Number(detail.unitPrice),
      note:         detail.note || '',
    }));

    return NextResponse.json({
      product,
      purchases: purchaseRecords,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
