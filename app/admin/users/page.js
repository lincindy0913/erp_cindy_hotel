'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Navigation from '@/components/Navigation';
import { ROLE_CODES, ROLE_LABELS, ROLE_COLORS, PERMISSIONS, ROLE_DEFAULTS, hasRoleConflict } from '@/lib/permissions';
import { useToast } from '@/context/ToastContext';

// 權限分類（用於顯示）
const PERMISSION_GROUPS = [
  { label: '進貨', permissions: [PERMISSIONS.PURCHASING_VIEW, PERMISSIONS.PURCHASING_CREATE, PERMISSIONS.PURCHASING_EDIT] },
  { label: '發票', permissions: [PERMISSIONS.SALES_VIEW, PERMISSIONS.SALES_CREATE, PERMISSIONS.SALES_EDIT] },
  { label: '付款', permissions: [PERMISSIONS.FINANCE_VIEW, PERMISSIONS.FINANCE_CREATE, PERMISSIONS.FINANCE_EDIT] },
  { label: '出納', permissions: [PERMISSIONS.CASHIER_VIEW, PERMISSIONS.CASHIER_EXECUTE, PERMISSIONS.CASHIER_REJECT] },
  { label: '庫存', permissions: [PERMISSIONS.INVENTORY_VIEW] },
  { label: '現金流', permissions: [PERMISSIONS.CASHFLOW_VIEW, PERMISSIONS.CASHFLOW_CREATE, PERMISSIONS.CASHFLOW_EDIT] },
  { label: 'PMS', permissions: [PERMISSIONS.PMS_VIEW, PERMISSIONS.PMS_IMPORT] },
  { label: '貸款', permissions: [PERMISSIONS.LOAN_VIEW, PERMISSIONS.LOAN_CREATE, PERMISSIONS.LOAN_CONFIRM] },
  { label: '支票', permissions: [PERMISSIONS.CHECK_VIEW, PERMISSIONS.CHECK_CREATE, PERMISSIONS.CHECK_CLEAR] },
  { label: '對帳', permissions: [PERMISSIONS.RECONCILIATION_VIEW, PERMISSIONS.RECONCILIATION_CREATE] },
  { label: '租屋', permissions: [PERMISSIONS.RENTAL_VIEW, PERMISSIONS.RENTAL_CREATE, PERMISSIONS.RENTAL_EDIT] },
  { label: '月結', permissions: [PERMISSIONS.MONTHEND_VIEW, PERMISSIONS.MONTHEND_EXECUTE, PERMISSIONS.MONTHEND_UNLOCK] },
  { label: '費用', permissions: [PERMISSIONS.EXPENSE_VIEW, PERMISSIONS.EXPENSE_CREATE] },
  { label: '分析', permissions: [PERMISSIONS.ANALYTICS_VIEW] },
  { label: '匯出', permissions: [PERMISSIONS.EXPORT_XLSX, PERMISSIONS.EXPORT_CSV, PERMISSIONS.EXPORT_PDF] },
  { label: '稽核', permissions: [PERMISSIONS.AUDIT_VIEW] },
  { label: '附件', permissions: [PERMISSIONS.ATTACHMENT_UPLOAD, PERMISSIONS.ATTACHMENT_DELETE] },
  { label: '系統', permissions: [PERMISSIONS.SETTINGS_VIEW, PERMISSIONS.SETTINGS_EDIT, PERMISSIONS.USER_MANAGE] },
];

const WAREHOUSE_OPTIONS = [
  { value: '', label: '全部 (不限制)' },
  { value: '麗格', label: '麗格' },
  { value: '麗軒', label: '麗軒' },
  { value: '民宿', label: '民宿' },
];

