'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Navigation from '@/components/Navigation';

const ALL_PERMISSIONS = [
  { id: 'dashboard', label: '儀表板' },
  { id: 'products', label: '主資料' },
  { id: 'suppliers', label: '廠商' },
  { id: 'purchasing', label: '進貨' },
  { id: 'sales', label: '發票登錄/核銷' },
  { id: 'finance', label: '付款' },
  { id: 'inventory', label: '庫存' },
  { id: 'analytics', label: '分析' },
  { id: 'expenses', label: '支出' },
  { id: 'payment-voucher', label: '付款傳票' }
];

export default function UserManagementPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: '',
    role: 'user',
    permissions: [],
    isActive: true
  });

  useEffect(() => {
    if (status === 'authenticated') {
      if (session?.user?.role !== 'admin') {
        router.push('/');
      } else {
        fetchUsers();
      }
    } else if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, session, router]);

  async function fetchUsers() {
    try {
      const response = await fetch('/api/users');
      if (response.ok) {
        const data = await response.json();
        setUsers(data);
      }
    } catch (error) {
      console.error('Fetch users error:', error);
    } finally {
      setLoading(false);
    }
  }

  function handlePermissionChange(permissionId) {
    setFormData(prev => ({
      ...prev,
      permissions: prev.permissions.includes(permissionId)
        ? prev.permissions.filter(p => p !== permissionId)
        : [...prev.permissions, permissionId]
    }));
  }

  function selectAllPermissions() {
    setFormData(prev => ({
      ...prev,
      permissions: ALL_PERMISSIONS.map(p => p.id)
    }));
  }

  function clearAllPermissions() {
    setFormData(prev => ({
      ...prev,
      permissions: []
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();

    const method = editingUser ? 'PUT' : 'POST';
    const url = editingUser ? `/api/users/${editingUser.id}` : '/api/users';

    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        alert(editingUser ? '使用者更新成功' : '使用者新增成功');
        setShowForm(false);
        setEditingUser(null);
        setFormData({
          email: '',
          password: '',
          name: '',
          role: 'user',
          permissions: [],
          isActive: true
        });
        fetchUsers();
      } else {
        const error = await response.json();
        alert('操作失敗：' + error.error);
      }
    } catch (error) {
      alert('操作失敗：' + error.message);
    }
  }

  async function handleDelete(userId) {
    if (!confirm('確定要刪除此使用者嗎？')) return;

    try {
      const response = await fetch(`/api/users/${userId}`, { method: 'DELETE' });
      if (response.ok) {
        alert('使用者已刪除');
        fetchUsers();
      } else {
        const error = await response.json();
        alert('刪除失敗：' + error.error);
      }
    } catch (error) {
      alert('刪除失敗：' + error.message);
    }
  }

  function handleEdit(user) {
    setEditingUser(user);
    setFormData({
      email: user.email,
      password: '',
      name: user.name,
      role: user.role,
      permissions: user.permissions || [],
      isActive: user.isActive
    });
    setShowForm(true);
  }

  function handleAddNew() {
    setEditingUser(null);
    setFormData({
      email: '',
      password: '',
      name: '',
      role: 'user',
      permissions: [],
      isActive: true
    });
    setShowForm(true);
  }

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen page-bg-dashboard flex items-center justify-center">
        <p className="text-gray-600">載入中...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen page-bg-dashboard">
      <Navigation borderColor="border-blue-500" />

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800">使用者管理</h2>
          <button
            onClick={handleAddNew}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
          >
            新增使用者
          </button>
        </div>

        {showForm && (
          <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
            <h3 className="text-lg font-semibold mb-4">
              {editingUser ? '編輯使用者' : '新增使用者'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    電子郵件
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required={!editingUser}
                    disabled={!!editingUser}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                    placeholder="請輸入電子郵件"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    密碼 {editingUser && <span className="text-gray-500">(留空則不修改)</span>}
                  </label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    required={!editingUser}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder={editingUser ? '留空則不修改' : '請輸入密碼'}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    姓名
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="請輸入姓名"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    角色
                  </label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="user">一般使用者</option>
                    <option value="admin">管理員</option>
                  </select>
                </div>
              </div>

              {formData.role !== 'admin' && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-gray-700">
                      權限設定
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={selectAllPermissions}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        全選
                      </button>
                      <span className="text-gray-300">|</span>
                      <button
                        type="button"
                        onClick={clearAllPermissions}
                        className="text-xs text-gray-600 hover:underline"
                      >
                        清除
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3 p-4 bg-gray-50 rounded-lg">
                    {ALL_PERMISSIONS.map(perm => (
                      <label key={perm.id} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.permissions.includes(perm.id)}
                          onChange={() => handlePermissionChange(perm.id)}
                          className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">{perm.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {editingUser && (
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="isActive"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <label htmlFor="isActive" className="text-sm text-gray-700">
                    帳號啟用
                  </label>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditingUser(null);
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                >
                  {editingUser ? '更新' : '新增'}
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">姓名</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">電子郵件</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">角色</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">權限</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">狀態</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {users.map(user => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{user.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{user.email}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${
                      user.role === 'admin'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {user.role === 'admin' ? '管理員' : '一般使用者'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {user.role === 'admin' ? (
                      <span className="text-blue-600">全部權限</span>
                    ) : (
                      <span className="truncate block max-w-xs" title={(user.permissions || []).join(', ')}>
                        {(user.permissions || []).length > 0
                          ? (user.permissions || []).slice(0, 3).join(', ') +
                            ((user.permissions || []).length > 3 ? ` +${(user.permissions || []).length - 3}` : '')
                          : '無權限'}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${
                      user.isActive
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {user.isActive ? '啟用' : '停用'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEdit(user)}
                        className="text-blue-600 hover:text-blue-800 text-sm hover:underline"
                      >
                        編輯
                      </button>
                      <button
                        onClick={() => handleDelete(user.id)}
                        className="text-red-600 hover:text-red-800 text-sm hover:underline"
                      >
                        刪除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan="6" className="px-4 py-8 text-center text-gray-500">
                    目前沒有使用者資料
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
