/**
 * Race-condition-safe sequence number generator.
 *
 * Uses SELECT FOR UPDATE on the matching rows to serialize concurrent
 * sequence generation within the same Prisma transaction.
 * Falls back to the existing findMany approach if raw query fails.
 *
 * Usage (inside a Prisma $transaction):
 *   const no = await nextSequence(tx, 'cashierExecution', 'executionNo', 'CSH-20260325-');
 *   // → 'CSH-20260325-0001'
 */

// Explicit model name → actual PostgreSQL table name (from @@map in schema.prisma)
// camelToSnake is insufficient because all tables use plural form via @@map
const MODEL_TABLE_MAP = {
  cashTransaction:     'cash_transactions',
  cashierExecution:    'cashier_executions',
  paymentOrder:        'payment_orders',
  check:               'checks',
  expense:             'expenses',
  purchaseMaster:      'purchase_masters',
  salesMaster:         'sales_masters',
  loanMonthlyRecord:   'loan_monthly_records',
  inventoryTransfer:   'inventory_transfers',
  inventoryRequisition:'inventory_requisitions',
  stockCount:          'stock_counts',
  cashCount:           'cash_denominations',
  pmsIncomeRecord:     'pms_income_records',
  rentalIncome:        'rental_incomes',
  purchaseAllowance:   'purchase_allowances',
  commonExpenseRecord: 'common_expense_records',
  employeeAdvance:     'employee_advances',
};

const ALLOWED_TABLES = new Set(Object.keys(MODEL_TABLE_MAP));

const ALLOWED_COLUMNS = new Set([
  'transactionNo', 'executionNo', 'orderNo', 'checkNo',
  'invoiceNo', 'purchaseNo', 'salesNo', 'transferNo',
  'requisitionNo', 'countNo', 'recordNo', 'allowanceNo', 'advanceNo',
]);

/**
 * Generate the next sequence number for a given prefix, with row-level locking.
 *
 * @param {import('@prisma/client').Prisma.TransactionClient} tx - Prisma transaction client
 * @param {string} tableName - Prisma model name in camelCase (e.g. 'cashierExecution')
 * @param {string} columnName - The column holding the sequence number (e.g. 'executionNo')
 * @param {string} prefix - The prefix to match (e.g. 'CSH-20260325-')
 * @param {number} padWidth - Width to pad the sequence number (default: 4)
 * @returns {Promise<string>} The next sequence number (e.g. 'CSH-20260325-0001')
 */
async function nextSequence(tx, tableName, columnName, prefix, padWidth = 4) {
  // Validate table/column names against whitelist to prevent SQL injection
  if (!ALLOWED_TABLES.has(tableName)) {
    throw new Error(`[sequence-generator] 不允許的表名: ${tableName}`);
  }
  if (!ALLOWED_COLUMNS.has(columnName)) {
    throw new Error(`[sequence-generator] 不允許的欄位名: ${columnName}`);
  }

  // Resolve actual PostgreSQL table name from the explicit map
  const snakeTable = MODEL_TABLE_MAP[tableName];
  const snakeColumn = camelToSnake(columnName);

  try {
    // Use FOR UPDATE to lock matching rows and prevent concurrent reads
    const rows = await tx.$queryRawUnsafe(
      `SELECT "${snakeColumn}" FROM "${snakeTable}" WHERE "${snakeColumn}" LIKE $1 FOR UPDATE`,
      `${prefix}%`
    );

    let maxSeq = 0;
    for (const row of rows) {
      const val = row[snakeColumn] || row[columnName]; // handle both snake and camel
      if (!val) continue;
      const seq = parseInt(val.substring(prefix.length), 10) || 0;
      if (seq > maxSeq) maxSeq = seq;
    }

    return `${prefix}${String(maxSeq + 1).padStart(padWidth, '0')}`;
  } catch (err) {
    // Fallback: use Prisma findMany (original approach, no locking)
    console.warn(`[sequence-generator] FOR UPDATE failed for ${tableName}.${columnName}, using fallback:`, err.message);
    return nextSequenceFallback(tx, tableName, columnName, prefix, padWidth);
  }
}

/**
 * Fallback: use Prisma findMany (no row locking, original behavior)
 */
async function nextSequenceFallback(tx, tableName, columnName, prefix, padWidth = 4) {
  const model = tx[tableName];
  if (!model) throw new Error(`Unknown model: ${tableName}`);

  const existing = await model.findMany({
    where: { [columnName]: { startsWith: prefix } },
    select: { [columnName]: true },
  });

  let maxSeq = 0;
  for (const item of existing) {
    const seq = parseInt(item[columnName].substring(prefix.length), 10) || 0;
    if (seq > maxSeq) maxSeq = seq;
  }

  return `${prefix}${String(maxSeq + 1).padStart(padWidth, '0')}`;
}

function camelToSnake(str) {
  // e.g. cashierExecution → cashier_execution, executionNo → execution_no
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/**
 * Convenience: generate next CashTransaction number CF-YYYYMMDD-XXXX.
 * @param {*} tx - Prisma transaction client
 * @param {string} date - Date string (YYYY-MM-DD)
 */
async function nextCashTransactionNo(tx, date) {
  const dateStr = (date || new Date().toISOString().split('T')[0]).replace(/-/g, '');
  const prefix = `CF-${dateStr}-`;
  return nextSequence(tx, 'cashTransaction', 'transactionNo', prefix, 4);
}

module.exports = { nextSequence, nextCashTransactionNo };
