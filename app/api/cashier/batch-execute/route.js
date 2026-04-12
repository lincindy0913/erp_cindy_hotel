import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { auditFromSession, AUDIT_ACTIONS } from '@/lib/audit';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { getCategoryId } from '@/lib/cash-category-helper';
import { recalcBalance } from '@/lib/recalc-balance';
import { assertPeriodOpen } from '@/lib/period-lock';

export const dynamic = 'force-dynamic';

// Generate sequential number with prefix
async function generateNo(tx, model, prefix, dateStr) {
  const fullPrefix = `${prefix}-${dateStr}-`;
  let items = [];
  if (model === 'cashierExecution') {
    items = await tx.cashierExecution.findMany({
      where: { executionNo: { startsWith: fullPrefix } },
      select: { executionNo: true },
    });
  } else if (model === 'cashTransaction') {
    items = await tx.cashTransaction.findMany({
      where: { transactionNo: { startsWith: fullPrefix } },
      select: { transactionNo: true },
    });
  }
  let maxSeq = 0;
  const field = model === 'cashierExecution' ? 'executionNo' : 'transactionNo';
  for (const item of items) {
    const seq = parseInt(item[field].substring(fullPrefix.length)) || 0;
    if (seq > maxSeq) maxSeq = seq;
  }
  return (nextSeq) => `${fullPrefix}${String(maxSeq + nextSeq).padStart(4, '0')}`;
}

