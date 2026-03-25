import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { createErrorResponse } from '@/lib/error-handler';
import { PERMISSIONS, hasAnyPermission, hasPermission } from '@/lib/permissions';
import { assertWarehouseAccess, applyWarehouseFilter } from '@/lib/warehouse-access';

const MODULE_VIEW_PERMISSIONS = {
  purchasing: PERMISSIONS.PURCHASING_VIEW,
  sales: PERMISSIONS.SALES_VIEW,
  finance: PERMISSIONS.FINANCE_VIEW,
  cashier: PERMISSIONS.CASHIER_VIEW,
  inventory: PERMISSIONS.INVENTORY_VIEW,
  analytics: PERMISSIONS.ANALYTICS_VIEW,
  cashflow: PERMISSIONS.CASHFLOW_VIEW,
  'pms-income': PERMISSIONS.PMS_VIEW,
  pms: PERMISSIONS.PMS_VIEW,
  loans: PERMISSIONS.LOAN_VIEW,
  checks: PERMISSIONS.CHECK_VIEW,
  reconciliation: PERMISSIONS.RECONCILIATION_VIEW,
  rentals: PERMISSIONS.RENTAL_VIEW,
  'month-end': PERMISSIONS.MONTHEND_VIEW,
  'year-end': PERMISSIONS.YEAREND_VIEW,
  expenses: PERMISSIONS.EXPENSE_VIEW,
  engineering: PERMISSIONS.ENGINEERING_VIEW,
  engineering_contract: PERMISSIONS.ENGINEERING_VIEW,
  settings: PERMISSIONS.SETTINGS_VIEW,
  backup: PERMISSIONS.BACKUP_VIEW,
  notifications: PERMISSIONS.NOTIFICATION_VIEW,
};

export async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { ok: false, response: createErrorResponse('UNAUTHORIZED', '請先登入', 401) };
  }
  return { ok: true, session };
}

export function isAdmin(session) {
  return session?.user?.role === 'admin' || (session?.user?.permissions || []).includes('*');
}

export async function requirePermission(permission) {
  const auth = await requireSession();
  if (!auth.ok) return auth;

  // admin role always bypasses all permission checks
  if (isAdmin(auth.session)) return auth;

  const permissions = auth.session.user.permissions || [];
  if (!hasPermission(permissions, permission)) {
    return { ok: false, response: createErrorResponse('FORBIDDEN', '權限不足', 403) };
  }
  return auth;
}

export async function requireAnyPermission(permissionsToCheck) {
  const auth = await requireSession();
  if (!auth.ok) return auth;

  // admin role always bypasses all permission checks
  if (isAdmin(auth.session)) return auth;

  const permissions = auth.session.user.permissions || [];
  if (!hasAnyPermission(permissions, permissionsToCheck)) {
    return { ok: false, response: createErrorResponse('FORBIDDEN', '權限不足', 403) };
  }
  return auth;
}

export async function requireModuleViewPermission(sourceModule) {
  const auth = await requireSession();
  if (!auth.ok) return auth;

  // admin role always bypasses all permission checks
  if (isAdmin(auth.session)) return auth;

  const required = MODULE_VIEW_PERMISSIONS[sourceModule];
  if (!required) {
    return { ok: false, response: createErrorResponse('FORBIDDEN', '無法存取此模組附件', 403) };
  }

  const permissions = auth.session.user.permissions || [];
  if (!hasPermission(permissions, required)) {
    return { ok: false, response: createErrorResponse('FORBIDDEN', '權限不足', 403) };
  }
  return auth;
}

/**
 * Combined permission + warehouse access check for single-record operations.
 * Prevents developers from forgetting the warehouse check on GET-by-ID, PUT, DELETE.
 *
 * @param {string} permission - Required permission code
 * @param {string|null} recordWarehouse - The warehouse value on the record being accessed
 * @returns {{ ok: true, session } | { ok: false, response }}
 */
export async function requirePermissionWithWarehouse(permission, recordWarehouse) {
  const auth = await requirePermission(permission);
  if (!auth.ok) return auth;

  if (recordWarehouse) {
    const wCheck = assertWarehouseAccess(auth.session, recordWarehouse);
    if (!wCheck.ok) return wCheck;
  }
  return auth;
}

/**
 * Combined permission + warehouse filter for list queries.
 * Applies warehouse restriction to the Prisma `where` clause automatically.
 *
 * @param {string} permission - Required permission code
 * @param {object} where - Prisma where clause (mutated in place)
 * @param {string} [field='warehouse'] - The warehouse field name
 * @returns {{ ok: true, session } | { ok: false, response }}
 */
export async function requirePermissionWithWarehouseFilter(permission, where, field = 'warehouse') {
  const auth = await requirePermission(permission);
  if (!auth.ok) return auth;

  const wf = applyWarehouseFilter(auth.session, where, field);
  if (!wf.ok) return wf;
  return auth;
}
