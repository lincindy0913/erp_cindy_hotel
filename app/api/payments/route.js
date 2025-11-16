import { NextResponse } from 'next/server';
import { getStore } from '@/lib/mockDataStore';

export async function GET(request) {
  try {
    const store = getStore();
    return NextResponse.json(store.payments);
  } catch (error) {
    console.error('查詢付款紀錄錯誤:', error);
    const store = getStore();
    return NextResponse.json(store.payments);
  }
}

export async function POST(request) {
  try {
    const store = getStore();
    const data = await request.json();

    // 新格式：支援一次付款多張發票
    if (!data.invoiceIds || !Array.isArray(data.invoiceIds) || data.invoiceIds.length === 0) {
      return NextResponse.json({ error: '請至少選擇一張發票進行付款' }, { status: 400 });
    }

    // 驗證所有發票是否存在且未付款
    const invoiceIds = data.invoiceIds.map(id => parseInt(id));
    const paidInvoiceIds = new Set();
    store.payments.forEach(payment => {
      if (payment.invoiceIds && Array.isArray(payment.invoiceIds)) {
        payment.invoiceIds.forEach(id => paidInvoiceIds.add(id));
      }
      if (payment.salesId) {
        paidInvoiceIds.add(payment.salesId);
      }
    });

    for (const invoiceId of invoiceIds) {
      const invoice = store.sales.find(s => s.id === invoiceId);
      if (!invoice) {
        return NextResponse.json({ error: `發票 ID ${invoiceId} 不存在` }, { status: 400 });
      }
      if (paidInvoiceIds.has(invoiceId)) {
        return NextResponse.json({ error: `發票 ID ${invoiceId} 已付款` }, { status: 400 });
      }
    }

    // 計算總金額（從選取的發票總金額加總）
    let totalAmount = 0;
    invoiceIds.forEach(invoiceId => {
      const invoice = store.sales.find(s => s.id === invoiceId);
      if (invoice) {
        totalAmount += parseFloat(invoice.totalAmount || (invoice.amount || 0) + (invoice.tax || 0));
      }
    });

    // 如果提供了金額，使用提供的金額；否則使用計算的總金額
    const paymentAmount = data.amount ? parseFloat(data.amount) : totalAmount;

    // 自動產生付款單號：年月份（YYYYMM）+ 3位數序號
    let paymentNo = data.paymentNo;
    if (!paymentNo || paymentNo.trim() === '') {
      // 從付款日期取得年月，如果沒有付款日期則使用今天
      const paymentDate = data.paymentDate || new Date().toISOString().split('T')[0];
      const yearMonth = paymentDate.substring(0, 7).replace(/-/g, ''); // YYYYMM
      
      // 計算該年月已有的付款數量
      let maxSequence = 0;
      const yearMonthPrefix = yearMonth;
      
      store.payments.forEach(payment => {
        if (payment.paymentNo && payment.paymentNo.startsWith(yearMonthPrefix)) {
          // 提取序號部分（最後3位數）
          const sequencePart = payment.paymentNo.substring(6); // 跳過前6位（YYYYMM）
          const sequence = parseInt(sequencePart) || 0;
          if (sequence > maxSequence) {
            maxSequence = sequence;
          }
        }
      });
      
      // 產生新的序號（加1）
      const nextSequence = maxSequence + 1;
      paymentNo = `${yearMonthPrefix}${String(nextSequence).padStart(3, '0')}`;
    }

    const newPayment = {
      id: store.counters.payment++,
      invoiceIds: invoiceIds, // 多張發票ID
      paymentNo,
      paymentDate: data.paymentDate, // 付款日期
      paymentMethod: data.paymentMethod || '支票',
      amount: paymentAmount,
      // 支票相關欄位
      checkIssueDate: data.checkIssueDate || '', // 開票日期
      checkDate: data.checkDate || '', // 支票日期
      checkNo: data.checkNo || '', // 支票號碼
      checkAccount: data.checkAccount || '', // 開票賬戶
      createdAt: new Date().toISOString(),
      // 保留舊格式兼容性（使用第一張發票ID）
      salesId: invoiceIds[0]
    };

    store.payments.push(newPayment);
    return NextResponse.json(newPayment, { status: 201 });
  } catch (error) {
    console.error('建立付款紀錄錯誤:', error);
    return NextResponse.json({ error: '建立付款紀錄失敗' }, { status: 500 });
  }
}