// POST: Batch execute payment orders with multiple funding accounts
// accounts: [{ accountId, amount }]
// Validation: sum of account amounts must equal sum of selected orders
export async function POST(request) {
  try {
    const auth = await requirePermission(PERMISSIONS.CASHIER_EXECUTE);
    if (!auth.ok) return auth.response;
    const session = auth.session;
    const data = await request.json();

    const { orderIds, accounts, executionDate, note, orderExtras, isEmployeeAdvance, advancedBy, advancePaymentMethod } = data;

    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請選擇付款單', 400);
    }
    if (!Array.isArray(accounts) || accounts.length === 0) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請新增至少一個資金帳戶', 400);
    }
    if (!executionDate) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請選擇執行日期', 400);
    }

    // Validate accounts
    for (const acc of accounts) {
      if (!acc.accountId) {
        return createErrorResponse('REQUIRED_FIELD_MISSING', '每個資金帳戶都必須選擇帳戶', 400);
      }
      if (!acc.amount || parseFloat(acc.amount) <= 0) {
        return createErrorResponse('VALIDATION_FAILED', '每個資金帳戶的金額必須大於 0', 400);
      }
    }

    // Check duplicate account IDs
    const accountIdSet = new Set(accounts.map(a => String(a.accountId)));
    if (accountIdSet.size !== accounts.length) {
      return createErrorResponse('VALIDATION_FAILED', '不可重複選擇相同帳戶', 400);
    }

    // Check duplicate order IDs
    const uniqueOrderIds = [...new Set(orderIds.map(id => parseInt(id)))];
    if (uniqueOrderIds.length !== orderIds.length) {
      return createErrorResponse('VALIDATION_FAILED', '不可重複選擇相同付款單', 400);
    }

    // Fetch orders
    const orders = await prisma.paymentOrder.findMany({
      where: { id: { in: uniqueOrderIds } },
    });

    if (orders.length !== uniqueOrderIds.length) {
      return createErrorResponse('NOT_FOUND', '部分付款單不存在', 404);
    }

    // Validate all orders are 待出納
    const invalidOrders = orders.filter(o => o.status !== '待出納');
    if (invalidOrders.length > 0) {
      return createErrorResponse('VALIDATION_FAILED',
        `以下付款單狀態不正確：${invalidOrders.map(o => o.orderNo).join(', ')}`, 409);
    }

    // Calculate effective amounts per order (netAmount + extra for loan orders)
    const extras = orderExtras || {};
    const orderEffectiveAmounts = {};
    for (const o of orders) {
      const extra = parseFloat(extras[o.id]) || 0;
      orderEffectiveAmounts[o.id] = Number(o.netAmount) + extra;
    }

    // Validate totals match
    const orderTotal = orders.reduce((sum, o) => sum + orderEffectiveAmounts[o.id], 0);
    const accountTotal = accounts.reduce((sum, a) => sum + parseFloat(a.amount), 0);

    if (Math.abs(orderTotal - accountTotal) > 0.01) {
      return createErrorResponse('VALIDATION_FAILED',
        `資金帳戶總額 NT$ ${accountTotal.toLocaleString()} 與付款單總額 NT$ ${orderTotal.toLocaleString()} 不符`, 400);
    }

    // Allocate orders to accounts using greedy approach
    // Sort orders by effective amount descending for better fit
    const sortedOrders = [...orders].sort((a, b) => orderEffectiveAmounts[b.id] - orderEffectiveAmounts[a.id]);
    const accountRemaining = accounts.map(a => ({
      accountId: parseInt(a.accountId),
      remaining: parseFloat(a.amount),
    }));

    // allocation: array of { orderId, accountId, amount }
    // An order may be split across multiple accounts
    const allocations = [];

    for (const order of sortedOrders) {
      let orderRemaining = orderEffectiveAmounts[order.id];

      for (const acc of accountRemaining) {
        if (orderRemaining <= 0) break;
        if (acc.remaining <= 0) continue;

        const allocated = Math.min(orderRemaining, acc.remaining);
        allocations.push({
          orderId: order.id,
          orderNo: order.orderNo,
          warehouse: order.warehouse,
          supplierId: order.supplierId || null,
          supplierName: order.supplierName,
          paymentMethod: order.paymentMethod,
          accountId: acc.accountId,
          amount: Math.round(allocated * 100) / 100,
        });
        acc.remaining = Math.round((acc.remaining - allocated) * 100) / 100;
        orderRemaining = Math.round((orderRemaining - allocated) * 100) / 100;
      }

      if (orderRemaining > 0.01) {
        return createErrorResponse('VALIDATION_FAILED',
          `無法完全分配付款單 ${order.orderNo} 的金額`, 400);
      }
    }

    // Pre-fetch accountingSubjects for fixed_expense orders (outside transaction for efficiency)
    const orderSubjectMap = {};
    const fixedExpenseOrders = orders.filter(o => o.sourceType === 'fixed_expense');
    if (fixedExpenseOrders.length > 0) {
      const expRecs = await prisma.commonExpenseRecord.findMany({
        where: { paymentOrderId: { in: fixedExpenseOrders.map(o => o.id) } },
        include: { entryLines: { where: { entryType: 'debit' }, orderBy: { sortOrder: 'asc' }, take: 1 } }
      });
      for (const rec of expRecs) {
        const line = rec.entryLines?.[0];
        if (line?.accountingCode) {
          orderSubjectMap[rec.paymentOrderId] = [line.accountingCode, line.accountingName].filter(Boolean).join(' ').trim() || null;
        }
      }
    }

    const dateStr = executionDate.replace(/-/g, '');

    const result = await prisma.$transaction(async (tx) => {
      // Re-verify all orders are still '待出納' INSIDE transaction (prevent double-execution)
      const freshOrders = await tx.paymentOrder.findMany({
        where: { id: { in: uniqueOrderIds } },
      });
      const alreadyExecuted = freshOrders.filter(o => o.status !== '待出納');
      if (alreadyExecuted.length > 0) {
        throw new Error(`IDEMPOTENT:以下付款單已被執行：${alreadyExecuted.map(o => o.orderNo).join(', ')}`);
      }

      // Enforce period lock
      await assertPeriodOpen(tx, executionDate, freshOrders[0]?.warehouse);

      // Pre-generate number sequences
      const getExecNo = await generateNo(tx, 'cashierExecution', 'CSH', dateStr);
      const getTxNo = await generateNo(tx, 'cashTransaction', 'CF', dateStr);
      const categoryId = await getCategoryId(tx, 'cashier_payment');

      const executions = [];
      const cashTransactions = [];
      const affectedAccountIds = new Set();
      let seqCounter = 1;

      for (const alloc of allocations) {
        const execNo = getExecNo(seqCounter);
        const txNo = getTxNo(seqCounter);
        seqCounter++;

        // 建立現金流扣款（支票支付亦在此建立，支票分頁兌現時不再重複）
        const cashTx = await tx.cashTransaction.create({
          data: {
            transactionNo: txNo,
            transactionDate: executionDate,
            type: '支出',
            warehouse: alloc.warehouse,
            accountId: alloc.accountId,
            supplierId: alloc.supplierId || null,
            categoryId,
            amount: alloc.amount,
            accountingSubject: orderSubjectMap[alloc.orderId] || null,
            description: `出納付款 - ${alloc.orderNo} - ${alloc.supplierName || ''}`,
            sourceType: 'cashier_payment',
            sourceRecordId: alloc.orderId,
            paymentNo: alloc.orderNo,
            status: '已確認',
          },
        });

        // Create CashierExecution
        const execution = await tx.cashierExecution.create({
          data: {
            executionNo: execNo,
            paymentOrderId: alloc.orderId,
            executionDate,
            actualAmount: alloc.amount,
            accountId: alloc.accountId,
            paymentMethod: alloc.paymentMethod,
            cashTransactionId: cashTx.id,
            note: note || '批次執行',
            status: '已確認',
            executedBy: session?.user?.email || null,
          },
        });

        executions.push(execution);
        cashTransactions.push(cashTx);
        affectedAccountIds.add(alloc.accountId);
      }

      // Update all orders to 已執行
      for (const order of orders) {
        await tx.paymentOrder.update({
          where: { id: order.id },
          data: { status: '已執行' },
        });

        // 支票支付：若有關聯 Check，標記兌現（CashTransaction 已於上方建立）
        const linkedCheck = await tx.check.findFirst({
          where: { paymentId: order.id },
        });
        if (linkedCheck) {
          const firstExec = executions.find(e => e.paymentOrderId === order.id);
          await tx.check.update({
            where: { id: linkedCheck.id },
            data: {
              status: 'cleared',
              clearDate: firstExec ? firstExec.executionDate : executionDate,
              actualAmount: firstExec ? firstExec.actualAmount : null,
              cashTransactionId: firstExec ? firstExec.cashTransactionId : null,
              clearedBy: session?.user?.email || null,
            },
          });
        }

        // Check linked loan records — update status and actual amounts
        const linkedLoanRecord = await tx.loanMonthlyRecord.findFirst({
          where: { paymentOrderId: order.id },
        });
        if (linkedLoanRecord && linkedLoanRecord.status === '待出納') {
          // Sum actual amounts allocated to this order (includes extra prepaid)
          const orderAllocations = allocations.filter(a => a.orderId === order.id);
          const totalActual = orderAllocations.reduce((s, a) => s + a.amount, 0);
          // Find primary account used for this order
          const primaryAlloc = orderAllocations[0];
          await tx.loanMonthlyRecord.update({
            where: { id: linkedLoanRecord.id },
            data: {
              status: '已預付',
              actualTotal: totalActual,
              actualDebitDate: executionDate,
              deductAccountId: primaryAlloc ? primaryAlloc.accountId : undefined,
            },
          });
        }

        // If this order is linked to rental maintenance, update maintenance to paid
        const linkedMaintenance = await tx.rentalMaintenance.findFirst({
          where: { paymentOrderId: order.id },
        });
        if (linkedMaintenance) {
          const firstExec = executions.find(e => e.paymentOrderId === order.id);
          await tx.rentalMaintenance.update({
            where: { id: linkedMaintenance.id },
            data: {
              status: 'paid',
              cashTransactionId: firstExec ? firstExec.cashTransactionId : null,
            },
          });

          // If maintenance was an employee advance, create EmployeeAdvance record
          if (linkedMaintenance.isEmployeeAdvance && linkedMaintenance.advancedBy) {
            const advDateStr = executionDate.replace(/-/g, '');
            const advPrefix = `ADV-${advDateStr}-`;
            const existingAdv = await tx.employeeAdvance.findMany({
              where: { advanceNo: { startsWith: advPrefix } },
              select: { advanceNo: true },
            });
            let maxAdvSeq = 0;
            for (const item of existingAdv) {
              const seq = parseInt(item.advanceNo.substring(advPrefix.length)) || 0;
              if (seq > maxAdvSeq) maxAdvSeq = seq;
            }
            const advanceNo = `${advPrefix}${String(maxAdvSeq + 1).padStart(4, '0')}`;

            const orderAllocations = allocations.filter(a => a.orderId === order.id);
            const totalActual = orderAllocations.reduce((s, a) => s + a.amount, 0);

            const advance = await tx.employeeAdvance.create({
              data: {
                advanceNo,
                employeeName: linkedMaintenance.advancedBy,
                paymentMethod: linkedMaintenance.advancePaymentMethod || '現金',
                sourceType: 'maintenance',
                sourceRecordId: linkedMaintenance.id,
                sourceDescription: `維護費 - ${order.summary || ''}`,
                paymentOrderId: order.id,
                paymentOrderNo: order.orderNo,
                amount: totalActual,
                status: '待結算',
                warehouse: order.warehouse,
                createdBy: session?.user?.email || null,
              },
            });

            await tx.rentalMaintenance.update({
              where: { id: linkedMaintenance.id },
              data: { employeeAdvanceId: advance.id },
            });
          }
        }

        // If this order is linked to engineering contract term, check partial vs full payment
        if (order.sourceType === 'engineering' && order.sourceRecordId) {
          const linkedTerm = await tx.engineeringContractTerm.findUnique({
            where: { id: order.sourceRecordId },
            include: { contract: { include: { terms: true } } },
          });
          if (linkedTerm && linkedTerm.status !== 'paid') {
            const allPOs = await tx.paymentOrder.findMany({
              where: { sourceType: 'engineering', sourceRecordId: linkedTerm.id, status: '已執行' },
              select: { amount: true },
            });
            const totalPaid = allPOs.reduce((s, po) => s + Number(po.amount), 0) + Number(order.amount);
            const termAmount = Number(linkedTerm.amount);

            if (totalPaid >= termAmount) {
              await tx.engineeringContractTerm.update({
                where: { id: linkedTerm.id },
                data: {
                  status: 'paid',
                  paidAt: executionDate,
                  paymentOrderId: order.id,
                },
              });
              if (linkedTerm.contract && Array.isArray(linkedTerm.contract.terms)) {
                const allTerms = linkedTerm.contract.terms;
                const allPaidAfter = allTerms.every(t => t.id === linkedTerm.id ? true : t.status === 'paid');
                if (allPaidAfter) {
                  await tx.engineeringContract.update({
                    where: { id: linkedTerm.contractId },
                    data: { status: 'completed' },
                  });
                }
              }
            }
          }
        }

        // 若此付款單為租賃稅款，連動更新 PropertyTax 為已繳並寫入金流
        const linkedTax = await tx.propertyTax.findFirst({
          where: { paymentOrderId: order.id },
        });
        if (linkedTax) {
          const firstExec = executions.find(e => e.paymentOrderId === order.id);
          await tx.propertyTax.update({
            where: { id: linkedTax.id },
            data: {
              status: 'paid',
              cashTransactionId: firstExec ? firstExec.cashTransactionId : null,
              confirmedAt: new Date(),
              confirmedBy: session?.user?.email || null,
            },
          });
        }

        // If cashier marked batch as employee advance, create EmployeeAdvance record per order
        if (isEmployeeAdvance && advancedBy) {
          const advDateStr = executionDate.replace(/-/g, '');
          const advPrefix = `ADV-${advDateStr}-`;
          const existingAdv = await tx.employeeAdvance.findMany({
            where: { advanceNo: { startsWith: advPrefix } },
            select: { advanceNo: true },
          });
          let maxAdvSeq = 0;
          for (const item of existingAdv) {
            const seq = parseInt(item.advanceNo.substring(advPrefix.length)) || 0;
            if (seq > maxAdvSeq) maxAdvSeq = seq;
          }
          const advNo = `${advPrefix}${String(maxAdvSeq + 1).padStart(4, '0')}`;

          const orderAllocs = allocations.filter(a => a.orderId === order.id);
          const totalActualAdv = orderAllocs.reduce((s, a) => s + a.amount, 0);

          await tx.employeeAdvance.create({
            data: {
              advanceNo: advNo,
              employeeName: advancedBy,
              paymentMethod: advancePaymentMethod || '現金',
              sourceType: 'cashier',
              sourceRecordId: order.id,
              sourceDescription: order.summary || `付款單 ${order.orderNo}`,
              paymentOrderId: order.id,
              paymentOrderNo: order.orderNo,
              amount: totalActualAdv,
              status: '待結算',
              warehouse: order.warehouse,
              createdBy: session?.user?.email || null,
            },
          });
        }
      }

      // Recalculate balance for all affected accounts
      for (const accId of affectedAccountIds) {
        await recalcBalance(tx, accId);
      }

      return { executions, cashTransactions };
    }, { timeout: 30000 });

    // Audit logging
    if (session) {
      await auditFromSession(prisma, session, {
        action: AUDIT_ACTIONS.CASHIER_EXECUTE,
        level: 'finance',
        targetModule: 'cashier',
        targetRecordNo: `batch-${orderIds.length}`,
        afterState: {
          orderCount: orders.length,
          accountCount: accounts.length,
          totalAmount: orderTotal,
          allocations: allocations.map(a => ({
            orderNo: a.orderNo,
            accountId: a.accountId,
            amount: a.amount,
          })),
        },
      });
    }

    return NextResponse.json({
      success: true,
      executionCount: result.executions.length,
      transactionCount: result.cashTransactions.length,
      orderCount: orders.length,
      totalAmount: orderTotal,
      allocations: allocations.map(a => ({
        orderNo: a.orderNo,
        accountId: a.accountId,
        amount: a.amount,
      })),
      message: `批次執行成功！共 ${orders.length} 筆付款單，${accounts.length} 個帳戶`,
    }, { status: 201 });
  } catch (error) {

    console.error('Batch execute error:', error?.message, error?.stack);
    return handleApiError(error);
  }
}
