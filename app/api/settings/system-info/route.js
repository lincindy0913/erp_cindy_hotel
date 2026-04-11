import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireAnyPermission([PERMISSIONS.SETTINGS_VIEW, PERMISSIONS.SETTINGS_EDIT]);
  if (!auth.ok) return auth.response;

  // First verify DB is actually reachable
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    return NextResponse.json({
      version: '2.0.0',
      dbStatus: '連線異常',
      dbError: err?.message || '無法連線至資料庫',
      productCount: 0, supplierCount: 0, purchaseCount: 0,
      invoiceCount: 0, expenseCount: 0, userCount: 0,
      cashAccountCount: 0, loanCount: 0, cashTransactionCount: 0,
      warehouseCount: 0, departmentCount: 0,
    });
  }

  try {
    const [
      productCount,
      supplierCount,
      purchaseCount,
      invoiceCount,       // SalesMaster = 發票/銷售主檔
      expenseCount,
      userCount,
      cashAccountCount,
      loanCount,
      cashTransactionCount,
      warehouseCount,
      departmentCount,
    ] = await Promise.all([
      prisma.product.count(),
      prisma.supplier.count(),
      prisma.purchaseMaster.count(),
      prisma.salesMaster.count(),           // was: prisma.invoice.count() — model does not exist
      prisma.expense.count(),
      prisma.user.count(),
      prisma.cashAccount.count().catch(() => 0),
      prisma.loanMaster.count().catch(() => 0),
      prisma.cashTransaction.count().catch(() => 0),
      prisma.warehouse.count().catch(() => 0),
      prisma.department.count().catch(() => 0),
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
      cashTransactionCount,
      warehouseCount,
      departmentCount,
    });
  } catch (error) {
    console.error('查詢系統資訊錯誤:', error.message || error);
    return NextResponse.json({
      version: '2.0.0',
      dbStatus: '連線異常',
      dbError: error?.message || '查詢失敗',
      productCount: 0, supplierCount: 0, purchaseCount: 0,
      invoiceCount: 0, expenseCount: 0, userCount: 0,
      cashAccountCount: 0, loanCount: 0, cashTransactionCount: 0,
      warehouseCount: 0, departmentCount: 0,
    });
  }
}
