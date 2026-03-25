import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { getCategoryId } from '@/lib/cash-category-helper';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { assertPeriodOpen } from '@/lib/period-lock';
import { auditFromSession, AUDIT_ACTIONS } from '@/lib/audit';
import { recalcBalance } from '@/lib/recalc-balance';

export const dynamic = 'force-dynamic';

// Helper: generate sequence number
async function generateNo(tx, model, prefix) {
  const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const fullPrefix = `${prefix}-${today}-`;

  let maxSeq = 0;
  if (model === 'paymentOrder') {
    const existing = await tx.paymentOrder.findMany({
      where: { orderNo: { startsWith: fullPrefix } },
      select: { orderNo: true }
    });
    for (const item of existing) {
      const seq = parseInt(item.orderNo.substring(fullPrefix.length)) || 0;
      if (seq > maxSeq) maxSeq = seq;
    }
  } else if (model === 'commonExpenseRecord') {
    const existing = await tx.commonExpenseRecord.findMany({
      where: { recordNo: { startsWith: fullPrefix } },
      select: { recordNo: true }
    });
    for (const item of existing) {
      const seq = parseInt(item.recordNo.substring(fullPrefix.length)) || 0;
      if (seq > maxSeq) maxSeq = seq;
    }
  } else if (model === 'employeeAdvance') {
    const existing = await tx.employeeAdvance.findMany({
      where: { advanceNo: { startsWith: fullPrefix } },
      select: { advanceNo: true }
    });
    for (const item of existing) {
      const seq = parseInt(item.advanceNo.substring(fullPrefix.length)) || 0;
      if (seq > maxSeq) maxSeq = seq;
    }
  }

  return `${fullPrefix}${String(maxSeq + 1).padStart(4, '0')}`;
}

// Build entry lines for one warehouse (from template defaults or from data.entryLines)
function buildEntryLinesForAmount(template, amount) {
  const amt = parseFloat(amount) || 0;
  if (amt <= 0) return null;
  const debitCode = template.defaultDebitCode || '5211';
  const debitName = template.defaultDebitName || '薪資費用';
  const creditCode = template.defaultCreditCode || '1111';
  const creditName = template.defaultCreditName || '現金';
  return [
    { entryType: 'debit', accountingCode: debitCode, accountingName: debitName, summary: template.name || '', amount: amt, sortOrder: 0 },
    { entryType: 'credit', accountingCode: creditCode, accountingName: creditName, summary: template.name || '', amount: amt, sortOrder: 1 }
  ];
}

