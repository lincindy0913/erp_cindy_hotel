'use client';

export default function UsersSection({ users, usersLoading, usersError, fetchUsers, auditInfo }) {
  function renderAuditTrail(sectionKey) {
    const info = auditInfo[sectionKey];
    if (!info) return null;
    return (
      <div className="mt-6 pt-4 border-t border-gray-100">
        <p className="text-xs text-gray-400">
          最後修改：{info.email} 於 {new Date(info.updatedAt).toLocaleString('zh-TW')}
        </p>
      </div>
    );
  }

  if (usersLoading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-600"></div>
          <span className="ml-3 text-sm text-gray-500">載入使用者資料中...</span>
        </div>
      </div>
    );
  }

  if (usersError) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="text-center py-8">
          <p className="text-sm text-red-500 mb-4">{usersError}</p>
          <button
            onClick={fetchUsers}
            className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 text-sm font-medium transition-colors"
          >
            重試
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-700">使用者列表</h3>
            <p className="text-sm text-gray-500 mt-1">共 {users.length} 位使用者</p>
          </div>
          <a
            href="/admin/users"
            className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 text-sm font-medium transition-colors"
          >
            前往完整使用者管理 →
          </a>
        </div>

        {users.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">尚無使用者資料</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-white">
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-gray-600 font-medium">名稱</th>
                  <th className="text-left py-3 px-4 text-gray-600 font-medium">Email</th>
                  <th className="text-left py-3 px-4 text-gray-600 font-medium">角色</th>
                  <th className="text-left py-3 px-4 text-gray-600 font-medium">館別限制</th>
                  <th className="text-center py-3 px-4 text-gray-600 font-medium">狀態</th>
                  <th className="text-left py-3 px-4 text-gray-600 font-medium">最後登入</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="py-3 px-4">
                      <span className="font-medium text-gray-700">{user.name || '-'}</span>
                    </td>
                    <td className="py-3 px-4 text-gray-600">{user.email}</td>
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap gap-1">
                        {user.roles && user.roles.length > 0 ? (
                          user.roles.map((role) => (
                            <span
                              key={role.id}
                              className="inline-block text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700"
                            >
                              {role.name}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                            {user.role || 'user'}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-gray-600 text-xs">
                      {user.warehouseRestriction || '不限'}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`inline-block w-2 h-2 rounded-full ${
                          user.isActive !== false ? 'bg-green-500' : 'bg-gray-300'
                        }`}
                        title={user.isActive !== false ? '啟用中' : '已停用'}
                      ></span>
                      <span className={`ml-1.5 text-xs ${user.isActive !== false ? 'text-green-600' : 'text-gray-400'}`}>
                        {user.isActive !== false ? '啟用' : '停用'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-gray-500 text-xs">
                      {user.lastLoginAt
                        ? new Date(user.lastLoginAt).toLocaleString('zh-TW')
                        : '尚未登入'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {renderAuditTrail('users')}
      </div>
    </div>
  );
}
