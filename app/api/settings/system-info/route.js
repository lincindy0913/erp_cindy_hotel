import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireAnyPermission([PERMISSIONS.SETTINGS_VIEW, PERMISSIONS.SETTINGS_EDIT]);
  if (!auth.ok) return auth.response;
  
  try {
    const [
      productCount,
      supplierCount,
      purchaseCount,
      invoiceCount,
      expenseCount,
      userCount,
      cashAccountCount,
      loanCount,
    ] = await Promise.all([
      prisma.product.count(),
      prisma.supplier.count(),
      prisma.purchaseMaster.count(),
      prisma.invoice.count(),
      prisma.expense.count(),
      prisma.user.count(),
      prisma.cashAccount.count().catch(() => 0),
      prisma.loanMaster.count().catch(() => 0),
    ]);

    return NextResponse.json({
      version: '2.0.0',
      dbStatus: '正常',
      productCount,
      supplierCount,
      purchaseCount,
      invoiceCount,
      expenseCount,
      userCount,
      cashAccountCount,
      loanCount,
    });
  } catch (error) {
    console.error('查詢系統資訊錯誤:', error.message || error);
    return NextResponse.json({
      version: '2.0.0',
      dbStatus: '連線異常',
      productCount: 0,
      supplierCount: 0,
      purchaseCount: 0,
      invoiceCount: 0,
      expenseCount: 0,
      userCount: 0,
    });
  }
}
