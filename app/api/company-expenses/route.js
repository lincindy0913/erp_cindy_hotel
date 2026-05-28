import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import prisma from '@/lib/prisma';

export async function GET(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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
        include: { project: { select: { id: true, code: true, name: true } } },
        orderBy: [{ period: 'asc' }, { invoiceDate: 'asc' }, { id: 'asc' }],
      });
      return NextResponse.json(rows);
    }

    const where = period ? { period } : {};
    const rows = await prisma.companyExpense.findMany({
      where,
      orderBy: [{ expenseDate: 'desc' }, { id: 'desc' }],
    });
    return NextResponse.json(rows);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const type = body.type; // 'expense' | 'invoice'

  try {
    if (type === 'invoice') {
      const row = await prisma.companyInputInvoice.create({
        data: {
          invoiceDate: body.invoiceDate,
          invoiceNo:   body.invoiceNo   || null,
          vendorTaxId: body.vendorTaxId || null,
          vendorName:  body.vendorName  || null,
          materialType: body.materialType || null,
          itemName:    body.itemName    || null,
          amount:      Number(body.amount    || 0),
          taxAmount:   Number(body.taxAmount || 0),
          totalAmount: Number(body.totalAmount || 0),
          projectId:   body.projectId ? Number(body.projectId) : null,
          location:    body.location   || null,
          period:      body.period     || null,
          note:        body.note       || null,
        },
        include: { project: { select: { id: true, code: true, name: true } } },
      });
      return NextResponse.json(row, { status: 201 });
    }

    const row = await prisma.companyExpense.create({
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
    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
