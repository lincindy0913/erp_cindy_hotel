'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingExpense, setEditingExpense] = useState(null);
  const [formData, setFormData] = useState({
    actualPaymentDate: '',
    actualPaymentAmount: ''
  });

  useEffect(() => {
    fetchExpenses();
  }, []);

  async function fetchExpenses() {
    try {
      const response = await fetch('/api/expenses');
      const data = await response.json();
      setExpenses(Array.isArray(data) ? data : []);
      setLoading(false);
    } catch (error) {
      console.error('取得支出列表失敗:', error);
      setExpenses([]);
      setLoading(false);
    }
  }

  function handleEdit(expense) {
    setEditingExpense(expense);
    setFormData({
      actualPaymentDate: expense.actualPaymentDate || '',
      actualPaymentAmount: expense.actualPaymentAmount ? expense.actualPaymentAmount.toString() : ''
    });
  }

  function handleCancelEdit() {
    setEditingExpense(null);
    setFormData({
      actualPaymentDate: '',
      actualPaymentAmount: ''
    });
  }

  async function handleSave() {
    if (!editingExpense) return;

    if (!formData.actualPaymentDate) {
      alert('請輸入實付日期');
      return;
    }

    if (!formData.actualPaymentAmount || parseFloat(formData.actualPaymentAmount) <= 0) {
      alert('請輸入實付金額');
      return;
    }

    try {
      const response = await fetch(`/api/expenses/${editingExpense.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actualPaymentDate: formData.actualPaymentDate,
          actualPaymentAmount: parseFloat(formData.actualPaymentAmount)
        })
      });

      if (response.ok) {
        alert('支出紀錄更新成功！');
        setEditingExpense(null);
        setFormData({
          actualPaymentDate: '',
          actualPaymentAmount: ''
        });
        fetchExpenses();
      } else {
        const error = await response.json();
        alert('更新失敗：' + (error.error || '未知錯誤'));
      }
    } catch (error) {
      console.error('更新支出紀錄失敗:', error);
      alert('更新支出紀錄失敗，請稍後再試');
    }
  }

  async function handleDelete(expenseId) {
    if (!confirm('確定要刪除這筆支出紀錄嗎？')) return;
    
    try {
      const response = await fetch(`/api/expenses/${expenseId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        alert('支出紀錄刪除成功！');
        fetchExpenses();
      } else {
        const error = await response.json();
        alert('刪除失敗：' + (error.error || '未知錯誤'));
      }
    } catch (error) {
      console.error('刪除支出紀錄失敗:', error);
      alert('刪除支出紀錄失敗，請稍後再試');
    }
  }

  return (
    <div className="min-h-screen page-bg-expenses">
      {/* 導航欄 */}
      <nav className="bg-white shadow-lg border-b-4 border-rose-500">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-800">📦 進銷存系統</h1>
            <div className="flex gap-2 text-sm flex-wrap">
              <Link href="/" className="link-dashboard">儀表板</Link>
              <Link href="/products" className="link-products">主資料</Link>
              <Link href="/suppliers" className="link-suppliers">廠商</Link>
              <Link href="/purchasing" className="link-purchasing">進貨</Link>
              <Link href="/sales" className="link-sales">發票登錄/核銷</Link>
              <Link href="/finance" className="link-finance">付款</Link>
              <Link href="/inventory" className="link-inventory">庫存</Link>
              <Link href="/analytics" className="link-analytics">分析</Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">支出管理</h2>
        </div>

        {/* 支出列表 */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">發票號</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">發票日期</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">廠商</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">館別</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">傳票金額</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">實付日期</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">實付金額</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">狀態</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan="9" className="px-4 py-8 text-center text-gray-500">載入中...</td>
                </tr>
              ) : expenses.length === 0 ? (
                <tr>
                  <td colSpan="9" className="px-4 py-8 text-center text-gray-500">尚無支出紀錄</td>
                </tr>
              ) : (
                expenses.map((expense, index) => {
                  const isEditing = editingExpense && editingExpense.id === expense.id;
                  return (
                    <tr key={expense.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-4 py-3 text-sm font-medium">{expense.invoiceNo || '-'}</td>
                      <td className="px-4 py-3 text-sm">{expense.invoiceDate || '-'}</td>
                      <td className="px-4 py-3 text-sm">{expense.supplierName || '未知廠商'}</td>
                      <td className="px-4 py-3 text-sm">{expense.warehouse || '-'}</td>
                      <td className="px-4 py-3 text-sm text-right font-semibold">
                        NT$ {parseFloat(expense.amount || 0).toFixed(2)}
                      </td>
                      {isEditing ? (
                        <>
                          <td className="px-4 py-3">
                            <input
                              type="date"
                              value={formData.actualPaymentDate}
                              onChange={(e) => setFormData({ ...formData, actualPaymentDate: e.target.value })}
                              className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="number"
                              step="0.01"
                              value={formData.actualPaymentAmount}
                              onChange={(e) => setFormData({ ...formData, actualPaymentAmount: e.target.value })}
                              placeholder="輸入實付金額"
                              className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                            />
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <span className={`px-2 py-1 rounded text-xs ${
                              expense.status === '已完成' ? 'bg-green-100 text-green-800' :
                              'bg-yellow-100 text-yellow-800'
                            }`}>
                              {expense.status}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-2">
                              <button
                                onClick={handleSave}
                                className="text-blue-600 hover:underline text-sm"
                              >
                                儲存
                              </button>
                              <button
                                onClick={handleCancelEdit}
                                className="text-gray-600 hover:underline text-sm"
                              >
                                取消
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-3 text-sm">{expense.actualPaymentDate || '-'}</td>
                          <td className="px-4 py-3 text-sm text-right">
                            {expense.actualPaymentAmount > 0 ? `NT$ ${parseFloat(expense.actualPaymentAmount).toFixed(2)}` : '-'}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <span className={`px-2 py-1 rounded text-xs ${
                              expense.status === '已完成' ? 'bg-green-100 text-green-800' :
                              'bg-yellow-100 text-yellow-800'
                            }`}>
                              {expense.status}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleEdit(expense)}
                                className="text-blue-600 hover:underline text-sm"
                              >
                                編輯
                              </button>
                              <button
                                onClick={() => handleDelete(expense.id)}
                                className="text-red-600 hover:underline text-sm"
                              >
                                刪除
                              </button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}

