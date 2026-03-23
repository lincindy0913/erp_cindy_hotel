/**
 * Warehouse-level access control (IDOR/BOLA prevention)
 *
 * Uses session.user.warehouseRestriction:
 *   - null / '' → unrestricted (all warehouses)
 *   - '麗格' / '麗軒' / '民宿' → restricted to that warehouse only
 *
 * Admin users (role='admin' or permissions=['*']) always bypass restrictions.
 */

import { isAdmin } from '@/lib/api-auth';
import { createErrorResponse } from '@/lib/error-handler';

/**
 * Get the allowed warehouse for this session.
 * Returns null if unrestricted, or a warehouse string if restricted.
 */
export function getAllowedWarehouse(session) {
  if (isAdmin(session)) return null;
  const restriction = session?.user?.warehouseRestriction;
  return restriction || null;
}

/**
 * Apply warehouse filtering to a Prisma `where` clause.
 * If the user is restricted, forces the warehouse field to match their restriction.
 * If the user already specified a warehouse filter, validates it matches their restriction.
 *
 * @param {object} session - NextAuth session
 * @param {object} where - Prisma where clause (mutated in place)
 * @param {string} [field='warehouse'] - The warehouse field name in the model
 * @returns {{ ok: true } | { ok: false, response: Response }}
 */
export function applyWarehouseFilter(session, where, field = 'warehouse') {
  const allowed = getAllowedWarehouse(session);
  if (!allowed) return { ok: true }; // unrestricted

  // If the user requested a specific warehouse, verify it matches
  if (where[field] && where[field] !== allowed) {
    return {
      ok: false,
      response: createErrorResponse('FORBIDDEN', '無權存取此館別資料', 403),
    };
  }

  where[field] = allowed;
  return { ok: true };
}

/**
 * Assert that a record's warehouse matches the user's allowed warehouse.
 * Use this for GET-by-ID, PUT, DELETE on records with a warehouse field.
 *
 * @param {object} session - NextAuth session
 * @param {string} recordWarehouse - The warehouse value on the record
 * @returns {{ ok: true } | { ok: false, response: Response }}
 */
export function assertWarehouseAccess(session, recordWarehouse) {
  const allowed = getAllowedWarehouse(session);
  if (!allowed) return { ok: true }; // unrestricted

  if (recordWarehouse !== allowed) {
    return {
      ok: false,
      response: createErrorResponse('FORBIDDEN', '無權存取此館別資料', 403),
    };
  }
  return { ok: true };
}

/**
 * For models related to CashAccount (e.g., CashTransaction, BankReconciliation),
 * get the list of account IDs the user can access based on warehouse restriction.
 * Returns null if unrestricted.
 *
 * @param {object} prisma - Prisma client
 * @param {object} session - NextAuth session
 * @returns {Promise<number[]|null>} Array of allowed account IDs, or null if unrestricted
 */
export async function getAllowedAccountIds(prisma, session) {
  const allowed = getAllowedWarehouse(session);
  if (!allowed) return null;

  const accounts = await prisma.cashAccount.findMany({
    where: { warehouse: allowed },
    select: { id: true },
  });
  return accounts.map(a => a.id);
}
