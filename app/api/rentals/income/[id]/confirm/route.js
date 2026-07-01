import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { getCategoryId } from '@/lib/cash-category-helper';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { recalcBalance } from '@/lib/recalc-balance';
import { nextCashTransactionNo } from '@/lib/sequence-generator';
import { assertRentalYearOpen } from '@/lib/rental-year-lock';
import { auditFromSession, AUDIT_ACTIONS } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/**
 * POST /api/rentals/income/[id]/confirm
 * 整合確認：同時確認租金收款 + 可選的水電費收入
 *
 * Body:
 *   rent: { actualAmount, actualDate, accountId, paymentMethod?, matchTransferRef?, matchBankAccountName?, matchNote? }
 *   utility?: { expectedAmount, actualAmount }  // 若有電費需一併入帳
 */
export async function POST(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.RENTAL_EDIT);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const incomeId = parseInt(id);
    const body = await request.json();

    const rent = body.rent || {};
    const utilityData = body.utility || null;

    if (!rent.actualAmount || !rent.actualDate || !rent.accountId) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '租金實收金額、收款日期、收款帳戶為必填', 400);
    }

    const income = await prisma.rentalIncome.findUnique({
      where: { id: incomeId },
      select: {
        id: true, propertyId: true, tenantId: true,
        incomeYear: true, incomeMonth: true,
        expectedAmount: true, cashTransactionId: true,
        property: { select: { id: true, name: true } },
        tenant: { select: { fullName: true, companyName: true, tenantType: true } },
        payments: {
          orderBy: { sequenceNo: 'asc' },
          select: { id: true, sequenceNo: true, amount: true, cashTransactionId: true }
        }
      }
    });

    if (!income) {
      return createErrorResponse('NOT_FOUND', '找不到收租紀錄', 404);
    }
    await assertRentalYearOpen(income.incomeYear);

    // R17：付款日期年份不可早於收款年度
    const actualYear = parseInt(rent.actualDate.slice(0, 4));
    if (actualYear < income.incomeYear) {
      return createErrorResponse(
        'INVALID_DATE',
        `付款日期（${rent.actualDate}）早於收款年度（${income.incomeYear}），請確認`,
        400
      );
    }

    const parsedRentActual = parseFloat(rent.actualAmount);
    const acctId = parseInt(rent.accountId);
    const existingPayments = income.payments || [];
    const nextSeq = existingPayments.length + 1;
    const previousTotal = existingPayments.reduce((s, p) => s + Number(p.amount), 0);
    const newTotal = previousTotal + parsedRentActual;
    const expected = Number(income.expectedAmount);
    const newStatus = newTotal >= expected ? 'completed' : 'partial';

    const tenantName = income.tenant.tenantType === 'company'
      ? income.tenant.companyName
      : income.tenant.fullName;

    const rentCategoryId = await getCategoryId(prisma, 'rental_income');
    const utilityCategoryId = await getCategoryId(prisma, 'rental_utility_income');

    const rentCategoryInfo = rentCategoryId
      ? await prisma.cashCategory.findUnique({ where: { id: rentCategoryId }, include: { accountingSubject: { select: { code: true, name: true } } } })
      : null;
    const rentSubjectLabel = rentCategoryInfo?.accountingSubject
      ? `${rentCategoryInfo.accountingSubject.code || ''} ${rentCategoryInfo.accountingSubject.name || ''}`.trim()
      : null;

    const utilityCategoryInfo = utilityCategoryId
      ? await prisma.cashCategory.findUnique({ where: { id: utilityCategoryId }, include: { accountingSubject: { select: { code: true, name: true } } } })
      : null;
    const utilitySubjectLabel = utilityCategoryInfo?.accountingSubject
      ? `${utilityCategoryInfo.accountingSubject.code || ''} ${utilityCategoryInfo.accountingSubject.name || ''}`.trim()
      : null;

    const result = await prisma.$transaction(async (tx) => {
      // --- 租金 CashTransaction ---
      const rentTxNo = await nextCashTransactionNo(tx, rent.actualDate);
      const rentTx = await tx.cashTransaction.create({
        data: {
          transactionNo: rentTxNo,
          transactionDate: rent.actualDate,
          type: '收入',
          accountId: acctId,
          categoryId: rentCategoryId,
          accountingSubject: rentSubjectLabel,
          warehouse: '租金', // 所有租金收入歸「租金」館別（帳戶仍依各筆匯款帳戶）
          amount: parsedRentActual,
          description: `租金收入 - ${income.property.name} - ${tenantName} - ${income.incomeYear}/${income.incomeMonth}${nextSeq > 1 ? ` (第${nextSeq}次)` : ''}`,
          sourceType: 'rental_income',
          sourceRecordId: incomeId,
          status: '已確認'
        },
        select: { id: true },
      });

      // --- RentalIncomePayment ---
      await tx.rentalIncomePayment.create({
        data: {
          rentalIncomeId: incomeId,
          sequenceNo: nextSeq,
          amount: parsedRentActual,
          paymentDate: rent.actualDate,
          accountId: acctId,
          paymentMethod: rent.paymentMethod || null,
          matchTransferRef: rent.matchTransferRef || null,
          matchBankAccountName: rent.matchBankAccountName || null,
          matchNote: rent.matchNote || null,
          cashTransactionId: rentTx.id
        },
        select: { id: true },
      });

      const firstTxId = existingPayments.length > 0 ? income.cashTransactionId : rentTx.id;
      const splitUpdate = rent.isSplitAllocation != null ? { isSplitAllocation: !!rent.isSplitAllocation } : {};
      await tx.rentalIncome.update({
        where: { id: incomeId },
        data: {
          actualAmount: newTotal,
          actualDate: rent.actualDate,
          accountId: acctId,
          paymentMethod: rent.paymentMethod || null,
          matchTransferRef: rent.matchTransferRef || null,
          matchBankAccountName: rent.matchBankAccountName || null,
          matchNote: rent.matchNote || null,
          status: newStatus,
          cashTransactionId: firstTxId ?? rentTx.id,
          confirmedAt: new Date(),
          ...splitUpdate,
        },
        select: { id: true },
      });

      // --- 水電費（選填）---
      let utilityTxId = null;
      if (utilityData && utilityData.actualAmount != null && utilityData.actualAmount !== '') {
        const parsedUtilityActual = parseFloat(utilityData.actualAmount);
        const parsedUtilityExpected = utilityData.expectedAmount != null && utilityData.expectedAmount !== ''
          ? parseFloat(utilityData.expectedAmount)
          : parsedUtilityActual;

        const utilityTxNo = await nextCashTransactionNo(tx, rent.actualDate);
        const utilityTx = await tx.cashTransaction.create({
          data: {
            transactionNo: utilityTxNo,
            transactionDate: rent.actualDate,
            type: '收入',
            accountId: acctId,
            categoryId: utilityCategoryId,
            accountingSubject: utilitySubjectLabel,
            amount: parsedUtilityActual,
            description: `水電收入 - ${income.property.name} - ${income.incomeYear}/${income.incomeMonth}`,
            sourceType: 'rental_utility_income',
            sourceRecordId: income.propertyId,
            status: '已確認'
          },
          select: { id: true },
        });
        utilityTxId = utilityTx.id;

        await tx.rentalUtilityIncome.upsert({
          where: {
            propertyId_incomeYear_incomeMonth: {
              propertyId: income.propertyId,
              incomeYear: income.incomeYear,
              incomeMonth: income.incomeMonth
            }
          },
          create: {
            propertyId: income.propertyId,
            incomeYear: income.incomeYear,
            incomeMonth: income.incomeMonth,
            expectedAmount: parsedUtilityExpected,
            actualAmount: parsedUtilityActual,
            actualDate: rent.actualDate,
            status: 'completed',
            accountId: acctId,
            note: utilityData.note || null,
            cashTransactionId: utilityTx.id
          },
          update: {
            expectedAmount: parsedUtilityExpected,
            actualAmount: parsedUtilityActual,
            actualDate: rent.actualDate,
            status: 'completed',
            accountId: acctId,
            note: utilityData.note || null,
            cashTransactionId: utilityTx.id
          },
          select: { id: true },
        });
      } else if (utilityData && utilityData.expectedAmount != null && utilityData.expectedAmount !== '') {
        // 只登記電費應收（尚未收款）
        const parsedUtilityExpected = parseFloat(utilityData.expectedAmount);
        await tx.rentalUtilityIncome.upsert({
          where: {
            propertyId_incomeYear_incomeMonth: {
              propertyId: income.propertyId,
              incomeYear: income.incomeYear,
              incomeMonth: income.incomeMonth
            }
          },
          create: {
            propertyId: income.propertyId,
            incomeYear: income.incomeYear,
            incomeMonth: income.incomeMonth,
            expectedAmount: parsedUtilityExpected,
            actualAmount: null,
            status: 'pending',
            note: utilityData.note || null
          },
          update: {
            expectedAmount: parsedUtilityExpected,
            note: utilityData.note || null
          },
          select: { id: true },
        });
      }

      return { rentTxId: rentTx.id, utilityTxId, newStatus, nextSeq };
    });

    await recalcBalance(prisma, acctId);

    await auditFromSession(prisma, auth.session, {
      action: AUDIT_ACTIONS.RENTAL_INCOME_CONFIRM,
      targetModule: 'rental_income',
      targetId: String(incomeId),
      detail: `${income.property.name} ${income.incomeYear}/${income.incomeMonth} 確認收款 ${parsedRentActual}，狀態：${result.newStatus}`,
    });

    return NextResponse.json({
      success: true,
      status: result.newStatus,
      sequenceNo: result.nextSeq,
      rentTransactionId: result.rentTxId,
      utilityTransactionId: result.utilityTxId
    });
  } catch (error) {
    console.error('POST /api/rentals/income/[id]/confirm error:', error.message || error);
    return handleApiError(error);
  }
}
