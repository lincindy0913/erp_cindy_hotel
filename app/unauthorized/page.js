'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { ROLE_LABELS, ROLE_COLORS } from '@/lib/permissions';

const ROLE_GUIDE = [
  { code: 'admin',     label: '系統管理員', modules: '所有功能 + 使用者管理', color: 'bg-red-100 text-red-800' },
  { code: 'manager',  label: '主管',       modules: '進貨、發票、付款、月結、分析（大部分唯讀+執行）', color: 'bg-blue-100 text-blue-800' },
  { code: 'finance',  label: '財務',       modules: '發票、付款、現金流、PMS、月結、對帳', color: 'bg-indigo-100 text-indigo-800' },
  { code: 'cashier',  label: '出納',       modules: '付款執行、支票、現金帳戶、現金盤點', color: 'bg-amber-100 text-amber-800' },
  { code: 'purchasing', label: '採購',     modules: '進貨、庫存、發票登錄、工程', color: 'bg-orange-100 text-orange-800' },
  { code: 'viewer',   label: '檢視者',     modules: '大部分頁面唯讀，無法新增或修改', color: 'bg-gray-100 text-gray-700' },
];

const PERMISSION_LABELS = {
  'admin_role':          '系統管理員角色',
  'sales.view':          '發票登錄（sales.view）',
  'owner_expense.view':  '業主私帳（owner_expense.view）',
  'purchasing.view':     '進貨（purchasing.view）',
  'finance.view':        '財務付款（finance.view）',
  'cashier.view':        '出納（cashier.view）',
  'inventory.view':      '庫存（inventory.view）',
  'cashflow.view':       '現金流（cashflow.view）',
  'pms.view':            'PMS 收入（pms.view）',
  'loan.view':           '貸款（loan.view）',
  'check.view':          '支票（check.view）',
  'reconciliation.view': '存簿對帳（reconciliation.view）',
  'rental.view':         '租屋管理（rental.view）',
  'asset.view':          '資產管理（asset.view）',
  'engineering.view':    '工程管理（engineering.view）',
  'monthend.view':       '月結作業（monthend.view）',
  'yearend.view':        '年結（yearend.view）',
  'expense.view':        '費用管理（expense.view）',
  'analytics.view':      '分析報表（analytics.view）',
  'bnb.view':            '民宿帳（bnb.view）',
  'settings.view':       '系統設定（settings.view）',
  'audit.view':          '稽核日誌（audit.view）',
};

function UnauthorizedContent() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const neededPermission = searchParams.get('need');
  const permissionLabel = neededPermission ? (PERMISSION_LABELS[neededPermission] || neededPermission) : null;

  const userRoles = session?.user?.roles || [];

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-rose-100">
      <div className="bg-white p-8 rounded-xl shadow-xl text-center max-w-md w-full mx-4">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-red-600 mb-2">權限不足</h1>
        <p className="text-gray-600 mb-4">您目前的角色沒有此功能的存取權限</p>

        {/* 顯示缺少的權限 */}
        {permissionLabel && (
          <div className="mb-5 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-left">
            <p className="text-xs text-amber-700 font-semibold mb-1">需要的權限</p>
            <p className="text-sm text-amber-900 font-mono">{permissionLabel}</p>
            <p className="text-xs text-amber-600 mt-2">
              請將此資訊提供給管理員，由管理員在「使用者管理」中開通。
            </p>
          </div>
        )}

        {session && (
          <div className="mb-5 text-sm text-gray-500 space-y-1">
            <p>目前登入：{session.user?.name}（{session.user?.email}）</p>
            {userRoles.length > 0 && (
              <div className="flex justify-center gap-1 mt-1.5 flex-wrap">
                {userRoles.map(code => {
                  const colorClass = ROLE_COLORS[code] || 'bg-gray-100 text-gray-800';
                  return (
                    <span key={code} className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${colorClass}`}>
                      {ROLE_LABELS[code] || code}
                    </span>
                  );
                })}
              </div>
            )}
            <p className="text-gray-400 text-xs mt-2">
              如需開通權限，請聯繫系統管理員並告知上方需要的權限代碼。
            </p>
          </div>
        )}

        <div className="flex gap-3 justify-center">
          <Link
            href="/"
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm"
          >
            返回首頁
          </Link>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition text-sm"
          >
            重新登入
          </button>
        </div>

        {/* 角色對照表 */}
        <details className="mt-5 text-left">
          <summary className="text-xs text-gray-400 hover:text-gray-600 cursor-pointer select-none">
            各角色可操作功能對照表 ▾
          </summary>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left px-3 py-2 border border-gray-200 font-medium text-gray-600">角色</th>
                  <th className="text-left px-3 py-2 border border-gray-200 font-medium text-gray-600">代碼</th>
                  <th className="text-left px-3 py-2 border border-gray-200 font-medium text-gray-600">主要可操作模組</th>
                </tr>
              </thead>
              <tbody>
                {ROLE_GUIDE.map(r => (
                  <tr key={r.code} className="hover:bg-gray-50">
                    <td className="px-3 py-2 border border-gray-200">
                      <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${r.color}`}>{r.label}</span>
                    </td>
                    <td className="px-3 py-2 border border-gray-200 font-mono text-gray-500">{r.code}</td>
                    <td className="px-3 py-2 border border-gray-200 text-gray-600">{r.modules}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-gray-400">
            管理員可在「使用者管理」→「編輯使用者」中調整角色。
          </p>
        </details>

        <div className="mt-3">
          <Link href="/manual#二十二系統管理" target="_blank" className="text-xs text-gray-400 hover:text-blue-500 underline">
            查看使用說明 — 權限管理
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function UnauthorizedPage() {
  return (
    <Suspense>
      <UnauthorizedContent />
    </Suspense>
  );
}