export default function UserManagementPage() {
  const { showToast } = useToast();
  const { data: session, status } = useSession();
  const router = useRouter();
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userSaving, setUserSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: '',
    roleIds: [],
    warehouseRestriction: '',
    isActive: true,
  });

  useEffect(() => {
    if (status === 'authenticated') {
      if (session?.user?.role !== 'admin') {
        router.push('/');
      } else {
        fetchUsers();
        fetchRoles();
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
      } else {
        showToast('載入用戶清單失敗，請重新整理', 'error');
      }
    } catch (error) {
      console.error('Fetch users error:', error);
      showToast('載入用戶清單失敗，請重新整理', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function fetchRoles() {
    try {
      const response = await fetch('/api/roles');
      if (response.ok) {
        const data = await response.json();
        setRoles(data);
      }
    } catch (error) {
      console.error('Fetch roles error:', error);
    }
  }

  // 從目前選取的角色計算合併權限（預覽用）
  function getSelectedRolePermissions() {
    const permSet = new Set();
    const selectedRoleCodes = roles
      .filter(r => formData.roleIds.includes(r.id))
      .map(r => r.code);

    if (selectedRoleCodes.includes(ROLE_CODES.ADMIN)) {
      return ['* (全部權限)'];
    }

    for (const roleId of formData.roleIds) {
      const role = roles.find(r => r.id === roleId);
      if (role && Array.isArray(role.permissions)) {
        role.permissions.forEach(p => permSet.add(p));
      }
    }
    return Array.from(permSet);
  }

  // 檢查是否有 finance + cashier 衝突
  function checkConflict() {
    const selectedCodes = roles
      .filter(r => formData.roleIds.includes(r.id))
      .map(r => r.code);
    return hasRoleConflict(selectedCodes);
  }

  function handleRoleToggle(roleId) {
    setFormData(prev => ({
      ...prev,
      roleIds: prev.roleIds.includes(roleId)
        ? prev.roleIds.filter(id => id !== roleId)
        : [...prev.roleIds, roleId]
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();

    const method = editingUser ? 'PUT' : 'POST';
    const url = editingUser ? `/api/users/${editingUser.id}` : '/api/users';

    const payload = {
      ...formData,
      warehouseRestriction: formData.warehouseRestriction || null,
    };

    setUserSaving(true);
    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        showToast(editingUser ? '使用者更新成功' : '使用者新增成功', 'success');
        setShowForm(false);
        setEditingUser(null);
        resetForm();
        fetchUsers();
      } else {
        const error = await response.json();
        showToast('操作失敗：' + (error.error?.message || error.error), 'error');
      }
    } catch (error) {
      showToast('操作失敗：' + error.message, 'error');
    } finally {
      setUserSaving(false);
    }
  }

  async function handleDelete(userId) {
    if (!confirm('確定要停用此使用者嗎？')) return;

    try {
      const response = await fetch(`/api/users/${userId}`, { method: 'DELETE' });
      if (response.ok) {
        showToast('使用者已停用', 'success');
        fetchUsers();
      } else {
        const error = await response.json();
        showToast('操作失敗：' + (error.error?.message || error.error), 'error');
      }
    } catch (error) {
      showToast('操作失敗：' + error.message, 'error');
    }
  }

  function handleEdit(user) {
    setEditingUser(user);
    setFormData({
      email: user.email,
      password: '',
      name: user.name,
      roleIds: (user.roles || []).map(r => r.id),
      warehouseRestriction: user.warehouseRestriction || '',
      isActive: user.isActive,
    });
    setShowForm(true);
  }

  function handleAddNew() {
    setEditingUser(null);
    resetForm();
    setShowForm(true);
  }

  function resetForm() {
    setFormData({
      email: '',
      password: '',
      name: '',
      roleIds: [],
      warehouseRestriction: '',
      isActive: true,
    });
  }

  function formatDateTime(isoString) {
    if (!isoString) return '-';
    const d = new Date(isoString);
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen page-bg-dashboard flex items-center justify-center">
        <p className="text-gray-600">載入中...</p>
      </div>
    );
  }

  const selectedPermissions = getSelectedRolePermissions();
  const hasConflict = checkConflict();

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
                    館別限制
                  </label>
                  <select
                    value={formData.warehouseRestriction}
                    onChange={(e) => setFormData({ ...formData, warehouseRestriction: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    {WAREHOUSE_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 角色選擇 (多選 checkbox) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  角色指派
                </label>
                <div className="flex flex-wrap gap-3 p-4 bg-gray-50 rounded-lg">
                  {roles.map(role => {
                    const colorClass = ROLE_COLORS[role.code] || 'bg-gray-100 text-gray-800';
                    const isSelected = formData.roleIds.includes(role.id);
                    return (
                      <label
                        key={role.id}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer border-2 transition ${
                          isSelected
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-transparent hover:bg-gray-100'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleRoleToggle(role.id)}
                          className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                        />
                        <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${colorClass}`}>
                          {ROLE_LABELS[role.code] || role.name}
                        </span>
                        <span className="text-sm text-gray-500">({role.code})</span>
                      </label>
                    );
                  })}
                </div>

                {/* finance + cashier 衝突警告 */}
                {hasConflict && (
                  <div className="mt-2 p-3 bg-orange-50 border border-orange-300 rounded-lg flex items-start gap-2">
                    <svg className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <div>
                      <p className="text-sm font-medium text-orange-800">職責衝突警告</p>
                      <p className="text-sm text-orange-700">
                        同時指派「財務」與「出納」角色可能違反職責分離原則 (Segregation of Duties)。
                        財務負責開立付款單，出納負責執行付款，由同一人擔任存在風險。
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* 合併權限預覽 */}
              {formData.roleIds.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    合併權限預覽 ({selectedPermissions.length} 項)
                  </label>
                  <div className="p-3 bg-gray-50 rounded-lg max-h-32 overflow-y-auto">
                    <div className="flex flex-wrap gap-1">
                      {selectedPermissions.map(p => (
                        <span key={p} className="inline-flex px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">
                          {p}
                        </span>
                      ))}
                    </div>
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
                  disabled={userSaving}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
                >
                  {userSaving ? '儲存中…' : (editingUser ? '更新' : '新增')}
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
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">館別限制</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">最後登入</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">狀態</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {users.map(user => {
                const userRoleCodes = user.roleCodes || [];
                const userHasConflict = hasRoleConflict(userRoleCodes);
                return (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{user.name}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{user.email}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {userRoleCodes.length > 0 ? (
                          userRoleCodes.map(code => {
                            const colorClass = ROLE_COLORS[code] || 'bg-gray-100 text-gray-800';
                            return (
                              <span key={code} className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${colorClass}`}>
                                {ROLE_LABELS[code] || code}
                              </span>
                            );
                          })
                        ) : (
                          <span className="text-xs text-gray-400">未指派角色</span>
                        )}
                        {userHasConflict && (
                          <span className="inline-flex px-1.5 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700" title="財務+出納職責衝突">
                            !
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {user.warehouseRestriction || '全部'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {formatDateTime(user.lastLoginAt)}
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
                          停用
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {users.length === 0 && (
                <tr>
                  <td colSpan="7" className="px-4 py-8 text-center text-gray-500">
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
