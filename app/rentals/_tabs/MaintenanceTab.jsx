'use client';

import Link from 'next/link';
import { todayStr } from '@/lib/localDate';

const fmt = n => Number(n || 0).toLocaleString('zh-TW');

const MAINTENANCE_CATEGORIES = ['水電', '管線', '油漆', '設備', '清潔', '結構', '其他'];

export default function MaintenanceTab({
  maintenances, maintenancesHasMore,
  maintenanceFilter, setMaintenanceFilter,
  maintenanceAnalysis,
  fetchMaintenances, deleteMaintenance,
  setEditingMaintenance, setMaintenanceForm, setShowMaintenanceModal,
  properties, accountingSubjects,
}) {
  return (
    <div>
      {maintenancesHasMore && (
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
          目前顯示最近 500 筆，請使用篩選條件（物業／類別／狀態）縮小範圍
        </p>
      )}
      {/* 維護費分析摘要 */}
      {maintenances.length > 0 && (
        <div className="bg-white rounded-lg shadow p-4 mb-4">
          <h3 className="font-semibold text-gray-800 mb-3">維護費分析</h3>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-purple-50 rounded-lg p-3 border-l-4 border-purple-500">
              <p className="text-xs text-gray-500">合計</p>
              <p className="text-xl font-bold text-purple-700">${fmt(maintenanceAnalysis.total)}</p>
            </div>
            <div className="bg-green-50 rounded-lg p-3 border-l-4 border-green-500">
              <p className="text-xs text-gray-500">已付</p>
              <p className="text-xl font-bold text-green-700">${fmt(maintenanceAnalysis.paid)}</p>
            </div>
            <div className="bg-yellow-50 rounded-lg p-3 border-l-4 border-yellow-500">
              <p className="text-xs text-gray-500">待出納</p>
              <p className="text-xl font-bold text-yellow-700">${fmt(maintenanceAnalysis.pending)}</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">依類別</h4>
              {maintenanceAnalysis.catEntries.map(([cat, amt]) => (
                <div key={cat} className="flex items-center gap-2 mb-1">
                  <span className="text-xs text-gray-600 w-16">{cat}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-2">
                    <div className="bg-purple-400 h-2 rounded-full" style={{ width: `${maintenanceAnalysis.total > 0 ? Math.round((amt / maintenanceAnalysis.total) * 100) : 0}%` }} />
                  </div>
                  <span className="text-xs text-gray-700 w-20 text-right">${fmt(amt)}</span>
                  <span className="text-xs text-gray-400 w-10 text-right">{maintenanceAnalysis.total > 0 ? Math.round((amt / maintenanceAnalysis.total) * 100) : 0}%</span>
                </div>
              ))}
            </div>
            <div>
              <h4 className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">依物業</h4>
              {maintenanceAnalysis.propEntries.slice(0, 8).map(([pname, amt]) => (
                <div key={pname} className="flex items-center gap-2 mb-1">
                  <span className="text-xs text-gray-600 w-24 truncate" title={pname}>{pname}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-2">
                    <div className="bg-teal-400 h-2 rounded-full" style={{ width: `${maintenanceAnalysis.total > 0 ? Math.round((amt / maintenanceAnalysis.total) * 100) : 0}%` }} />
                  </div>
                  <span className="text-xs text-gray-700 w-20 text-right">${fmt(amt)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <select value={maintenanceFilter.year} onChange={e => setMaintenanceFilter(f => ({ ...f, year: e.target.value }))}
          className="border rounded px-2 py-1.5 text-sm">
          <option value="">全部年份</option>
          {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map(y => (
            <option key={y} value={y}>{y} 年</option>
          ))}
        </select>
        <select value={maintenanceFilter.propertyId} onChange={e => setMaintenanceFilter(f => ({ ...f, propertyId: e.target.value }))}
          className="border rounded px-2 py-1.5 text-sm">
          <option value="">全部物業</option>
          {properties.map(p => <option key={p.id} value={p.id}>{p.name}{p.asset?.hasMaintenanceFee ? ' [維護費]' : p.asset ? ' ⚠' : ''}</option>)}
        </select>
        <select value={maintenanceFilter.category} onChange={e => setMaintenanceFilter(f => ({ ...f, category: e.target.value }))}
          className="border rounded px-2 py-1.5 text-sm">
          <option value="">全部類別</option>
          {MAINTENANCE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={maintenanceFilter.status} onChange={e => setMaintenanceFilter(f => ({ ...f, status: e.target.value }))}
          className="border rounded px-2 py-1.5 text-sm">
          <option value="">全部狀態</option>
          <option value="pending">待付</option>
          <option value="paid">已付</option>
        </select>
        <button onClick={fetchMaintenances} className="bg-teal-600 text-white px-3 py-1.5 rounded text-sm hover:bg-teal-700">查詢</button>
        <button onClick={() => {
          setEditingMaintenance(null);
          const defaultSubject = accountingSubjects.find(s => s.code === '6010' || s.name.includes('租屋維修'));
          setMaintenanceForm({ propertyId: maintenanceFilter.propertyId || '', maintenanceDate: todayStr(), category: '水電', amount: '', accountingSubjectId: defaultSubject ? String(defaultSubject.id) : '', accountId: '', isEmployeeAdvance: false, advancedBy: '', advancePaymentMethod: '現金', isCapitalized: false, isRecurring: false, note: '' });
          setShowMaintenanceModal(true);
        }}
          className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700 ml-auto">
          新增維護
        </button>
      </div>

      <div className="bg-white rounded-lg shadow tbl-wrap">
        <table className="w-full text-sm">
          <thead className="bg-teal-50 sticky top-0 z-10">
            <tr>
              <th className="text-left px-3 py-2">物業</th>
              <th className="text-left px-3 py-2">日期</th>
              <th className="text-left px-3 py-2">類別</th>
              <th className="text-right px-3 py-2">金額</th>
              <th className="text-left px-3 py-2">備註</th>
              <th className="text-center px-3 py-2">狀態</th>
              <th className="text-center px-3 py-2">操作</th>
            </tr>
          </thead>
          <tbody>
            {maintenances.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-8 text-gray-400">暫無資料</td></tr>
            ) : maintenances.map(m => (
              <tr key={m.id} className="border-t hover:bg-gray-50">
                <td className="px-3 py-2">{m.property?.name}</td>
                <td className="px-3 py-2">{m.maintenanceDate}</td>
                <td className="px-3 py-2">{m.category}</td>
                <td className="px-3 py-2 text-right font-medium">${fmt(m.amount)}</td>
                <td className="px-3 py-2 text-gray-500 text-xs">
                  {m.isEmployeeAdvance && <span className="inline-block bg-purple-100 text-purple-800 text-xs px-1.5 py-0.5 rounded mr-1">代墊:{m.advancedBy}{m.advancePaymentMethod === '信用卡' ? '(卡)' : ''}</span>}
                  {m.note || '-'}
                </td>
                <td className="px-3 py-2 text-center">
                  <span className={`text-xs px-2 py-0.5 rounded ${m.status === 'paid' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                    {m.status === 'paid' ? '已付' : '待出納'}
                  </span>
                </td>
                <td className="px-3 py-2 text-center">
                  {m.status === 'pending' && (
                    <>
                      <Link href="/cashier" className="text-blue-600 hover:text-blue-800 text-xs font-medium mr-2">出納</Link>
                      <button onClick={() => {
                        setEditingMaintenance(m);
                        setMaintenanceForm({
                          propertyId: String(m.propertyId),
                          maintenanceDate: m.maintenanceDate,
                          category: m.category,
                          amount: String(m.amount),
                          accountingSubjectId: m.accountingSubjectId ? String(m.accountingSubjectId) : '',
                          accountId: '',
                          isEmployeeAdvance: !!m.isEmployeeAdvance,
                          advancedBy: m.advancedBy || '',
                          advancePaymentMethod: m.advancePaymentMethod || '現金',
                          isCapitalized: !!m.isCapitalized,
                          isRecurring: !!m.isRecurring,
                          note: m.note || ''
                        });
                        setShowMaintenanceModal(true);
                      }} className="text-teal-600 hover:text-teal-800 text-xs font-medium mr-2">編輯</button>
                      <button onClick={() => deleteMaintenance(m)} className="text-red-600 hover:text-red-800 text-xs font-medium">刪除</button>
                    </>
                  )}
                  {m.status === 'paid' && <span className="text-xs text-gray-400">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
