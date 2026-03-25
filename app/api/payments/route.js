import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { assertPeriodOpen } from '@/lib/period-lock';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.CASHIER_VIEW);
  if (!auth.ok) return auth.response;
  
  try {
    const payments = await prisma.payment.findMany({
      orderBy: { id: 'asc' }
    });

    const result = payments.map(p => ({
      ...p,
      amount: Number(p.amount),
      discount: Number(p.discount),
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      salesId: Array.isArray(p.invoiceIds) && p.invoiceIds.length > 0 ? p.invoiceIds[0] : null
    }));

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.CASHIER_EXECUTE);
  if (!auth.ok) return auth.response;
  
  try {
    const data = await request.json();

    if (!data.invoiceIds || !Array.isArray(data.invoiceIds) || data.invoiceIds.length === 0) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請至少選擇一張發票進行付款', 400);
    }

    const invoiceIds = data.invoiceIds.map(id => parseInt(id));
    const discountAmount = data.discount ? parseFloat(data.discount) : 0;

    // 全部邏輯都在 $transaction 內，避免 race condition
    const result = await prisma.$transaction(async (tx) => {
      // ── 關帳鎖定檢查 ──
      const paymentDate = data.paymentDate || new Date().toISOString().split('T')[0];
      await assertPeriodOpen(tx, paymentDate);

      // ── 冪等檢查：同一組 invoiceIds 是否已有 Payment ──
      const allPayments = await tx.payment.findMany({ select: { invoiceIds: true } });
      const paidInvoiceIds = new Set();
      allPayments.forEach(payment => {
        const ids = payment.invoiceIds;
        if (Array.isArray(ids)) {
          ids.forEach(id => paidInvoiceIds.add(id));
        }
      });

      // 驗證發票存在且尚未付款
      for (const invoiceId of invoiceIds) {
        const invoice = await tx.salesMaster.findUnique({ where: { id: invoiceId } });
        if (!invoice) {
          throw new Error(`NOT_FOUND:發票 ID ${invoiceId} 不存在`);
        }
        if (paidInvoiceIds.has(invoiceId)) {
          throw new Error(`IDEMPOTENT:發票 ID ${invoiceId} 已付款`);
        }
        // 雙重保險：檢查發票狀態
        if (invoice.status === '已核銷') {
          throw new Error(`IDEMPOTENT:發票 ID ${invoiceId} 已核銷`);
        }
      }

      // 計算總金額
      const invoices = await tx.salesMaster.findMany({
        where: { id: { in: invoiceIds } }
      });
      let totalAmount = 0;
      invoices.forEach(invoice => {
        totalAmount += Number(invoice.totalAmount || 0);
      });

      const paymentAmount = data.amount ? parseFloat(data.amount) : (totalAmount - discountAmount);

      // 產生付款單號（在 transaction 內，確保序號不重複）
      let paymentNo = data.paymentNo;
      if (!paymentNo || paymentNo.trim() === '') {
        const paymentDate = data.paymentDate || new Date().toISOString().split('T')[0];
        const yearMonth = paymentDate.substring(0, 7).replace(/-/g, '');

        const existingPayments = await tx.payment.findMany({
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

      const newPayment = await tx.payment.create({
        data: {
          paymentNo,
          invoiceIds: invoiceIds,
          paymentDate: data.paymentDate || null,
          paymentMethod: data.paymentMethod || '月結',
          amount: paymentAmount,
          discount: discountAmount,
          status: '未完成',
          checkIssueDate: data.checkIssueDate || null,
          checkDate: data.checkDate || null,
          checkNo: data.checkNo || null,
          checkAccount: data.checkAccount || null,
          note: data.note || null
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
        discount: Number(newPayment.discount),
        createdAt: newPayment.createdAt.toISOString(),
        updatedAt: newPayment.updatedAt.toISOString(),
        salesId: invoiceIds[0]
      };
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {


    return handleApiError(error, '/api/payments');
  }
}
