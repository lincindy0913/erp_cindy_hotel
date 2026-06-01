import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError, createErrorResponse } from '@/lib/error-handler';
import { requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { validateExpenseBody } from '@/lib/validators/company-expense';

export async function PUT(req, { params }) {
  const auth = await requireAnyPermission([PERMISSIONS.ENGINEERING_EDIT, PERMISSIONS.PURCHASING_EDIT]);
  if (!auth.ok) return auth.response;

  const id = Number((await params).id);
  const body = await req.json();

  const err = validateExpenseBody(body);
  if (err) return createErrorResponse('VALIDATION_FAILED', err, 400);

  try {
    const row = await prisma.companyExpense.update({
      where: { id },
      data: {
        expenseDate: body.expenseDate,
        invoiceNo:   body.invoiceNo   || null,
        invoiceType: body.invoiceType || null,
        vendorTaxId: body.vendorTaxId || null,
        vendorName:  body.vendorName  || null,
        itemName:    body.itemName    || null,
        amount:      Number(body.amount      || 0),
        taxAmount:   Number(body.taxAmount   || 0),
        otherAmount: Number(body.otherAmount || 0),
        totalAmount: Number(body.totalAmount || 0),
        period:      body.period      || null,
        note:        body.note        || null,
      },
    });
    return NextResponse.json(row);
  } catch (e) {
    return handleApiError(e);
  }
}

export async function DELETE(req, { params }) {
  const auth = await requireAnyPermission([PERMISSIONS.ENGINEERING_EDIT, PERMISSIONS.PURCHASING_EDIT]);
  if (!auth.ok) return auth.response;

  const id = Number((await params).id);
  try {
    await prisma.companyExpense.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
