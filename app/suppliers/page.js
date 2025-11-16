'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    taxId: '',
    contact: '',
    phone: '',
    address: '',
    email: '',
    paymentTerms: '月結'
  });
  const [allSuppliers, setAllSuppliers] = useState([]);
  const [sortType, setSortType] = useState('id-asc'); // id-asc, id-desc, name-asc, name-desc, filter
  const [filterKeyword, setFilterKeyword] = useState('');
  const [showSortMenu, setShowSortMenu] = useState(false);

  useEffect(() => {
    fetchSuppliers();
  }, []);

  // 點擊外部關閉選單
  useEffect(() => {
    function handleClickOutside(event) {
      if (showSortMenu) {
        const menuElement = document.querySelector('.sort-menu-container');
        if (menuElement && !menuElement.contains(event.target)) {
          setShowSortMenu(false);
        }
      }
    }
    if (showSortMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSortMenu]);

  async function fetchSuppliers() {
    try {
      const response = await fetch('/api/suppliers');
      const data = await response.json();
      const suppliersList = Array.isArray(data) ? data : [];
      setAllSuppliers(suppliersList);
      applySortAndFilter(suppliersList, sortType, filterKeyword);
      setLoading(false);
    } catch (error) {
      console.error('取得廠商列表失敗:', error);
      setAllSuppliers([]);
      setSuppliers([]);
      setLoading(false);
    }
  }

  function applySortAndFilter(data, sort, keyword) {
    let result = [...data];

    // 先進行關鍵字篩選
    if (keyword && keyword.trim() !== '') {
      const lowerKeyword = keyword.toLowerCase().trim();
      result = result.filter(supplier => {
        return (
          (supplier.id && supplier.id.toString().includes(lowerKeyword)) ||
          (supplier.name && supplier.name.toLowerCase().includes(lowerKeyword)) ||
          (supplier.contact && supplier.contact.toLowerCase().includes(lowerKeyword)) ||
          (supplier.phone && supplier.phone.includes(keyword.trim())) ||
          (supplier.address && supplier.address.toLowerCase().includes(lowerKeyword)) ||
          (supplier.email && supplier.email.toLowerCase().includes(lowerKeyword))
        );
      });
    }

    // 再進行排序
    switch (sort) {
      case 'id-asc':
        result.sort((a, b) => (a.id || 0) - (b.id || 0));
        break;
      case 'id-desc':
        result.sort((a, b) => (b.id || 0) - (a.id || 0));
        break;
      case 'name-asc':
        result.sort((a, b) => {
          const nameA = (a.name || '').toLowerCase();
          const nameB = (b.name || '').toLowerCase();
          return nameA.localeCompare(nameB, 'zh-TW');
        });
        break;
      case 'name-desc':
        result.sort((a, b) => {
          const nameA = (a.name || '').toLowerCase();
          const nameB = (b.name || '').toLowerCase();
          return nameB.localeCompare(nameA, 'zh-TW');
        });
        break;
      default:
        result.sort((a, b) => (a.id || 0) - (b.id || 0));
    }

    setSuppliers(result);
  }

  function handleSortChange(newSortType) {
    setSortType(newSortType);
    setShowSortMenu(false);
    if (newSortType === 'filter') {
      // 如果是篩選模式，顯示輸入框但不關閉選單
      return;
    }
    applySortAndFilter(allSuppliers, newSortType, filterKeyword);
  }

  function handleFilterChange(keyword) {
    setFilterKeyword(keyword);
    if (sortType === 'filter') {
      applySortAndFilter(allSuppliers, 'id-asc', keyword);
    } else {
      applySortAndFilter(allSuppliers, sortType, keyword);
    }
  }

  useEffect(() => {
    if (allSuppliers.length > 0) {
      applySortAndFilter(allSuppliers, sortType, filterKeyword);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortType, filterKeyword]);

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      const isEditing = !!editingSupplier;
      const url = isEditing ? `/api/suppliers/${editingSupplier.id}` : '/api/suppliers';
      const method = isEditing ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        alert(`廠商${isEditing ? '更新' : '新增'}成功！`);
        setShowAddForm(false);
        setEditingSupplier(null);
        setFormData({ name: '', taxId: '', contact: '', phone: '', address: '', email: '', paymentTerms: '月結' });
        await fetchSuppliers();
      } else {
        const error = await response.json();
        alert(`${isEditing ? '更新' : '新增'}失敗：` + (error.error || '未知錯誤'));
      }
    } catch (error) {
      console.error('操作失敗:', error);
      alert('操作失敗，請稍後再試');
    }
  }

  function handleEdit(supplier) {
    setEditingSupplier(supplier);
    setShowAddForm(true);
    setFormData({
      name: supplier.name || '',
      taxId: supplier.taxId || '',
      contact: supplier.contact || '',
      phone: supplier.phone || '',
      address: supplier.address || '',
      email: supplier.email || '',
      paymentTerms: supplier.paymentTerms || '月結'
    });
  }

  async function handleDelete(supplierId) {
    if (!confirm('確定要刪除這個廠商嗎？')) return;
    
    try {
      const response = await fetch(`/api/suppliers/${supplierId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        alert('廠商刪除成功！');
        fetchSuppliers();
      } else {
        const error = await response.json();
        alert('刪除失敗：' + (error.error || '未知錯誤'));
      }
    } catch (error) {
      console.error('刪除廠商失敗:', error);
      alert('刪除廠商失敗，請稍後再試');
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <p className="text-gray-600">載入中...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* 導航欄 */}
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-blue-800">📦 進銷存系統</h1>
            <div className="flex gap-6 text-sm flex-wrap">
              <Link href="/" className="hover:text-blue-600">儀表板</Link>
              <Link href="/products" className="hover:text-blue-600">主資料</Link>
              <Link href="/suppliers" className="font-medium text-blue-600">廠商</Link>
              <Link href="/purchasing" className="hover:text-blue-600">進貨</Link>
              <Link href="/sales" className="hover:text-blue-600">發票登錄/核銷</Link>
              <Link href="/finance" className="hover:text-blue-600">付款</Link>
              <Link href="/inventory" className="hover:text-blue-600">庫存</Link>
              <Link href="/analytics" className="hover:text-blue-600">分析</Link>
              <Link href="/payment-voucher" className="text-green-600 hover:text-green-700 font-medium">🖨️ 列印傳票</Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* 頁面標題 */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">廠商管理</h2>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            ➕ 新增廠商
          </button>
        </div>

        {/* 新增/編輯廠商表單 */}
        {showAddForm && (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6 border-2 border-blue-200">
            <h3 className="text-lg font-semibold mb-4">{editingSupplier ? '編輯廠商' : '新增廠商'}</h3>
            <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  廠商名稱 *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  統一編號
                </label>
                <input
                  type="text"
                  value={formData.taxId}
                  onChange={(e) => setFormData({ ...formData, taxId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  聯絡人 *
                </label>
                <input
                  type="text"
                  required
                  value={formData.contact}
                  onChange={(e) => setFormData({ ...formData, contact: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  聯絡電話 *
                </label>
                <input
                  type="text"
                  required
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="例如：02-1234-5678"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  地址
                </label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="例如：台北市信義區信義路五段7號"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="例如：contact@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  付款條件
                </label>
                <select
                  value={formData.paymentTerms}
                  onChange={(e) => setFormData({ ...formData, paymentTerms: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option>月結</option>
                  <option>現金</option>
                  <option>支票</option>
                  <option>轉帳</option>
                </select>
              </div>
              <div className="col-span-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm(false);
                    setEditingSupplier(null);
                    setFormData({ name: '', taxId: '', contact: '', phone: '', address: '', email: '', paymentTerms: '月結' });
                  }}
                  className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  {editingSupplier ? '更新' : '儲存'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* 廠商列表 */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">
                  <div className="relative sort-menu-container">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowSortMenu(!showSortMenu);
                      }}
                      className="flex items-center gap-2 hover:text-blue-600 cursor-pointer"
                    >
                      <span>廠商序號</span>
                      <span className="text-xs">▼</span>
                    </button>
                    {showSortMenu && (
                      <div 
                        className="absolute top-full left-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg z-50 min-w-[200px]"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="py-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSortChange('id-asc');
                            }}
                            className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 ${
                              sortType === 'id-asc' ? 'bg-blue-50 text-blue-600' : ''
                            }`}
                          >
                            由小到大 (1→9)
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSortChange('id-desc');
                            }}
                            className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 ${
                              sortType === 'id-desc' ? 'bg-blue-50 text-blue-600' : ''
                            }`}
                          >
                            由大到小 (9→1)
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSortChange('name-asc');
                            }}
                            className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 ${
                              sortType === 'name-asc' ? 'bg-blue-50 text-blue-600' : ''
                            }`}
                          >
                            A到Z (名稱排序)
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSortChange('name-desc');
                            }}
                            className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 ${
                              sortType === 'name-desc' ? 'bg-blue-50 text-blue-600' : ''
                            }`}
                          >
                            Z到A (名稱排序)
                          </button>
                          <div className="border-t border-gray-200 my-1"></div>
                          <div className="px-4 py-2">
                            <label className="block text-xs text-gray-600 mb-1">關鍵字篩選</label>
                            <input
                              type="text"
                              value={filterKeyword}
                              onChange={(e) => {
                                handleFilterChange(e.target.value);
                                setSortType('filter');
                              }}
                              onClick={(e) => e.stopPropagation()}
                              onFocus={(e) => e.stopPropagation()}
                              placeholder="搜尋序號、名稱、聯絡人等..."
                              className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setFilterKeyword('');
                              setSortType('id-asc');
                              setShowSortMenu(false);
                              applySortAndFilter(allSuppliers, 'id-asc', '');
                            }}
                            className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 text-gray-500"
                          >
                            清除篩選
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  {filterKeyword && (
                    <div className="mt-1 text-xs text-blue-600">
                      篩選中: {filterKeyword}
                    </div>
                  )}
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">聯絡人</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">聯絡電話</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">廠商名稱</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">統一編號</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">地址</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Email</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">付款條件</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {suppliers.length === 0 ? (
                <tr>
                  <td colSpan="9" className="px-4 py-8 text-center text-gray-500">
                    尚無廠商資料
                  </td>
                </tr>
              ) : (
                suppliers.map((supplier, index) => (
                  <tr key={supplier.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-4 py-3 text-sm font-medium">{supplier.id}</td>
                    <td className="px-4 py-3 text-sm">{supplier.contact || '-'}</td>
                    <td className="px-4 py-3 text-sm">{supplier.phone || '-'}</td>
                    <td className="px-4 py-3 text-sm">{supplier.name}</td>
                    <td className="px-4 py-3 text-sm">{supplier.taxId || '-'}</td>
                    <td className="px-4 py-3 text-sm">{supplier.address || '-'}</td>
                    <td className="px-4 py-3 text-sm">{supplier.email || '-'}</td>
                    <td className="px-4 py-3 text-sm">{supplier.paymentTerms || '-'}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEdit(supplier)}
                          className="text-blue-600 hover:underline text-sm"
                        >
                          編輯
                        </button>
                        <button
                          onClick={() => handleDelete(supplier.id)}
                          className="text-red-600 hover:underline text-sm"
                        >
                          刪除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}

