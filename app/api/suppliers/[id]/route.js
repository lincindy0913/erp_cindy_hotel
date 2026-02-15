import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(request, { params }) {
  try {
    const id = parseInt(params.id);
    const supplier = await prisma.supplier.findUnique({ where: { id } });

    if (!supplier) {
      return NextResponse.json({ error: '廠商不存在' }, { status: 404 });
    }
    return NextResponse.json(supplier);
  } catch (error) {
    return NextResponse.json({ error: '查詢廠商失敗' }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  try {
    const id = parseInt(params.id);
    const data = await request.json();

    const existing = await prisma.supplier.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: '廠商不存在' }, { status: 404 });
    }

    if (!data.name || !data.taxId || !data.contact || !data.personInCharge || !data.phone) {
      return NextResponse.json({ error: '缺少必填欄位：廠商名稱、統一編號、聯絡人、負責人、聯絡電話' }, { status: 400 });
    }

    const updated = await prisma.supplier.update({
      where: { id },
      data: {
        name: data.name,
        taxId: data.taxId || null,
        contact: data.contact,
        personInCharge: data.personInCharge || null,
        phone: data.phone,
        address: data.address || null,
        email: data.email || null,
        paymentTerms: data.paymentTerms || '月結',
        contractDate: data.contractDate || null,
        contractEndDate: data.contractEndDate || null,
        paymentStatus: data.paymentStatus || '未付款',
        remarks: data.remarks || null
      }
    });

    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: '更新廠商失敗' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const id = parseInt(params.id);

    const existing = await prisma.supplier.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: '廠商不存在' }, { status: 404 });
    }

    await prisma.supplier.delete({ where: { id } });
    return NextResponse.json({ message: '廠商已刪除' });
  } catch (error) {
    return NextResponse.json({ error: '刪除廠商失敗' }, { status: 500 });
  }
}
