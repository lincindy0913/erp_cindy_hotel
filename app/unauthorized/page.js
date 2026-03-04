'use client';

import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import { ROLE_LABELS, ROLE_COLORS } from '@/lib/permissions';

export default function UnauthorizedPage() {
  const { data: session } = useSession();

  const userRoles = session?.user?.roles || [];

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-rose-100">
      <div className="bg-white p-8 rounded-xl shadow-xl text-center max-w-md">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-red-600 mb-2">權限不足</h1>
        <p className="text-gray-600 mb-6">您無此功能的存取權限</p>

        {session && (
          <div className="mb-4 text-sm text-gray-500">
            <p>
              目前登入: {session.user?.name} ({session.user?.email})
            </p>
            {userRoles.length > 0 && (
              <div className="flex justify-center gap-1 mt-2">
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
            <p className="mt-2 text-gray-400">如需開通權限，請聯繫系統管理員</p>
          </div>
        )}

        <div className="flex gap-3 justify-center">
          <Link
            href="/"
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            返回首頁
          </Link>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
          >
            重新登入
          </button>
        </div>
      </div>
    </div>
  );
}
