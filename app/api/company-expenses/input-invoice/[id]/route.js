import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError, createErrorResponse } from '@/lib/error-handler';
import { requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { validateInvoiceBody } from '@/lib/validators/company-expense';

export async function PUT(req, { params }) {
  const auth = await requireAnyPermission([PERMISSIONS.ENGINEERING_EDIT]);
  if (!auth.ok) return auth.response;

  const id = Number(params.id);
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
      include: { project: { select: { id: true, code: true, name: true } } },
    });
    return NextResponse.json(row);
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PATCH(req, { params }) {
  const auth = await requireAnyPermission([PERMISSIONS.ENGINEERING_EDIT]);
  if (!auth.ok) return auth.response;

  const id = Number(params.id);
  const body = await req.json();

  try {
    const data = {};
    if ('projectId' in body) data.projectId = body.projectId ? Number(body.projectId) : null;

    const row = await prisma.companyInputInvoice.update({
      where: { id },
      data,
      include: { project: { select: { id: true, code: true, name: true } } },
    });
    return NextResponse.json(row);
  } catch (e) {
    return handleApiError(e);
  }
}

export async function DELETE(req, { params }) {
  const auth = await requireAnyPermission([PERMISSIONS.ENGINEERING_EDIT]);
  if (!auth.ok) return auth.response;

  const id = Number(params.id);
  try {
    await prisma.companyInputInvoice.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
