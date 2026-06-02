import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError, createErrorResponse } from '@/lib/error-handler';
import { requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { validateInvoiceBody, validateExpenseBody } from '@/lib/validators/company-expense';

export async function GET(req) {
  const auth = await requireAnyPermission([PERMISSIONS.ENGINEERING_VIEW, PERMISSIONS.PURCHASING_VIEW]);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const period = searchParams.get('period');
  const type = searchParams.get('type'); // 'expense' | 'invoice'
  const projectIdParam = searchParams.get('projectId');

  try {
    if (type === 'invoice') {
      const where = {};
      if (period) where.period = period;
      if (projectIdParam === 'null') where.projectId = null;
      else if (projectIdParam) where.projectId = parseInt(projectIdParam);
      const rows = await prisma.companyInputInvoice.findMany({
        where,
        include: {
          project:  { select: { id: true, code: true, name: true } },
          supplier: { select: { id: true, name: true, taxId: true } },
        },
        orderBy: [{ period: 'asc' }, { invoiceDate: 'asc' }, { id: 'asc' }],
      });
      return NextResponse.json(rows);
    }

    const where = period ? { period } : {};
    const rows = await prisma.companyExpense.findMany({
      where,
      include: { supplier: { select: { id: true, name: true, taxId: true } } },
      orderBy: [{ expenseDate: 'desc' }, { id: 'desc' }],
    });
    return NextResponse.json(rows);
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req) {
  const auth = await requireAnyPermission([PERMISSIONS.ENGINEERING_CREATE, PERMISSIONS.ENGINEERING_EDIT, PERMISSIONS.PURCHASING_CREATE]);
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const type = body.type; // 'expense' | 'invoice'

  try {
    if (type === 'invoice') {
      const err = validateInvoiceBody(body);
      if (err) return createErrorResponse('VALIDATION_FAILED', err, 400);

      const row = await prisma.companyInputInvoice.create({
        data: {
          invoiceDate:  body.invoiceDate,
          invoiceNo:    body.invoiceNo    || null,
          vendorTaxId:  body.vendorTaxId  || null,
          vendorName:   body.vendorName   || null,
          supplierId:   body.supplierId   ? Number(body.supplierId) : null,
          materialType: body.materialType || null,
          itemName:     body.itemName     || null,
          amount:       Number(body.amount      || 0),
          taxAmount:    Number(body.taxAmount   || 0),
          totalAmount:  Number(body.totalAmount || 0),
          projectId:    body.projectId ? Number(body.projectId) : null,
          location:     body.location    || null,
          period:       body.period      || null,
          note:         body.note        || null,
        },
        include: {
          project:  { select: { id: true, code: true, name: true } },
          supplier: { select: { id: true, name: true, taxId: true } },
        },
      });
      return NextResponse.json(row, { status: 201 });
    }

    const expErr = validateExpenseBody(body);
    if (expErr) return createErrorResponse('VALIDATION_FAILED', expErr, 400);

    const row = await prisma.companyExpense.create({
      data: {
        expenseDate: body.expenseDate,
        invoiceNo:   body.invoiceNo   || null,
        invoiceType: body.invoiceType || null,
        vendorTaxId: body.vendorTaxId || null,
        vendorName:  body.vendorName  || null,
        supplierId:  body.supplierId  ? Number(body.supplierId) : null,
        itemName:    body.itemName    || null,
        amount:      Number(body.amount      || 0),
        taxAmount:   Number(body.taxAmount   || 0),
        otherAmount: Number(body.otherAmount || 0),
        totalAmount: Number(body.totalAmount || 0),
        period:      body.period      || null,
        note:        body.note        || null,
      },
      include: { supplier: { select: { id: true, name: true, taxId: true } } },
    });
    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}
