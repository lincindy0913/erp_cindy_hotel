import { NextResponse } from 'next/server';
import { getStore } from '@/lib/mockDataStore';

export async function PUT(request, { params }) {
  try {
    const store = getStore();
    const id = parseInt(params.id);
    const data = await request.json();
    
    if (!store.expenses) {
      store.expenses = [];
    }
    
    const expenseIndex = store.expenses.findIndex(e => e.id === id);
    
    if (expenseIndex === -1) {
      return NextResponse.json({ error: '支出紀錄不存在' }, { status: 404 });
    }

    const existingExpense = store.expenses[expenseIndex];
    
    // 更新實付日期和實付金額
    const actualPaymentDate = data.actualPaymentDate || existingExpense.actualPaymentDate;
    const actualPaymentAmount = parseFloat(data.actualPaymentAmount || 0);
    const amount = parseFloat(existingExpense.amount || 0);
    
    // 判斷狀態：實付金額等於傳票金額時，狀態為已完成
    let status = '未完成';
    if (actualPaymentAmount > 0) {
      if (Math.abs(actualPaymentAmount - amount) < 0.01) { // 允許小數點誤差
        status = '已完成';
      } else {
        status = '未完成';
      }
    }
    
    // 更新支出紀錄
    store.expenses[expenseIndex] = {
      ...existingExpense,
      actualPaymentDate: actualPaymentDate,
      actualPaymentAmount: actualPaymentAmount,
      status: status,
      updatedAt: new Date().toISOString()
    };
    
    return NextResponse.json(store.expenses[expenseIndex]);
  } catch (error) {
    console.error('更新支出紀錄錯誤:', error);
    return NextResponse.json({ error: '更新支出紀錄失敗' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const store = getStore();
    const id = parseInt(params.id);
    
    if (!store.expenses) {
      store.expenses = [];
    }
    
    const expenseIndex = store.expenses.findIndex(e => e.id === id);
    
    if (expenseIndex === -1) {
      return NextResponse.json({ error: '支出紀錄不存在' }, { status: 404 });
    }

    store.expenses.splice(expenseIndex, 1);
    return NextResponse.json({ message: '支出紀錄已刪除' });
  } catch (error) {
    console.error('刪除支出紀錄錯誤:', error);
    return NextResponse.json({ error: '刪除支出紀錄失敗' }, { status: 500 });
  }
}

