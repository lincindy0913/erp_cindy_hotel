import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { applyWarehouseFilter, assertWarehouseAccess } from '@/lib/warehouse-access';
import { validateWarehouse } from '@/lib/master-data-validator';
import { auditFromSession, AUDIT_ACTIONS } from '@/lib/audit';
import { assertPeriodOpen } from '@/lib/period-lock';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.PURCHASING_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const keyword = searchParams.get('keyword');
    const page = parseInt(searchParams.get('page')) || 0;  // 0 = 不分頁
    const limit = Math.min(parseInt(searchParams.get('limit')) || 50, 200);
    const all = searchParams.get('all') === 'true';
    const supplierId = searchParams.get('supplierId');
    const status = searchParams.get('status');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');

    const where = {};
    if (supplierId) where.supplierId = parseInt(supplierId);
    if (status) where.status = status;
    if (dateFrom || dateTo) {
      where.purchaseDate = {};
      if (dateFrom) where.purchaseDate.gte = dateFrom;
      if (dateTo) where.purchaseDate.lte = dateTo;
    }
    if (keyword) {
      where.OR = [
        { purchaseNo: { contains: keyword, mode: 'insensitive' } },
        { warehouse: { contains: keyword, mode: 'insensitive' } },
      ];
    }

    // Warehouse-level access control
    const wf = applyWarehouseFilter(auth.session, where);
    if (!wf.ok) return wf.response;

    const formatPurchase = (p) => ({
      id: p.id,
      purchaseNo: p.purchaseNo,
      warehouse: p.warehouse,
      department: p.department,
      supplierId: p.supplierId,
      supplierName: p.supplier?.name || '',
      purchaseDate: p.purchaseDate,
      paymentTerms: p.paymentTerms,
      taxType: p.taxType,
      amount: Number(p.amount),
      tax: Number(p.tax),
      totalAmount: Number(p.totalAmount),
      status: p.status,
      items: p.details.map(d => ({
        detailId: d.id,
        productId: d.productId,
        quantity: d.quantity,
        unitPrice: Number(d.unitPrice),
        note: d.note || '',
        status: d.status,
        inventoryWarehouse: d.inventoryWarehouse || ''
      })),
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString()
    });

    const includeOpts = { details: true, supplier: { select: { name: true } } };
    const orderByOpts = { id: 'desc' };

    // 不分頁模式（向下相容），上限 5000 筆
    if (all || page === 0) {
      const purchases = await prisma.purchaseMaster.findMany({
        where, include: includeOpts, orderBy: orderByOpts, take: 5000,
      });
      return NextResponse.json(purchases.map(formatPurchase));
    }

    // 分頁模式
    const skip = (page - 1) * limit;
    const [purchases, totalCount] = await Promise.all([
      prisma.purchaseMaster.findMany({
        where, include: includeOpts, orderBy: orderByOpts, skip, take: limit,
      }),
      prisma.purchaseMaster.count({ where }),
    ]);

    return NextResponse.json({
      data: purchases.map(formatPurchase),
      pagination: { page, limit, totalCount, totalPages: Math.ceil(totalCount / limit) }
    });
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

    // Validate warehouse against master data
    const whErr = await validateWarehouse(data.warehouse);
    if (whErr) return createErrorResponse('VALIDATION_FAILED', whErr, 400);

    const newPurchase = await prisma.$transaction(async (tx) => {
      await assertPeriodOpen(tx, data.purchaseDate, data.warehouse);

      const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
      const todayPrefix = `PUR-${today}-`;
      const existingCount = await tx.purchaseMaster.count({
        where: { purchaseNo: { startsWith: todayPrefix } }
      });
      const purchaseNo = `${todayPrefix}${String(existingCount + 1).padStart(4, '0')}`;

      const created = await tx.purchaseMaster.create({
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

      // 記錄價格歷史（批次寫入，避免 N+1）
      const priceItems = (data.items || [])
        .filter(item => item.productId && item.unitPrice)
        .map(item => ({
          supplierId: parseInt(data.supplierId),
          productId: parseInt(item.productId),
          purchaseDate: data.purchaseDate,
          unitPrice: parseFloat(item.unitPrice),
        }));
      if (priceItems.length > 0) {
        await tx.priceHistory.createMany({ data: priceItems });
      }

      return created;
    });

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

    await auditFromSession(prisma, auth.session, {
      action: AUDIT_ACTIONS.PURCHASE_CREATE,
      targetModule: 'purchasing',
      targetRecordNo: result.purchaseNo,
      afterState: { purchaseNo: result.purchaseNo, warehouse: result.warehouse, supplierId: result.supplierId, amount: result.amount },
      note: `建立進貨單 ${result.purchaseNo}`,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
