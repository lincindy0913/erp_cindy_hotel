/**
 * Shared P&L classification constants.
 * Used by: generate-month-end-reports.js, reports/profit-loss/route.js
 */

// Sort order for P&L level1 groups (lower = earlier in report)
export const PL_LEVEL1_ORDER = { '收入': 1, '費用': 2, '業外': 3 };

// Fallback plGroup when a transaction's category has no plGroup set
export const PL_UNCLASSIFIED_INCOME  = '未分類收入';
export const PL_UNCLASSIFIED_EXPENSE = '未分類費用';

// Fallback level1 when a transaction's category has no level1 set
export const PL_LEVEL1_INCOME  = '收入';
export const PL_LEVEL1_EXPENSE = '費用';
export const PL_LEVEL1_OTHER   = '業外';

// The plGroup that represents credit card processing fees (excluded from operating expenses)
export const PL_COST_GROUP = '收款成本';
