'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Navigation from '@/components/Navigation';

export default function AccountingSubjectsPage() {
  const { data: session } = useSession();
  const isLoggedIn = !!session;
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [formData, setFormData] = useState({
    category: '',
    subcategory: '',
    code: '',
    name: ''
  });
  const [customCategory, setCustomCategory] = useState('');
  const [customSubcategory, setCustomSubcategory] = useState('');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    fetchSubjects();
  }, []);

  useEffect(() => {
    if (successMsg) {
      const timer = setTimeout(() => setSuccessMsg(''), 3000);
      return () => clearTimeout(timer);
    }
  }, [successMsg]);

  const fetchSubjects = async () => {
    try {
      const res = await fetch('/api/accounting-subjects');
      const data = await res.json();
      if (!res.ok) {
        setSubjects([]);
        setError(data?.error?.message || '無法載入會計科目');
        return;
      }
      setSubjects(Array.isArray(data) ? data : []);
      setError('');
    } catch (err) {
      console.error('Failed to fetch:', err);
      setSubjects([]);
      setError('無法載入會計科目');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    setError('');
    const actualCategory = formData.category === '__custom__' ? customCategory.trim() : String(formData.category || '').trim();
    const actualSubcategory = formData.subcategory === '__custom__' ? customSubcategory.trim() : String(formData.subcategory || '').trim();
    const payload = {
      category: actualCategory,
      subcategory: actualSubcategory,
      code: String(formData.code || '').trim(),
      name: String(formData.name || '').trim()
    };
    if (!payload.category || !payload.subcategory) {
      setError('請輸入分類與類別');
      return;
    }
    try {
      const res = await fetch('/api/accounting-subjects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = data?.error?.message || (typeof data?.error === 'string' ? data.error : '新增失敗');
        setError(msg);
        return;
      }
      setSuccessMsg('新增成功');
      setFormData({ category: '', subcategory: '', code: '', name: '' });
      setCustomCategory('');
      setCustomSubcategory('');
      setShowAddForm(false);
      fetchSubjects();
    } catch (err) {
      setError('新增失敗，請稍後再試');
    }
  };

  const handleDelete = async (id, name) => {
    if (!confirm(`確定要刪除「${name}」嗎？`)) return;
    try {
      const res = await fetch(`/api/accounting-subjects?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        setSuccessMsg('刪除成功');
        fetchSubjects();
      }
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  const list = Array.isArray(subjects) ? subjects : [];
  // 取得所有不重複的分類
  const categories = [...new Set(list.map(s => s.category).filter(Boolean))];

  // 篩選
  const filtered = list.filter(s => {
    const matchSearch = !searchKeyword ||
      (s.code && s.code.includes(searchKeyword)) ||
      (s.name && s.name.includes(searchKeyword)) ||
      (s.subcategory && s.subcategory.includes(searchKeyword));
    const matchCategory = !filterCategory || s.category === filterCategory;
    return matchSearch && matchCategory;
  });

  // 按分類分組
  const grouped = {};
  filtered.forEach(s => {
    const key = `${s.category || ''} - ${s.subcategory || ''}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(s);
  });

  // 當選擇分類時，自動填入表單的 category
  const handleCategorySelect = (cat) => {
    setFormData(prev => ({ ...prev, category: cat }));
  };

  // 根據已選分類找出對應的類別
  const subcategoriesForSelected = formData.category
    ? [...new Set(list.filter(s => s.category === formData.category).map(s => s.subcategory).filter(Boolean))]
    : [];

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation borderColor="border-purple-500" />

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-800">會計科目管理</h2>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">
              共 {list.length} 筆科目
            </span>
            {isLoggedIn && (
              <button
                onClick={() => setShowAddForm(!showAddForm)}
                className="px-4 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 transition-colors"
              >
                {showAddForm ? '取消' : '＋ 新增科目'}
              </button>
            )}
          </div>
        </div>

        {/* 錯誤／成功訊息 */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
            {error}
          </div>
        )}
        {successMsg && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm">
            {successMsg}
          </div>
        )}

        {/* 新增表單 */}
        {showAddForm && (
          <div className="mb-6 bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4">新增會計科目</h3>
            {error && (
              <div className="mb-3 p-2 bg-red-50 border border-red-200 text-red-700 rounded text-sm">
                {error}
              </div>
            )}
            <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">分類</label>
                <select
                  value={formData.category}
                  onChange={(e) => handleCategorySelect(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  required
                >
                  <option value="">選擇分類</option>
                  {categories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                  <option value="__custom__">自訂...</option>
                </select>
                {formData.category === '__custom__' && (
                  <input
                    type="text"
                    value={customCategory}
                    placeholder="輸入新分類"
                    className="w-full border rounded-lg px-3 py-2 text-sm mt-2"
                    onChange={(e) => setCustomCategory(e.target.value)}
                    required
                  />
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">類別</label>
                <select
                  value={formData.subcategory}
                  onChange={(e) => setFormData(prev => ({ ...prev, subcategory: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  required
                >
                  <option value="">選擇類別</option>
                  {subcategoriesForSelected.map(sub => (
                    <option key={sub} value={sub}>{sub}</option>
                  ))}
                  <option value="__custom__">自訂...</option>
                </select>
                {formData.subcategory === '__custom__' && (
                  <input
                    type="text"
                    value={customSubcategory}
                    placeholder="輸入新類別"
                    className="w-full border rounded-lg px-3 py-2 text-sm mt-2"
                    onChange={(e) => setCustomSubcategory(e.target.value)}
                    required
                  />
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">代碼</label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData(prev => ({ ...prev, code: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  placeholder="例：1105"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">名稱</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    className="flex-1 border rounded-lg px-3 py-2 text-sm"
                    placeholder="例：現金"
                    required
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700"
                  >
                    新增
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}

        {/* 搜尋與篩選 */}
        <div className="mb-4 flex flex-wrap gap-3">
          <input
            type="text"
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            placeholder="搜尋代碼、名稱或類別..."
            className="px-3 py-2 border rounded-lg text-sm w-64"
          />
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="px-3 py-2 border rounded-lg text-sm"
          >
            <option value="">全部分類</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>

        {/* 表格 */}
        {loading ? (
          <div className="text-center py-12 text-gray-500">載入中...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            {list.length === 0 ? '尚無會計科目資料' : '無符合條件的資料'}
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-purple-50 border-b border-purple-100">
                    <th className="text-left px-4 py-3 font-semibold text-purple-800 w-32">代碼</th>
                    <th className="text-left px-4 py-3 font-semibold text-purple-800">名稱</th>
                    <th className="text-left px-4 py-3 font-semibold text-purple-800">分類</th>
                    <th className="text-left px-4 py-3 font-semibold text-purple-800">類別</th>
                    {isLoggedIn && (
                      <th className="text-center px-4 py-3 font-semibold text-purple-800 w-20">操作</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(grouped).map(([groupKey, items], gIdx) => (
                    items.map((subject, idx) => (
                      <tr
                        key={subject.id}
                        className={`border-b border-gray-100 hover:bg-purple-50/30 transition-colors ${
                          idx === 0 ? 'border-t-2 border-t-purple-100' : ''
                        }`}
                      >
                        <td className="px-4 py-2.5 font-mono text-purple-700 font-medium">
                          {subject.code}
                        </td>
                        <td className="px-4 py-2.5 text-gray-800">{subject.name}</td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${getCategoryColor(subject.category)}`}>
                            {subject.category}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-gray-600 text-xs">{subject.subcategory}</td>
                        {isLoggedIn && (
                          <td className="px-4 py-2.5 text-center">
                            <button
                              onClick={() => handleDelete(subject.id, subject.name)}
                              className="text-red-500 hover:text-red-700 text-xs hover:underline"
                            >
                              刪除
                            </button>
                          </td>
                        )}
                      </tr>
                    ))
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function getCategoryColor(category) {
  const colors = {
    '資產': 'bg-blue-100 text-blue-800',
    '負債': 'bg-red-100 text-red-800',
    '權益': 'bg-green-100 text-green-800',
    '營業收入': 'bg-emerald-100 text-emerald-800',
    '營業成本': 'bg-orange-100 text-orange-800',
    '營業費用': 'bg-amber-100 text-amber-800',
    '營業外收益': 'bg-teal-100 text-teal-800',
    '營業外費損': 'bg-pink-100 text-pink-800',
    '所得稅/其他綜合損益': 'bg-gray-100 text-gray-800',
  };
  return colors[category] || 'bg-gray-100 text-gray-800';
}
