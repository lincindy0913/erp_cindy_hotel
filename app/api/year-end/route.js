import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError, ErrorCodes } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { auditFromSession, AUDIT_ACTIONS } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// GET: List all historical year-end records
export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.YEAREND_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const records = await prisma.yearEndRollover.findMany({
      orderBy: { year: 'desc' },
      include: {
        _count: {
          select: {
            inventorySnapshots: true,
            balanceRecords: true,
            financialStatements: true
          }
        }
      }
    });

    const result = records.map(r => ({
      id: r.id,
      year: r.year,
      status: r.status,
      rolledOverBy: r.rolledOverBy,
      rolledOverAt: r.rolledOverAt ? r.rolledOverAt.toISOString() : null,
      retainedEarnings: r.retainedEarnings ? Number(r.retainedEarnings) : null,
      completedSections: r.completedSections,
      note: r.note,
      createdAt: r.createdAt.toISOString(),
      inventoryCount: r._count.inventorySnapshots,
      balanceCount: r._count.balanceRecords,
      statementCount: r._count.financialStatements
    }));

    return NextResponse.json({ records: result });
  } catch (error) {
    return handleApiError(error);
  }
}

// POST: Execute year-end rollover
export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.YEAREND_EXECUTE);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { year, rolledOverBy, note, preCheckSummary } = body;

    if (!year) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請提供年份', 400);
    }

    // 1. Verify year not already rolled over
    const existing = await prisma.yearEndRollover.findUnique({ where: { year } });

    if (existing) {
      if (existing.status === '已完成') {
        return createErrorResponse(
          ErrorCodes.YEAR_END_ALREADY_EXISTS.code,
          `${year} 年度已完成結轉，無法重複執行`,
          ErrorCodes.YEAR_END_ALREADY_EXISTS.status
        );
      }
      // Delete previous failed/in-progress attempt, log the deletion
      await prisma.yearEndRollover.delete({ where: { id: existing.id } });
      auditFromSession(prisma, auth.session, {
        action: AUDIT_ACTIONS.YEAR_END_CLOSE,
        targetModule: 'year-end',
        targetRecordId: existing.id,
        beforeState: { year, status: existing.status, completedSections: existing.completedSections },
        note: `刪除上次未完成的年結記錄（${existing.status}），準備重新執行`,
      }).catch(() => {});
    }

    // 2. Create YearEndRollover record with status='進行中'
    const yearEnd = await prisma.yearEndRollover.create({
      data: {
        year,
        status: '進行中',
        rolledOverBy: rolledOverBy || null,
        note: note || null,
        completedSections: {
          inventory: false,
          cashBalance: false,
          profitLoss: false,
          statements: false
        },
        ...(preCheckSummary ? {
          preCheckResults: {
            ...preCheckSummary,
            savedFrom: 'execution_start',
            savedAt: new Date().toISOString()
          }
        } : {})
      }
    });

    // Audit: year-end started
    auditFromSession(prisma, auth.session, {
      action: AUDIT_ACTIONS.YEAR_END_CLOSE,
      targetModule: 'year-end',
      targetRecordId: yearEnd.id,
      afterState: { year, status: '進行中' },
      note: `年結開始執行 ${year} 年度`,
    }).catch(() => {});

    const yearStart = `${year}-01-01`;
    const yearEndDate = `${year}-12-31`;
    const completedSections = {
      inventory: false,
      cashBalance: false,
      profitLoss: false,
      statements: false
    };

    try {
      // ======================================================
      // 3. Inventory rollover (snapshot only — no live data modified)
      // ======================================================
      const inStockProducts = await prisma.product.findMany({
        where: { isInStock: true, isActive: true },
        select: {
          id: true,
          code: true,
          name: true,
          costPrice: true,
          purchaseDetails: {
            select: { quantity: true, status: true }
          }
        }
      });

      const productIds = inStockProducts.map(p => p.id);
      const salesByProduct = productIds.length > 0
        ? await prisma.salesDetail.groupBy({
            by: ['productId'],
            where: { productId: { in: productIds } },
            _sum: { quantity: true }
          })
        : [];
      const soldMap = new Map(salesByProduct.map(s => [s.productId, s._sum.quantity || 0]));

      const inventorySnapshots = [];
      for (const product of inStockProducts) {
        const totalPurchased = product.purchaseDetails
          .filter(d => d.status === '已入庫')
          .reduce((sum, d) => sum + (d.quantity || 0), 0);
        const totalSold = soldMap.get(product.id) || 0;
        const currentQty = totalPurchased - totalSold;
        const costPrice = Number(product.costPrice);
        const isNegative = currentQty < 0;
        const closingQty = isNegative ? 0 : currentQty;
        inventorySnapshots.push({
          yearEndId: yearEnd.id,
          productId: product.id,
          productCode: product.code,
          productName: product.name,
          costPrice: product.costPrice,
          closingQuantity: closingQty,
          closingValue: closingQty * costPrice,
          isNegative,
          adjustedToZero: isNegative
        });
      }

      if (inventorySnapshots.length > 0) {
        await prisma.yearEndInventory.createMany({ data: inventorySnapshots });
      }
      completedSections.inventory = true;
      await prisma.yearEndRollover.update({
        where: { id: yearEnd.id },
        data: { completedSections }
      });

      // ======================================================
      // 4. Prepare cash balance data (read only — writes happen in final transaction)
      // ======================================================
      const cashAccounts = await prisma.cashAccount.findMany({ where: { isActive: true } });

      const balanceRecords = cashAccounts.map(account => ({
        yearEndId: yearEnd.id,
        accountId: account.id,
        accountName: account.name,
        accountType: account.type,
        closingBalance: Number(account.currentBalance),
        nextYearOpeningBalance: Number(account.currentBalance)
      }));

      // ======================================================
      // 5. P&L calculation (read only)
      // ======================================================
      const salesRevenue = await prisma.salesMaster.aggregate({
        where: { invoiceDate: { gte: yearStart, lte: yearEndDate } },
        _sum: { totalAmount: true },
        _count: true
      });
      const totalRevenue = Number(salesRevenue._sum.totalAmount || 0);

      const pmsIncome = await prisma.pmsIncomeRecord.aggregate({
        where: { businessDate: { gte: yearStart, lte: yearEndDate }, entryType: '貸方' },
        _sum: { amount: true }
      });
      const totalPmsIncome = Number(pmsIncome._sum.amount || 0);

      const purchaseCost = await prisma.purchaseMaster.aggregate({
        where: { purchaseDate: { gte: yearStart, lte: yearEndDate } },
        _sum: { totalAmount: true },
        _count: true
      });
      const totalCOGS = Number(purchaseCost._sum.totalAmount || 0);

      const expenseTotal = await prisma.expense.aggregate({
        where: { invoiceDate: { gte: yearStart, lte: yearEndDate } },
        _sum: { amount: true },
        _count: true
      });
      const totalExpenses = Number(expenseTotal._sum.amount || 0);

      const deptExpenseTotal = await prisma.departmentExpense.aggregate({
        where: { year },
        _sum: { totalAmount: true }
      });
      const totalDeptExpenses = Number(deptExpenseTotal._sum.totalAmount || 0);

      const grossRevenue = totalRevenue + totalPmsIncome;
      const grossProfit = grossRevenue - totalCOGS;
      const netIncome = grossProfit - totalExpenses - totalDeptExpenses;
      completedSections.profitLoss = true;

      // ======================================================
      // 6. Financial statements (snapshot only — no live data modified)
      // ======================================================
      const [salesRows, pmsRows, purchaseRows, expenseRows, deptRows] = await Promise.all([
        prisma.salesMaster.findMany({
          where: { invoiceDate: { gte: yearStart, lte: yearEndDate } },
          select: { invoiceDate: true, totalAmount: true }
        }),
        prisma.pmsIncomeRecord.findMany({
          where: { businessDate: { gte: yearStart, lte: yearEndDate }, entryType: '貸方' },
          select: { businessDate: true, amount: true }
        }),
        prisma.purchaseMaster.findMany({
          where: { purchaseDate: { gte: yearStart, lte: yearEndDate } },
          select: { purchaseDate: true, totalAmount: true }
        }),
        prisma.expense.findMany({
          where: { invoiceDate: { gte: yearStart, lte: yearEndDate } },
          select: { invoiceDate: true, amount: true }
        }),
        prisma.departmentExpense.findMany({
          where: { year },
          select: { month: true, totalAmount: true }
        }),
      ]);

      const getMonth = (dateStr) => dateStr ? parseInt(dateStr.substring(5, 7)) : 0;
      const monthlySales = Array(13).fill(0);
      const monthlyPms = Array(13).fill(0);
      const monthlyPurchase = Array(13).fill(0);
      const monthlyExpense = Array(13).fill(0);
      const monthlyDept = Array(13).fill(0);

      for (const r of salesRows) monthlySales[getMonth(r.invoiceDate)] += Number(r.totalAmount || 0);
      for (const r of pmsRows) monthlyPms[getMonth(r.businessDate)] += Number(r.amount || 0);
      for (const r of purchaseRows) monthlyPurchase[getMonth(r.purchaseDate)] += Number(r.totalAmount || 0);
      for (const r of expenseRows) monthlyExpense[getMonth(r.invoiceDate)] += Number(r.amount || 0);
      for (const r of deptRows) monthlyDept[r.month || 0] += Number(r.totalAmount || 0);

      const salesByMonth = [];
      for (let m = 1; m <= 12; m++) {
        const mRev = monthlySales[m] + monthlyPms[m];
        const mCogs = monthlyPurchase[m];
        const mExp = monthlyExpense[m] + monthlyDept[m];
        salesByMonth.push({ month: m, revenue: mRev, cogs: mCogs, grossProfit: mRev - mCogs, expenses: mExp, netIncome: mRev - mCogs - mExp });
      }

      const incomeStatement = {
        year,
        revenue: { salesRevenue: totalRevenue, pmsIncome: totalPmsIncome, totalRevenue: grossRevenue },
        costOfGoodsSold: totalCOGS,
        grossProfit,
        operatingExpenses: { expenses: totalExpenses, departmentExpenses: totalDeptExpenses, totalExpenses: totalExpenses + totalDeptExpenses },
        netIncome,
        monthlyBreakdown: salesByMonth
      };

      const totalCashBalance = cashAccounts.reduce((sum, a) => sum + Number(a.currentBalance), 0);
      const inventoryValue = inventorySnapshots.reduce((sum, s) => sum + Number(s.closingValue), 0);

      const loans = await prisma.loanMaster.findMany({
        where: { status: '使用中' },
        select: { loanName: true, currentBalance: true, bankName: true }
      });
      const totalLoanBalance = loans.reduce((sum, l) => sum + Number(l.currentBalance), 0);

      const accountsPayable = await prisma.expense.aggregate({
        where: { status: { not: '已完成' } },
        _sum: { amount: true }
      });
      const totalAP = Number(accountsPayable._sum.amount || 0);

      const balanceSheet = {
        year,
        assets: { currentAssets: { cashAndEquivalents: totalCashBalance, inventory: inventoryValue, totalCurrentAssets: totalCashBalance + inventoryValue }, totalAssets: totalCashBalance + inventoryValue },
        liabilities: {
          currentLiabilities: { accountsPayable: totalAP, totalCurrentLiabilities: totalAP },
          longTermLiabilities: { loans: totalLoanBalance, loanDetails: loans.map(l => ({ name: l.loanName, bank: l.bankName, balance: Number(l.currentBalance) })), totalLongTermLiabilities: totalLoanBalance },
          totalLiabilities: totalAP + totalLoanBalance
        },
        equity: { retainedEarnings: netIncome, totalEquity: netIncome },
        balanceCheck: {
          totalAssets: totalCashBalance + inventoryValue,
          totalLiabilitiesAndEquity: totalAP + totalLoanBalance + netIncome,
          isBalanced: Math.abs((totalCashBalance + inventoryValue) - (totalAP + totalLoanBalance + netIncome)) < 0.01
        }
      };

      const cashTransactions = await prisma.cashTransaction.findMany({
        where: { transactionDate: { gte: yearStart, lte: yearEndDate }, status: '已確認' },
        include: { account: { select: { name: true, type: true } }, category: { select: { name: true, type: true } } }
      });

      let operatingIncome = 0, operatingExpense = 0, investingInflow = 0, investingOutflow = 0, financingInflow = 0, financingOutflow = 0;
      const monthlyFlows = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, operating: 0, investing: 0, financing: 0, net: 0 }));

      for (const tx of cashTransactions) {
        const amount = Number(tx.amount);
        const catName = tx.category?.name || '';
        const txMonth = parseInt(tx.transactionDate.substring(5, 7));
        const isInvesting = catName.includes('投資') || catName.includes('設備') || catName.includes('資產');
        const isFinancing = catName.includes('貸款') || catName.includes('利息') || catName.includes('借款');
        if (tx.type === '收入') {
          if (isInvesting) { investingInflow += amount; monthlyFlows[txMonth - 1].investing += amount; }
          else if (isFinancing) { financingInflow += amount; monthlyFlows[txMonth - 1].financing += amount; }
          else { operatingIncome += amount; monthlyFlows[txMonth - 1].operating += amount; }
        } else if (tx.type === '支出') {
          if (isInvesting) { investingOutflow += amount; monthlyFlows[txMonth - 1].investing -= amount; }
          else if (isFinancing) { financingOutflow += amount; monthlyFlows[txMonth - 1].financing -= amount; }
          else { operatingExpense += amount; monthlyFlows[txMonth - 1].operating -= amount; }
        }
      }
      for (const mf of monthlyFlows) mf.net = mf.operating + mf.investing + mf.financing;

      const cashFlowStatement = {
        year,
        operatingActivities: { income: operatingIncome, expenses: operatingExpense, netOperating: operatingIncome - operatingExpense },
        investingActivities: { inflow: investingInflow, outflow: investingOutflow, netInvesting: investingInflow - investingOutflow },
        financingActivities: { inflow: financingInflow, outflow: financingOutflow, netFinancing: financingInflow - financingOutflow },
        netCashChange: (operatingIncome - operatingExpense) + (investingInflow - investingOutflow) + (financingInflow - financingOutflow),
        totalTransactions: cashTransactions.length,
        monthlyBreakdown: monthlyFlows
      };

      completedSections.statements = true;

      // ======================================================
      // 7. ATOMIC TRANSACTION: commit live-data changes + finalize status
      //    — CashAccount.openingBalance, balance records, and final status
      //      must all succeed together or all roll back together.
      // ======================================================
      const updatedYearEnd = await prisma.$transaction(async (tx) => {
        // 7a. Create balance records
        if (balanceRecords.length > 0) {
          await tx.yearEndBalanceRecord.createMany({ data: balanceRecords });
        }

        // 7b. Update each CashAccount's opening balance for the next year
        //     (THIS IS THE ONLY LIVE-DATA MODIFICATION — must be atomic with status)
        await Promise.all(cashAccounts.map(account =>
          tx.cashAccount.update({
            where: { id: account.id },
            data: { openingBalance: account.currentBalance }
          })
        ));

        // 7c. Create financial statements
        await tx.yearEndFinancialStatement.createMany({
          data: [
            { yearEndId: yearEnd.id, statementType: '損益表',    statementData: incomeStatement,  generatedBy: rolledOverBy || null },
            { yearEndId: yearEnd.id, statementType: '資產負債表', statementData: balanceSheet,      generatedBy: rolledOverBy || null },
            { yearEndId: yearEnd.id, statementType: '現金流量表', statementData: cashFlowStatement, generatedBy: rolledOverBy || null },
          ]
        });

        // 7d. Mark YearEndRollover as completed
        return tx.yearEndRollover.update({
          where: { id: yearEnd.id },
          data: {
            status: '已完成',
            rolledOverAt: new Date(),
            completedSections,
            retainedEarnings: netIncome,
            preCheckResults: { grossRevenue, totalCOGS, grossProfit, totalExpenses: totalExpenses + totalDeptExpenses, netIncome }
          }
        });
      }, { timeout: 30000 }); // 30s timeout for large datasets

      // ======================================================
      // 8. Post-completion: backup record (async, non-blocking)
      // ======================================================
      let backupRecordId = null;
      try {
        const backupRecord = await prisma.backupRecord.create({
          data: {
            tier: 'tier3_yearend',
            triggerType: 'year_end',
            businessPeriod: `${year}`,
            status: 'in_progress',
            createdBy: rolledOverBy || 'system',
          }
        });
        backupRecordId = backupRecord.id;
        await prisma.backupRecord.update({
          where: { id: backupRecord.id },
          data: { status: 'completed', completedAt: new Date(), note: `年度結轉 ${year} 自動觸發 Tier 3 年度備份` }
        });
      } catch (backupErr) {
        console.error('年度備份記錄建立失敗（非阻斷）:', backupErr.message);
      }

      // Audit: year-end completed successfully
      await auditFromSession(prisma, auth.session, {
        action: AUDIT_ACTIONS.YEAR_END_CLOSE,
        targetModule: 'year-end',
        targetRecordId: updatedYearEnd.id,
        beforeState: { year, status: '進行中' },
        afterState: {
          year,
          status: '已完成',
          retainedEarnings: netIncome,
          completedSections,
          inventoryProducts: inventorySnapshots.length,
          cashAccounts: balanceRecords.length
        },
        note: `年結關帳完成 ${year} 年度｜淨利 ${netIncome.toLocaleString()} 元`,
      }).catch(() => {});

      // Fetch statement IDs for response
      const statements = await prisma.yearEndFinancialStatement.findMany({
        where: { yearEndId: yearEnd.id },
        select: { id: true, statementType: true, generatedAt: true }
      });

      return NextResponse.json({
        success: true,
        id: updatedYearEnd.id,
        year: updatedYearEnd.year,
        status: updatedYearEnd.status,
        rolledOverAt: updatedYearEnd.rolledOverAt?.toISOString(),
        completedSections: updatedYearEnd.completedSections,
        retainedEarnings: Number(updatedYearEnd.retainedEarnings),
        annualBackupRecordId: backupRecordId,
        summary: {
          inventoryProducts: inventorySnapshots.length,
          inventoryTotalValue: inventorySnapshots.reduce((s, i) => s + Number(i.closingValue), 0),
          negativeProducts: inventorySnapshots.filter(i => i.isNegative).length,
          cashAccounts: balanceRecords.length,
          totalCashBalance,
          revenue: grossRevenue,
          cogs: totalCOGS,
          expenses: totalExpenses + totalDeptExpenses,
          netIncome,
          statements: statements.map(s => ({ id: s.id, type: s.statementType, generatedAt: s.generatedAt.toISOString() }))
        }
      });

    } catch (innerError) {
      // Mark as failed — preserve any preCheckResults already saved
      await prisma.yearEndRollover.update({
        where: { id: yearEnd.id },
        data: {
          status: '失敗',
          completedSections,
          note: `結轉失敗: ${innerError.message}`,
          preCheckResults: {
            ...(preCheckSummary || {}),
            failedAt: new Date().toISOString(),
            failureReason: innerError.message,
            completedSections
          }
        }
      }).catch(() => {});

      // Audit: year-end failed
      auditFromSession(prisma, auth.session, {
        action: AUDIT_ACTIONS.YEAR_END_CLOSE,
        targetModule: 'year-end',
        targetRecordId: yearEnd.id,
        beforeState: { year, status: '進行中', completedSections },
        afterState: { year, status: '失敗', failedAt: new Date().toISOString(), error: innerError.message },
        note: `年結執行失敗 ${year} 年度：${innerError.message}`,
      }).catch(() => {});

      throw innerError;
    }
  } catch (error) {
    return handleApiError(error);
  }
}
