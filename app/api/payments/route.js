import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const payments = await prisma.payment.findMany({
      orderBy: { id: 'asc' }
    });

    const result = payments.map(p => ({
      ...p,
      amount: Number(p.amount),
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      salesId: Array.isArray(p.invoiceIds) && p.invoiceIds.length > 0 ? p.invoiceIds[0] : null
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error('查詢付款紀錄錯誤:', error);
    return NextResponse.json([]);
  }
}

export async function POST(request) {
  try {
    const data = await request.json();

    if (!data.invoiceIds || !Array.isArray(data.invoiceIds) || data.invoiceIds.length === 0) {
      return NextResponse.json({ error: '請至少選擇一張發票進行付款' }, { status: 400 });
    }

    const invoiceIds = data.invoiceIds.map(id => parseInt(id));

    // 驗證已付款的發票
    const allPayments = await prisma.payment.findMany({ select: { invoiceIds: true } });
    const paidInvoiceIds = new Set();
    allPayments.forEach(payment => {
      const ids = payment.invoiceIds;
      if (Array.isArray(ids)) {
        ids.forEach(id => paidInvoiceIds.add(id));
      }
    });

    for (const invoiceId of invoiceIds) {
      const invoice = await prisma.salesMaster.findUnique({ where: { id: invoiceId } });
      if (!invoice) {
        return NextResponse.json({ error: `發票 ID ${invoiceId} 不存在` }, { status: 400 });
      }
      if (paidInvoiceIds.has(invoiceId)) {
        return NextResponse.json({ error: `發票 ID ${invoiceId} 已付款` }, { status: 400 });
      }
    }

    // 計算總金額
    let totalAmount = 0;
    const invoices = await prisma.salesMaster.findMany({
      where: { id: { in: invoiceIds } }
    });
    invoices.forEach(invoice => {
      totalAmount += Number(invoice.totalAmount || 0);
    });

    const paymentAmount = data.amount ? parseFloat(data.amount) : totalAmount;

    // 產生付款單號
    let paymentNo = data.paymentNo;
    if (!paymentNo || paymentNo.trim() === '') {
      const paymentDate = data.paymentDate || new Date().toISOString().split('T')[0];
      const yearMonth = paymentDate.substring(0, 7).replace(/-/g, '');

      const existingPayments = await prisma.payment.findMany({
        where: { paymentNo: { startsWith: yearMonth } },
        select: { paymentNo: true }
      });

      let maxSequence = 0;
      existingPayments.forEach(p => {
        const sequencePart = p.paymentNo.substring(6);
        const sequence = parseInt(sequencePart) || 0;
        if (sequence > maxSequence) maxSequence = sequence;
      });

      paymentNo = `${yearMonth}${String(maxSequence + 1).padStart(3, '0')}`;
    }

    // 使用交易建立付款和支出記錄
    const result = await prisma.$transaction(async (tx) => {
      const newPayment = await tx.payment.create({
        data: {
          paymentNo,
          invoiceIds: invoiceIds,
          paymentDate: data.paymentDate || null,
          paymentMethod: data.paymentMethod || '支票',
          amount: paymentAmount,
          status: '未完成',
          checkIssueDate: data.checkIssueDate || null,
          checkDate: data.checkDate || null,
          checkNo: data.checkNo || null,
          checkAccount: data.checkAccount || null
        }
      });

      // 更新發票狀態並建立支出記錄
      for (const invoiceId of invoiceIds) {
        await tx.salesMaster.update({
          where: { id: invoiceId },
          data: { status: '已核銷' }
        });

        // 建立支出記錄
        const existingExpense = await tx.expense.findFirst({
          where: { invoiceId }
        });

        if (!existingExpense) {
          const invoice = await tx.salesMaster.findUnique({
            where: { id: invoiceId },
            include: { details: true }
          });

          let supplierId = null;
          let supplierName = '未知廠商';
          let warehouse = '';

          if (invoice.details.length > 0 && invoice.details[0].purchaseId) {
            const purchase = await tx.purchaseMaster.findUnique({
              where: { id: invoice.details[0].purchaseId },
              include: { supplier: { select: { id: true, name: true } } }
            });
            if (purchase) {
              supplierId = purchase.supplierId;
              supplierName = purchase.supplier?.name || '未知廠商';
              warehouse = purchase.warehouse || '';
            }
          }

          await tx.expense.create({
            data: {
              invoiceId,
              invoiceNo: invoice.invoiceNo || invoice.salesNo || '',
              invoiceDate: invoice.invoiceDate || '',
              amount: Number(invoice.totalAmount || 0),
              actualPaymentDate: '',
              actualPaymentAmount: 0,
              status: '未完成',
              supplierId,
              supplierName,
              warehouse
            }
          });
        }
      }

      return {
        ...newPayment,
        amount: Number(newPayment.amount),
        createdAt: newPayment.createdAt.toISOString(),
        updatedAt: newPayment.updatedAt.toISOString(),
        salesId: invoiceIds[0]
      };
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('建立付款紀錄錯誤:', error);
    return NextResponse.json({ error: '建立付款紀錄失敗' }, { status: 500 });
  }
}
