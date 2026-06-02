import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { auditFromSession, AUDIT_ACTIONS } from '@/lib/audit';
import { getSystemQty } from '@/lib/inventory-helpers';

export async function GET(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.PURCHASING_VIEW);
  if (!auth.ok) return auth.response;
  
  try {
    const id = parseInt((await params).id);
    const product = await prisma.product.findUnique({ where: { id } });

    if (!product) {
      return createErrorResponse('NOT_FOUND', '產品不存在', 404);
    }
    return NextResponse.json(product);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.PURCHASING_EDIT);
  if (!auth.ok) return auth.response;
  
  try {
    const id = parseInt((await params).id);
    const data = await request.json();

    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) {
      return createErrorResponse('NOT_FOUND', '產品不存在', 404);
    }

    const isInStock = data.isInStock === true || data.isInStock === 'true' || data.isInStock === '是';

    if (isInStock && !data.warehouseLocation) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '列入庫存時必須填寫倉庫位置', 400);
    }

    // 從「列入庫存」切換為「不列入」時，必須確認現存量已歸零
    if (existing.isInStock && !isInStock) {
      const currentQty = await getSystemQty(prisma, id, null);
      if (currentQty !== 0) {
        return createErrorResponse(
          'PRODUCT_HAS_STOCK',
          `此產品目前庫存尚有 ${currentQty} 件，請先清空庫存再停用`,
          400
        );
      }
    }

    if (data.code !== undefined && data.code !== existing.code) {
      const conflict = await prisma.product.findFirst({ where: { code: data.code, id: { not: id } } });
      if (conflict) return createErrorResponse('CONFLICT_UNIQUE', `產品代碼「${data.code}」已存在`, 409);
    }

    const updated = await prisma.product.update({
      where: { id },
      data: {
        code: data.code ?? existing.code,
        name: data.name ?? existing.name,
        category: data.category ?? existing.category,
        unit: data.unit ?? existing.unit,
        costPrice: data.costPrice !== undefined ? parseFloat(data.costPrice) : existing.costPrice,
        salesPrice: data.salesPrice !== undefined ? parseFloat(data.salesPrice) : existing.salesPrice,
        isInStock,
        warehouseLocation: isInStock ? (data.warehouseLocation || null) : null,
        accountingSubject: data.accountingSubject ?? existing.accountingSubject,
        inventorySubject: data.inventorySubject !== undefined ? (data.inventorySubject || null) : existing.inventorySubject,
        supplierId: data.supplierId ? parseInt(data.supplierId) : null
      }
    });

    await auditFromSession(prisma, auth.session, {
      action: AUDIT_ACTIONS.PRODUCT_UPDATE,
      targetModule: 'products',
      targetRecordId: id,
      beforeState: { name: existing.name, code: existing.code, category: existing.category },
      afterState: { name: updated.name, code: updated.code, category: updated.category },
    });

    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.PURCHASING_EDIT);
  if (!auth.ok) return auth.response;
  
  try {
    const id = parseInt((await params).id);

    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) {
      return createErrorResponse('NOT_FOUND', '產品不存在', 404);
    }

    const [purchaseCnt, requisitionCnt, transferCnt, stockCountCnt, engMaterialCnt] = await Promise.all([
      prisma.purchaseDetail.count({ where: { productId: id } }),
      prisma.inventoryRequisition.count({ where: { productId: id } }),
      prisma.inventoryTransferItem.count({ where: { productId: id } }),
      prisma.stockCountItem.count({ where: { productId: id } }),
      prisma.engineeringMaterial.count({ where: { productId: id } }).catch(() => 0),
    ]);
    const total = purchaseCnt + requisitionCnt + transferCnt + stockCountCnt + engMaterialCnt;
    if (total > 0) {
      return createErrorResponse('PRODUCT_HAS_DEPENDENCIES', `產品已被使用（${total} 筆紀錄），請改用停用功能`, 400);
    }

    await prisma.product.delete({ where: { id } });
    return NextResponse.json({ message: '產品已刪除' });
  } catch (error) {
    return handleApiError(error);
  }
}
