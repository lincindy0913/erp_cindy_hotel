import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(request, { params }) {
  try {
    const productId = parseInt(params.id);

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      return NextResponse.json({ error: '產品不存在' }, { status: 404 });
    }

    // 查找包含此產品的進貨明細，並 join 進貨主檔和廠商
    const details = await prisma.purchaseDetail.findMany({
      where: { productId },
      include: {
        purchaseMaster: {
          include: {
            supplier: { select: { name: true } }
          }
        }
      },
      orderBy: {
        purchaseMaster: { purchaseDate: 'desc' }
      }
    });

    const purchaseRecords = details.map(detail => ({
      purchaseId: detail.purchaseMaster.id,
      purchaseNo: detail.purchaseMaster.purchaseNo,
      warehouse: detail.purchaseMaster.warehouse || '',
      department: detail.purchaseMaster.department || '',
      supplierName: detail.purchaseMaster.supplier?.name || '未知廠商',
      purchaseDate: detail.purchaseMaster.purchaseDate,
      paymentTerms: detail.purchaseMaster.paymentTerms || '',
      status: detail.purchaseMaster.status,
      quantity: detail.quantity,
      unitPrice: Number(detail.unitPrice),
      subtotal: detail.quantity * Number(detail.unitPrice),
      note: detail.note || ''
    }));

    return NextResponse.json({
      product,
      purchases: purchaseRecords
    });
  } catch (error) {
    console.error('查詢產品採購記錄錯誤:', error);
    return NextResponse.json({ error: '查詢失敗' }, { status: 500 });
  }
}
