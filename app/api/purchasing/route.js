import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.PURCHASING_VIEW);
  if (!auth.ok) return auth.response;
  
  try {
    const purchases = await prisma.purchaseMaster.findMany({
      include: {
        details: true
      },
      orderBy: { id: 'asc' }
    });

    const result = purchases.map(p => ({
      id: p.id,
      purchaseNo: p.purchaseNo,
      warehouse: p.warehouse,
      department: p.department,
      supplierId: p.supplierId,
      purchaseDate: p.purchaseDate,
      paymentTerms: p.paymentTerms,
      taxType: p.taxType,
      amount: Number(p.amount),
      tax: Number(p.tax),
      totalAmount: Number(p.totalAmount),
      status: p.status,
      items: p.details.map(d => ({
        productId: d.productId,
        quantity: d.quantity,
        unitPrice: Number(d.unitPrice),
        note: d.note || '',
        status: d.status,
        inventoryWarehouse: d.inventoryWarehouse || ''
      })),
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString()
    }));

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.PURCHASING_CREATE);
  if (!auth.ok) return auth.response;
  
  try {
    const data = await request.json();

    if (!data.supplierId || !data.items || data.items.length === 0) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '缺少必填欄位', 400);
    }

    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const todayPrefix = `PUR-${today}-`;
    const existingCount = await prisma.purchaseMaster.count({
      where: { purchaseNo: { startsWith: todayPrefix } }
    });
    const purchaseNo = `${todayPrefix}${String(existingCount + 1).padStart(4, '0')}`;

    const newPurchase = await prisma.purchaseMaster.create({
      data: {
        purchaseNo,
        warehouse: data.warehouse || '',
        department: data.department || '',
        supplierId: parseInt(data.supplierId),
        purchaseDate: data.purchaseDate,
        paymentTerms: data.paymentTerms || '月結',
        taxType: data.taxType || null,
        amount: parseFloat(data.amount || 0),
        tax: 0,
        totalAmount: data.totalAmount ? parseFloat(data.totalAmount) : parseFloat(data.amount || 0),
        status: data.status || '待入庫',
        details: {
          create: (data.items || []).map(item => ({
            productId: parseInt(item.productId),
            quantity: parseInt(item.quantity),
            unitPrice: parseFloat(item.unitPrice),
            note: item.note || '',
            status: item.status || '待入庫',
            inventoryWarehouse: item.inventoryWarehouse || null
          }))
        }
      },
      include: { details: true }
    });

    // 記錄價格歷史
    for (const item of (data.items || [])) {
      if (item.productId && item.unitPrice) {
        await prisma.priceHistory.create({
          data: {
            supplierId: parseInt(data.supplierId),
            productId: parseInt(item.productId),
            purchaseDate: data.purchaseDate,
            unitPrice: parseFloat(item.unitPrice)
          }
        });
      }
    }

    const result = {
      id: newPurchase.id,
      purchaseNo: newPurchase.purchaseNo,
      warehouse: newPurchase.warehouse,
      department: newPurchase.department,
      supplierId: newPurchase.supplierId,
      purchaseDate: newPurchase.purchaseDate,
      paymentTerms: newPurchase.paymentTerms,
      taxType: newPurchase.taxType,
      amount: Number(newPurchase.amount),
      tax: Number(newPurchase.tax),
      totalAmount: Number(newPurchase.totalAmount),
      status: newPurchase.status,
      items: newPurchase.details.map(d => ({
        productId: d.productId,
        quantity: d.quantity,
        unitPrice: Number(d.unitPrice),
        note: d.note || '',
        status: d.status,
        inventoryWarehouse: d.inventoryWarehouse || ''
      })),
      createdAt: newPurchase.createdAt.toISOString(),
      updatedAt: newPurchase.updatedAt.toISOString()
    };

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
