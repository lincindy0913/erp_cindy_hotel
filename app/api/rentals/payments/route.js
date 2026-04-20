import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

/**
 * GET /api/rentals/payments
 * 查詢付款紀錄（RentalIncomePayment）
 * Params: year, month, propertyId, accountId, paymentMethod, page, limit
 */
export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.RENTAL_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const year = searchParams.get('year');
    const month = searchParams.get('month');
    const propertyId = searchParams.get('propertyId');
    const accountId = searchParams.get('accountId');
    const paymentMethod = searchParams.get('paymentMethod');
    const page = parseInt(searchParams.get('page')) || 1;
    const limit = Math.min(parseInt(searchParams.get('limit')) || 100, 500);
    const skip = (page - 1) * limit;

    // Build filter on the parent RentalIncome
    const incomeWhere = {};
    if (year) incomeWhere.incomeYear = parseInt(year);
    if (month) incomeWhere.incomeMonth = parseInt(month);
    if (propertyId) incomeWhere.propertyId = parseInt(propertyId);

    // Build filter on the payment itself
    const paymentWhere = {};
    if (accountId) paymentWhere.accountId = parseInt(accountId);
    if (paymentMethod) paymentWhere.paymentMethod = paymentMethod;
    if (Object.keys(incomeWhere).length > 0) paymentWhere.rentalIncome = { is: incomeWhere };

    const [payments, totalCount] = await Promise.all([
      prisma.rentalIncomePayment.findMany({
        where: paymentWhere,
        include: {
          account: { select: { id: true, name: true, accountCode: true, type: true, warehouse: true } },
          rentalIncome: {
            select: {
              id: true,
              incomeYear: true,
              incomeMonth: true,
              expectedAmount: true,
              dueDate: true,
              property: { select: { id: true, name: true, buildingName: true } },
              tenant: { select: { fullName: true, companyName: true, tenantType: true } },
              contract: { select: { contractNo: true } }
            }
          }
        },
        orderBy: [{ paymentDate: 'desc' }, { id: 'desc' }],
        skip,
        take: limit
      }),
      prisma.rentalIncomePayment.count({ where: paymentWhere })
    ]);

    const result = payments.map(p => ({
      id: p.id,
      paymentDate: p.paymentDate,
      sequenceNo: p.sequenceNo,
      amount: Number(p.amount),
      accountId: p.accountId,
      accountName: p.account?.name || null,
      accountCode: p.account?.accountCode || null,
      accountType: p.account?.type || null,
      accountWarehouse: p.account?.warehouse || null,
      paymentMethod: p.paymentMethod,
      matchTransferRef: p.matchTransferRef,
      matchBankAccountName: p.matchBankAccountName,
      matchNote: p.matchNote,
      cashTransactionId: p.cashTransactionId,
      incomeYear: p.rentalIncome.incomeYear,
      incomeMonth: p.rentalIncome.incomeMonth,
      expectedAmount: Number(p.rentalIncome.expectedAmount),
      dueDate: p.rentalIncome.dueDate,
      propertyId: p.rentalIncome.property.id,
      propertyName: p.rentalIncome.property.name,
      buildingName: p.rentalIncome.property.buildingName,
      tenantName: p.rentalIncome.tenant.tenantType === 'company'
        ? p.rentalIncome.tenant.companyName
        : p.rentalIncome.tenant.fullName,
      contractNo: p.rentalIncome.contract?.contractNo || null,
      rentalIncomeId: p.rentalIncomeId
    }));

    return NextResponse.json({
      data: result,
      pagination: { page, limit, totalCount, totalPages: Math.ceil(totalCount / limit) }
    });
  } catch (error) {
    console.error('GET /api/rentals/payments error:', error.message || error);
    return handleApiError(error);
  }
}
