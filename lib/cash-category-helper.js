/**
 * Helper to resolve CashCategory ID from sourceType.
 * Maps each transaction sourceType to the corresponding system category systemCode.
 */

// sourceType → systemCode mapping
const SOURCE_TYPE_TO_SYSTEM_CODE = {
  // Cashier
  cashier_payment: 'CASHIER_PAY',
  // Loans
  loan_principal: 'LOAN_PRINCIPAL',
  loan_interest: 'LOAN_INTEREST',
  // Rentals
  rental_income: 'RENTAL_INCOME',
  rental_deposit_in: 'RENTAL_DEPOSIT_IN',
  rental_deposit_out: 'RENTAL_DEPOSIT_OUT',
  rental_maintenance: 'RENTAL_MAINTENANCE',
  rental_tax: 'RENTAL_TAX',
  // Expenses
  fixed_expense: 'FIXED_EXPENSE',
  common_expense: 'PURCHASE_EXPENSE',
  purchase_expense: 'PURCHASE_EXPENSE',
  // Checks
  check_payment: 'CHECK_CLEAR',
  check_receipt: 'CHECK_RECEIPT',
  check_bounce: 'CHECK_CLEAR',
  // Cash count
  cash_count_adjustment: 'CASH_COUNT_SURPLUS',
  cash_count_shortage: 'CASH_COUNT_SHORTAGE',
  // PMS
  pms_income_settlement: 'PMS_REVENUE',
  pms_income_fee: 'PMS_FEE',
  pms_manual_commission: 'PMS_COMMISSION',
  // Reversal
  reversal: 'REVERSAL',
  // Reconciliation
  reconciliation_adjustment: 'MISC_EXPENSE',
};

// In-memory cache: systemCode → categoryId
let categoryCache = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60000; // 1 minute

/**
 * Load all system categories into cache.
 * @param {object} prismaClient - Prisma client or transaction instance
 */
async function loadCache(prismaClient) {
  const now = Date.now();
  if (categoryCache && (now - cacheTimestamp) < CACHE_TTL) return;

  const categories = await prismaClient.cashCategory.findMany({
    where: { isSystemDefault: true, isActive: true },
    select: { id: true, systemCode: true },
  });

  categoryCache = {};
  for (const cat of categories) {
    if (cat.systemCode) {
      categoryCache[cat.systemCode] = cat.id;
    }
  }
  cacheTimestamp = now;
}

/**
 * Get categoryId for a given sourceType.
 * @param {object} prismaClient - Prisma client or transaction instance
 * @param {string} sourceType - The transaction sourceType
 * @returns {Promise<number|null>} categoryId or null
 */
export async function getCategoryId(prismaClient, sourceType) {
  if (!sourceType) return null;

  const systemCode = SOURCE_TYPE_TO_SYSTEM_CODE[sourceType];
  if (!systemCode) return null;

  await loadCache(prismaClient);
  return categoryCache[systemCode] || null;
}

/**
 * Get categoryId by explicit systemCode.
 * @param {object} prismaClient - Prisma client or transaction instance
 * @param {string} systemCode - The system code (e.g. 'LOAN_PRINCIPAL')
 * @returns {Promise<number|null>} categoryId or null
 */
export async function getCategoryIdByCode(prismaClient, systemCode) {
  if (!systemCode) return null;

  await loadCache(prismaClient);
  return categoryCache[systemCode] || null;
}

/**
 * Invalidate the cache (e.g. after adding new categories).
 */
export function invalidateCategoryCache() {
  categoryCache = null;
  cacheTimestamp = 0;
}
