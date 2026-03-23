/**
 * 館別損益表（pnl-by-warehouse）與 drilldown 共用邏輯，確保篩選與科目鍵一致。
 */

/**
 * @param {object} tx - Prisma CashTransaction 含 category.accountingSubject
 * @returns {{ code: string|null, name: string, category: string|null, subcategory: string|null }}
 */
export function getPnlSubjectMeta(tx) {
  const sub = tx.category?.accountingSubject;
  if (sub) {
    return {
      code: sub.code,
      name: sub.name,
      category: sub.category,
      subcategory: sub.subcategory,
    };
  }
  if (tx.category?.name) {
    return { code: null, name: tx.category.name, category: null, subcategory: null };
  }
  if (tx.accountingSubject) {
    return { code: null, name: tx.accountingSubject, category: null, subcategory: null };
  }
  return { code: null, name: '未對應會計科目', category: null, subcategory: null };
}

/**
 * 與 API 彙總邏輯相同：有 code 用 code，否則用 name
 */
export function getPnlSubjectKey(tx) {
  const subject = getPnlSubjectMeta(tx);
  return subject.code ? subject.code : subject.name;
}

/**
 * @param {string} startDate
 * @param {string} endDate
 * @param {string|null} warehouse
 */
export function buildPnlCashflowWhere(startDate, endDate, warehouse) {
  const where = {
    transactionDate: { gte: startDate, lte: endDate },
    type: { in: ['收入', '支出'] },
    isReversal: false,
  };
  if (warehouse) where.warehouse = warehouse;
  return where;
}
