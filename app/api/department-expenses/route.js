import { NextResponse } from 'next/server';
import { getStore } from '@/lib/mockDataStore';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const store = getStore();
    const { searchParams } = new URL(request.url);
    const year = searchParams.get('year');
    const month = searchParams.get('month');
    
    let expenses = store.departmentExpenses;
    
    if (year) {
      expenses = expenses.filter(e => e.year === parseInt(year));
    }
    
    if (month) {
      expenses = expenses.filter(e => e.month === parseInt(month));
    }
    
    return NextResponse.json(expenses.sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      if (a.month !== b.month) return b.month - a.month;
      return a.department.localeCompare(b.department);
    }));
  } catch (error) {
    console.error('查詢部門支出錯誤:', error);
    return NextResponse.json([]);
  }
}

