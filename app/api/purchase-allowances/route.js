import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { applyWarehouseFilter, assertWarehouseAccess } from '@/lib/warehouse-access';
import { validateWarehouse, validateSupplier } from '@/lib/master-data-validator';

export const dynamic = 'force-dynamic';

// GET: 折讓單列表
export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.PURCHASING_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const warehouse = searchParams.get('warehouse');
    const supplierId = searchParams.get('supplierId');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const keyword = searchParams.get('keyword');

    const where = {};
    if (status) where.status = status;
    if (warehouse) where.warehouse = warehouse;
    if (supplierId) where.supplierId = parseInt(supplierId);
    if (dateFrom || dateTo) {
      where.allowanceDate = {};
      if (dateFrom) where.allowanceDate.gte = dateFrom;
      if (dateTo) where.allowanceDate.lte = dateTo;
    }
    if (keyword) {
      where.OR = [
        { allowanceNo: { contains: keyword, mode: 'insensitive' } },
        { supplierName: { contains: keyword, mode: 'insensitive' } },
        { invoiceNo: { contains: keyword, mode: 'insensitive' } },
        { purchaseNo: { contains: keyword, mode: 'insensitive' } },
        { reason: { contains: keyword, mode: 'insensitive' } },
      ];
    }

    // Warehouse-level access control
    const wf = applyWarehouseFilter(auth.session, where);
    if (!wf.ok) return wf.response;

    const records = await prisma.purchaseAllowance.findMany({
      where,
      include: { details: true },
      orderBy: { createdAt: 'desc' },
    });

    const result = records.map(r => ({
      ...r,
      amount: Number(r.amount),
      tax: Number(r.tax),
      totalAmount: Number(r.totalAmount),
      details: r.details.map(d => ({
        ...d,
        quantity: Number(d.quantity),
        unitPrice: Number(d.unitPrice),
        subtotal: Number(d.subtotal),
      })),
    }));

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

// POST: 新增折讓單
export async function POST(request) {
  const authPost = await requirePermission(PERMISSIONS.PURCHASING_CREATE);
  if (!authPost.ok) return authPost.response;

  try {
    const data = await request.json();

    if (!data.allowanceDate) return createErrorResponse('REQUIRED_FIELD_MISSING', '請選擇折讓日期', 400);
    if (!data.totalAmount || parseFloat(data.totalAmount) <= 0) return createErrorResponse('VALIDATION_FAILED', '折讓金額必須大於 0', 400);

    const whErr = await validateWarehouse(data.warehouse);
    if (whErr) return createErrorResponse('VALIDATION_FAILED', whErr, 400);
    const supErr = await validateSupplier(data.supplierName);
    if (supErr) return createErrorResponse('VALIDATION_FAILED', supErr, 400);

    // Generate allowanceNo: PA-YYYYMMDD-XXXX
    const dateStr = data.allowanceDate.replace(/-/g, '');
    const prefix = `PA-${dateStr}-`;
    const last = await prisma.purchaseAllowance.findFirst({
      where: { allowanceNo: { startsWith: prefix } },
      orderBy: { allowanceNo: 'desc' },
    });
    let seq = 1;
    if (last) {
      const lastSeq = parseInt(last.allowanceNo.split('-').pop());
      seq = lastSeq + 1;
    }
    const allowanceNo = `${prefix}${String(seq).padStart(4, '0')}`;

    const record = await prisma.$transaction(async (tx) => {
      const allowance = await tx.purchaseAllowance.create({
        data: {
          allowanceNo,
          allowanceType: data.allowanceType === '全額退貨' ? '全額退貨' : '折讓',
          allowanceDate: data.allowanceDate,
          supplierId: data.supplierId ? parseInt(data.supplierId) : null,
          supplierName: data.supplierName?.trim() || null,
          warehouse: data.warehouse?.trim() || null,
          purchaseId: data.purchaseId ? parseInt(data.purchaseId) : null,
          purchaseNo: data.purchaseNo?.trim() || null,
          invoiceId: data.invoiceId ? parseInt(data.invoiceId) : null,
          invoiceNo: data.invoiceNo?.trim() || null,
          paymentOrderId: data.paymentOrderId ? parseInt(data.paymentOrderId) : null,
          paymentOrderNo: data.paymentOrderNo?.trim() || null,
          creditNoteNo: data.creditNoteNo?.trim() || null,
          amount: parseFloat(data.amount || data.totalAmount),
          tax: parseFloat(data.tax || 0),
          totalAmount: parseFloat(data.totalAmount),
          reason: data.reason?.trim() || null,
          note: data.note?.trim() || null,
          createdBy: data.createdBy?.trim() || null,
          details: data.details?.length > 0 ? {
            create: data.details.map(d => ({
              productName: d.productName?.trim() || null,
              quantity: parseFloat(d.quantity || 0),
              unitPrice: parseFloat(d.unitPrice || 0),
              subtotal: parseFloat(d.subtotal || 0),
              reason: d.reason?.trim() || null,
            })),
          } : undefined,
        },
        include: { details: true },
      });
      return allowance;
    });

    return NextResponse.json({
      ...record,
      amount: Number(record.amount),
      tax: Number(record.tax),
      totalAmount: Number(record.totalAmount),
    }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