// POST: Execute fixed-type template (single 館別 or batch 多館別)
// Single: { templateId, warehouse, expenseMonth, entryLines, ... }
// Batch:  { templateId, expenseMonth, warehouseAmounts: [{ warehouse, amount }], ... } — no 借貸方, use template defaults
export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.EXPENSE_CREATE);
  if (!auth.ok) return auth.response;

  try {
    const data = await request.json();

    if (!data.templateId) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請選擇費用範本', 400);
    }
    if (!data.expenseMonth?.trim()) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請選擇費用月份', 400);
    }
    if (!data.createdBy?.trim()) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '缺少建立者資訊', 400);
    }

    const template = await prisma.commonExpenseTemplate.findUnique({
      where: { id: parseInt(data.templateId) },
      include: { category: { select: { name: true } } }
    });
    if (!template) {
      return createErrorResponse('NOT_FOUND', '找不到費用範本', 404);
    }

    const isBatch = Array.isArray(data.warehouseAmounts) && data.warehouseAmounts.length > 0;
    const isLinesMode = Array.isArray(data.entryLines) && data.entryLines.length > 0 && (
      data.entryLines.some(l => (l.warehouse || '').trim()) || data.creditCardAdvanceMode
    );

    if (isLinesMode) {
      // 每筆分錄含館別/付款方式/存簿：依館別分組，每館別一筆記錄
      // 未指定館別的分錄歸入空字串群組
      const warehouses = [...new Set(data.entryLines.map(l => (l.warehouse || '').trim()))];
      const anyCheck = data.entryLines.some(l => (l.paymentMethod || data.paymentMethod) === '支票') || data.paymentMethod === '支票';
      if (anyCheck && (!data.checkNo?.trim() || !data.checkIssueDate || !data.checkDate || !data.checkAccountId)) {
        return createErrorResponse('REQUIRED_FIELD_MISSING', '付款方式為支票時請填寫：付款(開票)日期、支票日期、支票號碼、開票帳戶', 400);
      }
      const created = [];
      for (const wh of warehouses) {
        const whLines = data.entryLines
          .filter(l => (l.warehouse || '').trim() === wh)
          .map((l, i) => ({ ...l, amount: parseFloat(l.amount) || 0, sortOrder: l.sortOrder ?? i }))
          .filter(l => l.amount > 0);
        if (whLines.length === 0) continue;
        let debitTotal = whLines.filter(l => l.entryType === 'debit').reduce((s, l) => s + l.amount, 0);
        let creditTotal = whLines.filter(l => l.entryType === 'credit').reduce((s, l) => s + l.amount, 0);
        if (debitTotal <= 0) continue;
        // 若只有借方（無貸方），自動用範本預設貸方科目補上
        if (creditTotal === 0 && debitTotal > 0) {
          whLines.push({
            entryType: 'credit',
            accountingCode: template.defaultCreditCode || '1111',
            accountingName: template.defaultCreditName || '現金',
            summary: template.name || '',
            amount: debitTotal,
            sortOrder: whLines.length
          });
          creditTotal = debitTotal;
        }
        if (Math.abs(debitTotal - creditTotal) > 0.01) continue;
        const pm = whLines[0].paymentMethod || data.paymentMethod || '月結';
        const accId = whLines[0].accountId ? parseInt(whLines[0].accountId) : null;
        // 從分錄中取得廠商（取第一筆有廠商的分錄）
        const lineWithSupplier = whLines.find(l => l.supplierId);
        const lineSupplierId = lineWithSupplier?.supplierId ? parseInt(lineWithSupplier.supplierId) : null;
        const lineSupplierName = lineWithSupplier?.supplierName || null;
        const r = await prisma.$transaction(async (tx) => {
          // Duplicate check INSIDE transaction
          const duplicate = await tx.commonExpenseRecord.findFirst({
            where: { templateId: parseInt(data.templateId), warehouse: wh, expenseMonth: data.expenseMonth.trim(), executionType: 'fixed', status: { not: '已作廢' } }
          });
          if (duplicate && !data.allowDuplicate) return null;

          // Enforce period lock
          await assertPeriodOpen(tx, `${data.expenseMonth}-01`, wh);

          const orderNo = await generateNo(tx, 'paymentOrder', 'PAY');
          const isCreditCardAdvance = data.creditCardAdvanceMode || ((pm === '信用卡' || pm === '員工代付') && whLines[0].advancedBy);
          const whLabel = wh || '未指定館別';
          const po = await tx.paymentOrder.create({
            data: { orderNo, invoiceIds: [], supplierId: lineSupplierId, supplierName: lineSupplierName, warehouse: wh || null, paymentMethod: pm, amount: debitTotal, discount: 0, netAmount: debitTotal, accountId: accId, dueDate: null, summary: `${template.name} — ${whLabel} ${data.expenseMonth}`, note: data.note || null, status: isCreditCardAdvance ? '已代墊' : '待出納', createdBy: data.createdBy.trim(), sourceType: 'fixed_expense' }
          });
          const recordNo = await generateNo(tx, 'commonExpenseRecord', 'EXP');
          const rec = await tx.commonExpenseRecord.create({
            data: {
              recordNo, templateId: parseInt(data.templateId), executionType: 'fixed', warehouse: wh || null, expenseMonth: data.expenseMonth.trim(),
              supplierId: lineSupplierId, supplierName: lineSupplierName, paymentMethod: pm, totalDebit: debitTotal, totalCredit: creditTotal,
              paymentOrderId: po.id, paymentOrderNo: orderNo, status: '已確認', confirmedBy: data.createdBy.trim(), confirmedAt: new Date(),
              note: data.note || null, createdBy: data.createdBy.trim(),
              entryLines: { create: whLines.map((line, idx) => ({ entryType: line.entryType, accountingCode: line.accountingCode || '', accountingName: line.accountingName || '', summary: line.summary || '', amount: line.amount, sortOrder: idx })) }
            }
          });

          // 付款方式為支票：建立 Check 記錄並連動支票管理
          if (pm === '支票' && data.checkNo?.trim() && data.checkIssueDate && data.checkDate && data.checkAccountId) {
            const chkDateStr = (data.checkIssueDate || '').replace(/-/g, '');
            const chkPrefix = `CHK-${chkDateStr}-`;
            const existingChks = await tx.check.findMany({
              where: { checkNo: { startsWith: chkPrefix } },
              select: { checkNo: true }
            });
            let maxSeq = 0;
            for (const c of existingChks) {
              const seq = parseInt(c.checkNo.substring(chkPrefix.length)) || 0;
              if (seq > maxSeq) maxSeq = seq;
            }
            const internalCheckNo = `${chkPrefix}${String(maxSeq + 1).padStart(4, '0')}`;
            const checkNumber = data.checkNo.trim();
            await tx.check.create({
              data: {
                checkNo: internalCheckNo,
                checkType: 'payable',
                checkNumber,
                amount: debitTotal,
                issueDate: data.checkIssueDate,
                dueDate: data.checkDate,
                status: 'pending',
                drawerType: 'company',
                payeeName: template.name || null,
                warehouse: wh,
                sourceAccountId: parseInt(data.checkAccountId),
                paymentId: po.id,
                note: data.checkNote?.trim() ? `費用執行 ${orderNo} - ${data.checkNote.trim()}` : `費用執行 - ${orderNo} (${template.name} ${wh})`,
                createdBy: data.createdBy?.trim() || null,
              }
            });
            await tx.paymentOrder.update({
              where: { id: po.id },
              data: { checkNo: checkNumber }
            });
          }

          const [y, m] = data.expenseMonth.split('-');
          const cat = template?.category?.name || '固定費用';
          const deptWh = wh || '未指定';
          const exDept = await tx.departmentExpense.findFirst({ where: { year: parseInt(y), month: parseInt(m), department: deptWh, category: cat } });
          if (exDept) await tx.departmentExpense.update({ where: { id: exDept.id }, data: { totalAmount: Number(exDept.totalAmount) + debitTotal } });
          else await tx.departmentExpense.create({ data: { year: parseInt(y), month: parseInt(m), department: deptWh, category: cat, tax: 0, totalAmount: debitTotal } });
          const exAgg = await tx.monthlyAggregation.findFirst({ where: { aggregationType: 'expense', year: parseInt(y), month: parseInt(m), warehouse: deptWh } });
          if (exAgg) await tx.monthlyAggregation.update({ where: { id: exAgg.id }, data: { totalAmount: { increment: debitTotal }, recordCount: { increment: 1 } } });
          else await tx.monthlyAggregation.create({ data: { aggregationType: 'expense', year: parseInt(y), month: parseInt(m), warehouse: deptWh, totalAmount: debitTotal, recordCount: 1 } });

          // 借方轉帳/匯款：自動入出納、存簿、現金流（建立 CashTransaction + CashierExecution，付款單改為已執行）
          if (accId && (pm === '轉帳' || pm === '匯款')) {
            const executionDate = data.expenseMonth + '-01';
            const dateStr = executionDate.replace(/-/g, '');
            const execPrefix = `CSH-${dateStr}-`;
            const existingExec = await tx.cashierExecution.findMany({ where: { executionNo: { startsWith: execPrefix } }, select: { executionNo: true } });
            let maxSeq = 0;
            for (const item of existingExec) {
              const seq = parseInt(item.executionNo.substring(execPrefix.length)) || 0;
              if (seq > maxSeq) maxSeq = seq;
            }
            const executionNo = `${execPrefix}${String(maxSeq + 1).padStart(4, '0')}`;
            const txPrefix = `CF-${dateStr}-`;
            const existingTx = await tx.cashTransaction.findMany({ where: { transactionNo: { startsWith: txPrefix } }, select: { transactionNo: true } });
            maxSeq = 0;
            for (const item of existingTx) {
              const seq = parseInt(item.transactionNo.substring(txPrefix.length)) || 0;
              if (seq > maxSeq) maxSeq = seq;
            }
            const transactionNo = `${txPrefix}${String(maxSeq + 1).padStart(4, '0')}`;

            const fixedCatId = await getCategoryId(tx, 'fixed_expense');
            const cashTx = await tx.cashTransaction.create({
              data: {
                transactionNo,
                transactionDate: executionDate,
                type: '支出',
                warehouse: wh,
                accountId: accId,
                categoryId: fixedCatId,
                amount: debitTotal,
                description: `固定費用 - ${orderNo} - ${data.expenseMonth}`,
                sourceType: 'fixed_expense',
                sourceRecordId: po.id,
                paymentNo: orderNo,
                status: '已確認',
              },
            });

            await recalcBalance(tx, accId);

            await tx.cashierExecution.create({
              data: {
                executionNo,
                paymentOrderId: po.id,
                executionDate,
                actualAmount: debitTotal,
                accountId: accId,
                paymentMethod: pm,
                cashTransactionId: cashTx.id,
                status: '已確認',
                executedBy: data.createdBy.trim(),
              },
            });

            await tx.paymentOrder.update({
              where: { id: po.id },
              data: { status: '已執行' },
            });
          }

          // 員工代墊款：付款方式為信用卡或員工代付時，每筆借方分錄各建立一筆 EmployeeAdvance
          const debitLines = whLines.filter(l => l.entryType === 'debit' && l.amount > 0);
          for (const line of debitLines) {
            const lineAdvancedBy = line.advancedBy || whLines[0].advancedBy;
            const linePm = line.paymentMethod || pm;
            if ((linePm === '信用卡' || linePm === '員工代付') && lineAdvancedBy) {
              const advanceNo = await generateNo(tx, 'employeeAdvance', 'ADV');
              await tx.employeeAdvance.create({
                data: {
                  advanceNo,
                  employeeName: lineAdvancedBy,
                  paymentMethod: linePm === '信用卡' ? '信用卡' : '現金',
                  sourceType: 'expense',
                  sourceRecordId: po.id,
                  sourceDescription: `${template.name} — ${whLabel} ${data.expenseMonth}`,
                  expenseName: line.accountingName || template.name || null,
                  summary: line.summary || null,
                  paymentOrderId: po.id,
                  paymentOrderNo: orderNo,
                  amount: line.amount,
                  status: '待結算',
                  warehouse: wh || null,
                  createdBy: data.createdBy?.trim() || null,
                },
              });
            }
          }

          return { recordNo, warehouse: wh, amount: debitTotal };
        });
        if (r) created.push(r);
      }
      if (created.length > 0) {
        await auditFromSession(prisma, auth.session, {
          action: AUDIT_ACTIONS.EXPENSE_CREATE,
          targetModule: 'expense-records',
          afterState: { mode: 'lines', count: created.length, recordNos: created.map(c => c.recordNo) },
          note: `固定費用執行(分錄模式) ${created.length} 筆`,
        });
      }
      return NextResponse.json({ message: `已建立 ${created.length} 筆固定費用記錄`, created, recordNos: created.map(c => c.recordNo) }, { status: 201 });
    }

    if (isBatch) {
      // 多館別一次存檔：每個館別一筆金額，不填借貸方
      const created = [];
      for (const row of data.warehouseAmounts) {
        const wh = (row.warehouse || '').trim();
        const amount = parseFloat(row.amount) || 0;
        if (!wh || amount <= 0) continue;

        const entryLines = buildEntryLinesForAmount(template, amount);
        if (!entryLines) continue;

        const result = await prisma.$transaction(async (tx) => {
          // Duplicate check INSIDE transaction
          const duplicate = await tx.commonExpenseRecord.findFirst({
            where: {
              templateId: parseInt(data.templateId),
              warehouse: wh,
              expenseMonth: data.expenseMonth.trim(),
              executionType: 'fixed',
              status: { not: '已作廢' }
            }
          });
          if (duplicate && !data.allowDuplicate) return null;

          // Enforce period lock
          await assertPeriodOpen(tx, `${data.expenseMonth}-01`, wh);

          const batchPm = data.paymentMethod || '月結';
          const isCreditCardAdvanceBatch = data.creditCardAdvanceMode || ((batchPm === '信用卡' || batchPm === '員工代付') && data.advancedBy);
          const orderNo = await generateNo(tx, 'paymentOrder', 'PAY');
          const paymentOrder = await tx.paymentOrder.create({
            data: {
              orderNo,
              invoiceIds: [],
              supplierId: data.supplierId ? parseInt(data.supplierId) : null,
              supplierName: data.supplierName || null,
              warehouse: wh,
              paymentMethod: batchPm,
              amount,
              discount: 0,
              netAmount: amount,
              dueDate: data.dueDate || null,
              summary: `${template.name} — ${wh} ${data.expenseMonth}`,
              note: data.note || null,
              status: isCreditCardAdvanceBatch ? '已代墊' : '待出納',
              createdBy: data.createdBy.trim(),
              sourceType: 'fixed_expense'
            }
          });

          const recordNo = await generateNo(tx, 'commonExpenseRecord', 'EXP');
          const record = await tx.commonExpenseRecord.create({
            data: {
              recordNo,
              templateId: parseInt(data.templateId),
              executionType: 'fixed',
              warehouse: wh,
              expenseMonth: data.expenseMonth.trim(),
              supplierId: data.supplierId ? parseInt(data.supplierId) : null,
              supplierName: data.supplierName || null,
              paymentMethod: data.paymentMethod || '月結',
              totalDebit: amount,
              totalCredit: amount,
              paymentOrderId: paymentOrder.id,
              paymentOrderNo: orderNo,
              status: '已確認',
              confirmedBy: data.createdBy.trim(),
              confirmedAt: new Date(),
              note: data.note || null,
              createdBy: data.createdBy.trim(),
              entryLines: {
                create: entryLines.map((line, idx) => ({
                  entryType: line.entryType,
                  accountingCode: line.accountingCode,
                  accountingName: line.accountingName,
                  summary: line.summary || '',
                  amount: line.amount,
                  sortOrder: line.sortOrder ?? idx
                }))
              }
            }
          });

          const [yearStr, monthStr] = data.expenseMonth.split('-');
          const year = parseInt(yearStr);
          const month = parseInt(monthStr);
          const category = template?.category?.name || '固定費用';

          const existingDept = await tx.departmentExpense.findFirst({
            where: { year, month, department: wh, category }
          });
          if (existingDept) {
            await tx.departmentExpense.update({
              where: { id: existingDept.id },
              data: { totalAmount: Number(existingDept.totalAmount) + amount }
            });
          } else {
            await tx.departmentExpense.create({
              data: { year, month, department: wh, category, tax: 0, totalAmount: amount }
            });
          }

          const existingAgg = await tx.monthlyAggregation.findFirst({
            where: { aggregationType: 'expense', year, month, warehouse: wh }
          });
          if (existingAgg) {
            await tx.monthlyAggregation.update({
              where: { id: existingAgg.id },
              data: { totalAmount: { increment: amount }, recordCount: { increment: 1 } }
            });
          } else {
            await tx.monthlyAggregation.create({
              data: { aggregationType: 'expense', year, month, warehouse: wh, totalAmount: amount, recordCount: 1 }
            });
          }

          // 員工代墊款
          if ((batchPm === '信用卡' || batchPm === '員工代付') && data.advancedBy) {
            const advanceNo = await generateNo(tx, 'employeeAdvance', 'ADV');
            await tx.employeeAdvance.create({
              data: {
                advanceNo,
                employeeName: data.advancedBy,
                paymentMethod: batchPm === '信用卡' ? '信用卡' : '現金',
                sourceType: 'expense',
                sourceRecordId: paymentOrder.id,
                sourceDescription: `${template.name} — ${wh} ${data.expenseMonth}`,
                expenseName: template.name || null,
                paymentOrderId: paymentOrder.id,
                paymentOrderNo: orderNo,
                amount,
                status: '待結算',
                warehouse: wh,
                createdBy: data.createdBy?.trim() || null,
              },
            });
          }

          return { recordNo, warehouse: wh, amount };
        });
        if (result) created.push(result);
      }

      if (created.length > 0) {
        await auditFromSession(prisma, auth.session, {
          action: AUDIT_ACTIONS.EXPENSE_CREATE,
          targetModule: 'expense-records',
          afterState: { mode: 'batch', count: created.length, recordNos: created.map(c => c.recordNo) },
          note: `固定費用執行(批次模式) ${created.length} 筆`,
        });
      }
      return NextResponse.json({
        message: `已建立 ${created.length} 筆固定費用記錄`,
        created,
        recordNos: created.map(c => c.recordNo)
      }, { status: 201 });
    }

    // 單一館別 + 手動借貸方
    if (!data.warehouse?.trim()) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請選擇館別', 400);
    }
    if (!data.entryLines || data.entryLines.length === 0) {
      return createErrorResponse('VALIDATION_FAILED', '請至少新增一筆分錄', 400);
    }

    const debitTotal = data.entryLines
      .filter(l => l.entryType === 'debit')
      .reduce((sum, l) => sum + (parseFloat(l.amount) || 0), 0);
    let creditTotal = data.entryLines
      .filter(l => l.entryType === 'credit')
      .reduce((sum, l) => sum + (parseFloat(l.amount) || 0), 0);

    if (debitTotal <= 0) {
      return createErrorResponse('VALIDATION_FAILED', '金額必須大於 0', 400);
    }
    // 若只有借方（無貸方），自動用範本預設貸方科目補上
    if (creditTotal === 0 && debitTotal > 0) {
      data.entryLines.push({
        entryType: 'credit',
        accountingCode: template.defaultCreditCode || '1111',
        accountingName: template.defaultCreditName || '現金',
        summary: template.name || '',
        amount: debitTotal,
        sortOrder: data.entryLines.length
      });
      creditTotal = debitTotal;
    }
    if (Math.abs(debitTotal - creditTotal) > 0.01) {
      return createErrorResponse('VALIDATION_FAILED',
        `借貸不平衡：借方 ${debitTotal.toFixed(2)} ≠ 貸方 ${creditTotal.toFixed(2)}`, 400);
    }

    const result = await prisma.$transaction(async (tx) => {
      // Duplicate check INSIDE transaction
      const duplicate = await tx.commonExpenseRecord.findFirst({
        where: {
          templateId: parseInt(data.templateId),
          warehouse: data.warehouse.trim(),
          expenseMonth: data.expenseMonth.trim(),
          executionType: 'fixed',
          status: { not: '已作廢' }
        }
      });
      if (duplicate && !data.allowDuplicate) {
        throw new Error(`DUPLICATE:此範本在 ${data.warehouse} ${data.expenseMonth} 已有記錄 (${duplicate.recordNo})，確定要再新增嗎？`);
      }

      // Enforce period lock
      await assertPeriodOpen(tx, `${data.expenseMonth}-01`, data.warehouse?.trim());

      // 1. Create PaymentOrder
      const singlePm = data.paymentMethod || '月結';
      const isCreditCardAdvanceSingle = data.creditCardAdvanceMode || ((singlePm === '信用卡' || singlePm === '員工代付') && data.advancedBy);
      const orderNo = await generateNo(tx, 'paymentOrder', 'PAY');
      const paymentOrder = await tx.paymentOrder.create({
        data: {
          orderNo,
          invoiceIds: [],
          supplierId: data.supplierId ? parseInt(data.supplierId) : null,
          supplierName: data.supplierName || null,
          warehouse: data.warehouse.trim(),
          paymentMethod: singlePm,
          amount: debitTotal,
          discount: 0,
          netAmount: debitTotal,
          dueDate: data.dueDate || null,
          summary: `${template.name} — ${data.warehouse.trim()} ${data.expenseMonth}`,
          note: data.note || null,
          status: isCreditCardAdvanceSingle ? '已代墊' : '待出納',
          createdBy: data.createdBy.trim(),
          sourceType: 'fixed_expense'
        }
      });

      // 2. Create CommonExpenseRecord
      const recordNo = await generateNo(tx, 'commonExpenseRecord', 'EXP');
      const record = await tx.commonExpenseRecord.create({
        data: {
          recordNo,
          templateId: parseInt(data.templateId),
          executionType: 'fixed',
          warehouse: data.warehouse.trim(),
          expenseMonth: data.expenseMonth.trim(),
          supplierId: data.supplierId ? parseInt(data.supplierId) : null,
          supplierName: data.supplierName || null,
          paymentMethod: data.paymentMethod || '月結',
          totalDebit: debitTotal,
          totalCredit: creditTotal,
          paymentOrderId: paymentOrder.id,
          paymentOrderNo: orderNo,
          status: '已確認',
          confirmedBy: data.createdBy.trim(),
          confirmedAt: new Date(),
          note: data.note || null,
          createdBy: data.createdBy.trim(),
          entryLines: {
            create: data.entryLines.map((line, idx) => ({
              entryType: line.entryType,
              accountingCode: line.accountingCode,
              accountingName: line.accountingName,
              summary: line.summary || '',
              amount: parseFloat(line.amount),
              sortOrder: line.sortOrder ?? idx
            }))
          }
        },
        include: {
          template: { select: { id: true, name: true } },
          entryLines: { orderBy: { sortOrder: 'asc' } }
        }
      });

      // 3. Sync DepartmentExpense
      const [yearStr, monthStr] = data.expenseMonth.split('-');
      const year = parseInt(yearStr);
      const month = parseInt(monthStr);

      const template = await tx.commonExpenseTemplate.findUnique({
        where: { id: parseInt(data.templateId) },
        include: { category: { select: { name: true } } }
      });
      const category = template?.category?.name || '固定費用';

      const existingDept = await tx.departmentExpense.findFirst({
        where: { year, month, department: data.warehouse.trim(), category }
      });

      if (existingDept) {
        await tx.departmentExpense.update({
          where: { id: existingDept.id },
          data: { totalAmount: Number(existingDept.totalAmount) + debitTotal }
        });
      } else {
        await tx.departmentExpense.create({
          data: { year, month, department: data.warehouse.trim(), category, tax: 0, totalAmount: debitTotal }
        });
      }

      // 4. Sync MonthlyAggregation
      const existingAgg = await tx.monthlyAggregation.findFirst({
        where: { aggregationType: 'expense', year, month, warehouse: data.warehouse.trim() }
      });

      if (existingAgg) {
        await tx.monthlyAggregation.update({
          where: { id: existingAgg.id },
          data: {
            totalAmount: { increment: debitTotal },
            recordCount: { increment: 1 }
          }
        });
      } else {
        await tx.monthlyAggregation.create({
          data: {
            aggregationType: 'expense',
            year, month,
            warehouse: data.warehouse.trim(),
            totalAmount: debitTotal,
            recordCount: 1
          }
        });
      }

      // 員工代墊款：付款方式為信用卡或員工代付
      if ((singlePm === '信用卡' || singlePm === '員工代付') && data.advancedBy) {
        const advanceNo = await generateNo(tx, 'employeeAdvance', 'ADV');
        await tx.employeeAdvance.create({
          data: {
            advanceNo,
            employeeName: data.advancedBy,
            paymentMethod: singlePm === '信用卡' ? '信用卡' : '現金',
            sourceType: 'expense',
            sourceRecordId: paymentOrder.id,
            sourceDescription: `${template?.name || '費用'} — ${data.warehouse.trim()} ${data.expenseMonth}`,
            expenseName: template?.name || null,
            paymentOrderId: paymentOrder.id,
            paymentOrderNo: orderNo,
            amount: debitTotal,
            status: '待結算',
            warehouse: data.warehouse.trim(),
            createdBy: data.createdBy?.trim() || null,
          },
        });
      }

      return {
        record,
        paymentOrderNo: orderNo,
        totalAmount: debitTotal
      };
    });

    await auditFromSession(prisma, auth.session, {
      action: AUDIT_ACTIONS.EXPENSE_CREATE,
      targetModule: 'expense-records',
      targetRecordNo: result.record.recordNo,
      afterState: { mode: 'single', recordNo: result.record.recordNo, warehouse: data.warehouse, totalAmount: result.totalAmount, paymentOrderNo: result.paymentOrderNo },
      note: `固定費用執行(單筆) ${result.record.recordNo}`,
    });

    return NextResponse.json({
      ...result.record,
      totalDebit: Number(result.record.totalDebit),
      totalCredit: Number(result.record.totalCredit),
      entryLines: result.record.entryLines.map(l => ({ ...l, amount: Number(l.amount) })),
      createdAt: result.record.createdAt.toISOString(),
      updatedAt: result.record.updatedAt.toISOString(),
      confirmedAt: result.record.confirmedAt?.toISOString() || null,
      linkedPaymentOrderNo: result.paymentOrderNo,
      totalAmount: result.totalAmount
    }, { status: 201 });
  } catch (error) {
    if (error.message?.startsWith('DUPLICATE:')) {
      return createErrorResponse('CONFLICT_UNIQUE', error.message.replace('DUPLICATE:', ''), 409, { duplicate: true });
    }
    return handleApiError(error);
  }
}
