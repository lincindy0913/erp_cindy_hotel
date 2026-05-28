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
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(req, { params }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req, { params }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = Number(params.id);
  try {
    await prisma.companyInputInvoice.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
