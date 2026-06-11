import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError, ErrorCodes } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { auditFromSession, AUDIT_ACTIONS } from '@/lib/audit';
import { runInventoryRollover } from '@/lib/year-end/inventoryRollover';
import { prepareBalanceRecords } from '@/lib/year-end/balanceRollover';
import { calcProfitLoss } from '@/lib/year-end/plCalc';
import { buildFinancialStatements } from '@/lib/year-end/statements';
import { checkYearEndBlockers } from '@/lib/year-end/blockerChecks';

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
    const { year, rolledOverBy, note, preCheckSummary, ignoreNegativeStock = false } = body;

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
      // Explicitly clean up child records before deleting parent
      // (cascade delete also handles this, but being explicit guards against future schema changes)
      await prisma.$transaction([
        prisma.yearEndInventory.deleteMany({ where: { yearEndId: existing.id } }),
        prisma.yearEndBalanceRecord.deleteMany({ where: { yearEndId: existing.id } }),
        prisma.yearEndFinancialStatement.deleteMany({ where: { yearEndId: existing.id } }),
        prisma.yearEndRollover.delete({ where: { id: existing.id } }),
      ]);
      await auditFromSession(prisma, auth.session, {
        action: AUDIT_ACTIONS.YEAR_END_CLOSE,
        targetModule: 'year-end',
        targetRecordId: existing.id,
        beforeState: { year, status: existing.status, completedSections: existing.completedSections },
        note: `刪除上次未完成的年結記錄（${existing.status}），準備重新執行`,
      }).catch(e => console.error('[AUDIT_FAIL] year-end:', e.message));
    }

    // 1b. Verify all pre-conditions (與 preview 共用同一 blockerChecks，確保一致性)
    const { blockers } = await checkYearEndBlockers(prisma, year, { ignoreNegativeStock });
    if (blockers.length > 0) {
      return createErrorResponse(
        'YEAR_END_BLOCKED',
        `年結前置條件未完成：\n${blockers.map((b, i) => `${i + 1}. ${b}`).join('\n')}`,
        422
      );
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
    await auditFromSession(prisma, auth.session, {
      action: AUDIT_ACTIONS.YEAR_END_CLOSE,
      targetModule: 'year-end',
      targetRecordId: yearEnd.id,
      afterState: { year, status: '進行中' },
      note: `年結開始執行 ${year} 年度`,
    }).catch(e => console.error('[AUDIT_FAIL] year-end:', e.message));

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
      // 3. Inventory rollover
      // ======================================================
      const { inventorySnapshots, closingInventoryValue } = await runInventoryRollover(prisma, yearEnd.id);
      completedSections.inventory = true;
      await prisma.yearEndRollover.update({ where: { id: yearEnd.id }, data: { completedSections } });

      // ======================================================
      // 4. Cash balance preparation (writes happen in step 7)
      // ======================================================
      const { balanceRecords, cashAccounts, totalCashBalance } = await prepareBalanceRecords(prisma, yearEnd.id);

      // ======================================================
      // 5. P&L calculation
      // ======================================================
      const pl = await calcProfitLoss(prisma, { year, yearStart, yearEndDate, closingInventory: closingInventoryValue });
      const { netIncome, grossRevenue, totalCOGS, grossProfit, totalExpenses, totalDeptExpenses } = pl;
      completedSections.profitLoss = true;

      // ======================================================
      // 6. Financial statements
      // ======================================================
      const { incomeStatement, balanceSheet, cashFlowStatement } = await buildFinancialStatements(prisma, {
        year, yearStart, yearEndDate, pl, cashAccounts, inventorySnapshots, totalCashBalance
      });
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
        //     Re-fetch inside tx so we use the latest currentBalance,
        //     not the value read at line ~188 which may be stale after
        //     the long pre-computation phase (1-30s window for race conditions).
        const freshAccounts = await tx.cashAccount.findMany({
          where: { isActive: true },
          select: { id: true, currentBalance: true },
        });
        await Promise.all(freshAccounts.map(a =>
          tx.cashAccount.update({
            where: { id: a.id },
            data: { openingBalance: a.currentBalance },
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
        console.error('[YEAR_END_BACKUP_FAIL] 年度備份記錄建立失敗（非阻斷）:', backupErr.message);
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
      }).catch(e => console.error('[AUDIT_FAIL] year-end:', e.message));

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
      }).catch(e => console.error('[YEAR_END_FAIL_UPDATE] 無法寫入失敗狀態:', e.message));

      // Audit: year-end failed
      await auditFromSession(prisma, auth.session, {
        action: AUDIT_ACTIONS.YEAR_END_CLOSE,
        targetModule: 'year-end',
        targetRecordId: yearEnd.id,
        beforeState: { year, status: '進行中', completedSections },
        afterState: { year, status: '失敗', failedAt: new Date().toISOString(), error: innerError.message },
        note: `年結執行失敗 ${year} 年度：${innerError.message}`,
      }).catch(e => console.error('[AUDIT_FAIL] year-end:', e.message));

      throw innerError;
    }
  } catch (error) {
    return handleApiError(error);
  }
}
