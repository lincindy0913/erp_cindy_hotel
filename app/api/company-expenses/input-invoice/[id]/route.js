import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError, createErrorResponse } from '@/lib/error-handler';
import { requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { validateInvoiceBody, validatePatchInvoiceBody } from '@/lib/validators/company-expense';

export async function PUT(req, { params }) {
  const auth = await requireAnyPermission([PERMISSIONS.ENGINEERING_EDIT]);
  if (!auth.ok) return auth.response;

  const id = Number((await params).id);
  const body = await req.json();

  const err = validateInvoiceBody(body);
  if (err) return createErrorResponse('VALIDATION_FAILED', err, 400);

  try {
    const row = await prisma.companyInputInvoice.update({
      where: { id },
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
        location:     body.location     || null,
        period:       body.period       || null,
        note:         body.note         || null,
      },
      include: {
        project:  { select: { id: true, code: true, name: true } },
        supplier: { select: { id: true, name: true, taxId: true } },
      },
    });
    return NextResponse.json(row);
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PATCH(req, { params }) {
  const auth = await requireAnyPermission([PERMISSIONS.ENGINEERING_EDIT]);
  if (!auth.ok) return auth.response;

  const id = Number((await params).id);
  const body = await req.json();

  const err = validatePatchInvoiceBody(body);
  if (err) return createErrorResponse('VALIDATION_FAILED', err, 400);

  try {
    const data = {};
    if ('projectId'    in body) data.projectId    = body.projectId    ? Number(body.projectId) : null;
    if ('supplierId'   in body) data.supplierId   = body.supplierId   ? Number(body.supplierId) : null;
    if ('invoiceDate'  in body) data.invoiceDate  = body.invoiceDate;
    if ('invoiceNo'    in body) data.invoiceNo    = body.invoiceNo    || null;
    if ('vendorTaxId'  in body) data.vendorTaxId  = body.vendorTaxId  || null;
    if ('vendorName'   in body) data.vendorName   = body.vendorName   || null;
    if ('materialType' in body) data.materialType = body.materialType || null;
    if ('itemName'     in body) data.itemName     = body.itemName     || null;
    if ('amount'       in body) data.amount       = Number(body.amount      || 0);
    if ('taxAmount'    in body) data.taxAmount    = Number(body.taxAmount   || 0);
    if ('totalAmount'  in body) data.totalAmount  = Number(body.totalAmount || 0);
    if ('location'     in body) data.location     = body.location     || null;
    if ('period'       in body) data.period       = body.period       || null;
    if ('note'         in body) data.note         = body.note         || null;

    if (Object.keys(data).length === 0) {
      return createErrorResponse('VALIDATION_FAILED', '未提供任何更新欄位', 400);
    }

    const row = await prisma.companyInputInvoice.update({
      where: { id },
      data,
      include: {
        project:  { select: { id: true, code: true, name: true } },
        supplier: { select: { id: true, name: true, taxId: true } },
      },
    });
    return NextResponse.json(row);
  } catch (e) {
    return handleApiError(e);
  }
}

export async function DELETE(req, { params }) {
  const auth = await requireAnyPermission([PERMISSIONS.ENGINEERING_EDIT]);
  if (!auth.ok) return auth.response;

  const id = Number((await params).id);
  try {
    await prisma.companyInputInvoice.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
