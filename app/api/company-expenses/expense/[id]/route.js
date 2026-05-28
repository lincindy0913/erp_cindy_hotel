import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import prisma from '@/lib/prisma';

export async function PUT(req, { params }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = Number(params.id);
  const body = await req.json();

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
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req, { params }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = Number(params.id);
  try {
    await prisma.companyExpense.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
