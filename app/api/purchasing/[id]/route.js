import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function PUT(request, { params }) {
  try {
    const id = parseInt(params.id);
    const data = await request.json();

    const existing = await prisma.purchaseMaster.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: '進貨單不存在' }, { status: 404 });
    }

    await prisma.purchaseDetail.deleteMany({ where: { purchaseId: id } });

    const updated = await prisma.purchaseMaster.update({
      where: { id },
      data: {
        warehouse: data.warehouse || '',
        department: data.department || '',
        supplierId: parseInt(data.supplierId),
        purchaseDate: data.purchaseDate,
        paymentTerms: data.paymentTerms || '月結',
        status: data.status,
        amount: parseFloat(data.amount || 0),
        tax: 0,
        totalAmount: data.totalAmount ? parseFloat(data.totalAmount) : parseFloat(data.amount || 0),
        details: {
          create: (data.items || []).map(item => ({
            productId: parseInt(item.productId),
            quantity: parseInt(item.quantity),
            unitPrice: parseFloat(item.unitPrice),
            note: item.note || '',
            status: item.status || data.status || '待入庫'
          }))
        }
      },
      include: { details: true }
    });

    const result = {
      id: updated.id,
      purchaseNo: updated.purchaseNo,
      warehouse: updated.warehouse,
      department: updated.department,
      supplierId: updated.supplierId,
      purchaseDate: updated.purchaseDate,
      paymentTerms: updated.paymentTerms,
      taxType: updated.taxType,
      amount: Number(updated.amount),
      tax: Number(updated.tax),
      totalAmount: Number(updated.totalAmount),
      status: updated.status,
      items: updated.details.map(d => ({
        productId: d.productId,
        quantity: d.quantity,
        unitPrice: Number(d.unitPrice),
        note: d.note || '',
        status: d.status
      })),
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString()
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('更新進貨單錯誤:', error);
    return NextResponse.json({ error: '更新進貨單失敗' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const id = parseInt(params.id);

    const existing = await prisma.purchaseMaster.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: '進貨單不存在' }, { status: 404 });
    }

    await prisma.purchaseMaster.delete({ where: { id } });
    return NextResponse.json({ message: '進貨單已刪除' });
  } catch (error) {
    console.error('刪除進貨單錯誤:', error);
    return NextResponse.json({ error: '刪除進貨單失敗' }, { status: 500 });
  }
}
