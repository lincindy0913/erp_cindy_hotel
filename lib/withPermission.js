import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { hasPermission } from './permissions';
import { createErrorResponse } from './error-handler';

/**
 * 檢查 API 請求是否具有指定權限
 * @param {string} requiredPermission - 所需權限字串 (e.g. 'purchasing.create')
 * @returns {Promise<{authorized: boolean, session?: object, response?: NextResponse}>}
 */
export async function checkPermission(requiredPermission) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return { authorized: false, response: createErrorResponse('UNAUTHORIZED', '請先登入', 401) };
  }
  const permissions = session.user.permissions || [];
  if (!hasPermission(permissions, requiredPermission)) {
    return { authorized: false, response: createErrorResponse('FORBIDDEN', '權限不足', 403) };
  }
  return { authorized: true, session };
}

/**
 * 檢查 API 請求是否具有任一指定權限
 * @param {string[]} requiredPermissions - 所需權限字串陣列
 * @returns {Promise<{authorized: boolean, session?: object, response?: NextResponse}>}
 */
export async function checkAnyPermission(requiredPermissions) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return { authorized: false, response: createErrorResponse('UNAUTHORIZED', '請先登入', 401) };
  }
  const permissions = session.user.permissions || [];
  // admin wildcard
  if (permissions.includes('*')) {
    return { authorized: true, session };
  }
  const hasAny = requiredPermissions.some(p => permissions.includes(p));
  if (!hasAny) {
    return { authorized: false, response: createErrorResponse('FORBIDDEN', '權限不足', 403) };
  }
  return { authorized: true, session };
}
