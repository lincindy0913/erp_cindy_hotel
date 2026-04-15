'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Navigation from '@/components/Navigation';
import ExportButtons from '@/components/ExportButtons';
import { EXPORT_CONFIGS } from '@/lib/export-columns';
import { useToast } from '@/context/ToastContext';

const MONTH_NAMES = [
  '一月', '二月', '三月', '四月', '五月', '六月',
  '七月', '八月', '九月', '十月', '十一月', '十二月'
];

const STATUS_BADGES = {
  '未結帳': { bg: 'bg-gray-100', text: 'text-gray-700', dot: 'bg-gray-400' },
  '結帳中': { bg: 'bg-yellow-100', text: 'text-yellow-700', dot: 'bg-yellow-400' },
  '已結帳': { bg: 'bg-green-100', text: 'text-green-700', dot: 'bg-green-500' },
  '已鎖定': { bg: 'bg-blue-100', text: 'text-blue-700', dot: 'bg-blue-500' }
};

function formatNumber(num) {
  if (num == null || isNaN(num)) return '0';
  return Number(num).toLocaleString('zh-TW');
}

export default function MonthEndPage() {
  const { data: session } = useSession();
  const { showToast } = useToast();
  const isAdmin = session?.user?.role === 'admin';
  const userName = session?.user?.name || '';

  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [monthsData, setMonthsData] = useState([]);
  const [loading, setLoading] = useState(true);

  // Pre-check modal
  const [showPreCheck, setShowPreCheck] = useState(false);
  const [preCheckMonth, setPreCheckMonth] = useState(null);
  const [preCheckResults, setPreCheckResults] = useState(null);
  const [preCheckLoading, setPreCheckLoading] = useState(false);

  // Closing confirmation modal
  const [showConfirm, setShowConfirm] = useState(false);
  const [closingMonth, setClosingMonth] = useState(null);
  const [closingLoading, setClosingLoading] = useState(false);
  const [closingResult, setClosingResult] = useState(null);

  // Report viewer modal
  const [showReport, setShowReport] = useState(false);
  const [reportData, setReportData] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);

  // Month detail modal (viewing all reports for a closed month)
  const [showMonthDetail, setShowMonthDetail] = useState(false);
  const [monthDetail, setMonthDetail] = useState(null);
  const [monthDetailLoading, setMonthDetailLoading] = useState(false);

  // Unlock modal
  const [showUnlock, setShowUnlock] = useState(false);
  const [unlockTarget, setUnlockTarget] = useState(null);
  const [unlockReason, setUnlockReason] = useState('');
  const [unlockLoading, setUnlockLoading] = useState(false);

  // Lock confirmation
  const [lockLoading, setLockLoading] = useState(false);

  useEffect(() => {
    fetchMonthData();
  }, [selectedYear]);

  async function fetchMonthData() {
    setLoading(true);
    try {
      const res = await fetch(`/api/month-end?year=${selectedYear}`);
      const data = await res.json();
      if (data.months) {
        setMonthsData(data.months);
      }
    } catch (error) {
      console.error('載入月結資料失敗:', error);
    }
    setLoading(false);
  }

  // Reconciliation continuity check state
  const [reconCheckResult, setReconCheckResult] = useState(null);

  // Start the month-end closing flow: first run pre-checks
  async function handleStartClose(month) {
    setPreCheckMonth(month);
    setPreCheckResults(null);
    setReconCheckResult(null);
    setShowPreCheck(true);
    setPreCheckLoading(true);

    try {
      // Run reconciliation continuity check in parallel with month-end
      const [monthEndRes, reconRes] = await Promise.all([
        fetch('/api/month-end', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            year: selectedYear,
            month,
            closedBy: userName
          })
        }),
        fetch(`/api/reconciliation/continuity-check?year=${selectedYear}&month=${month}`).catch(() => null),
      ]);

      const data = await monthEndRes.json();

      // Process reconciliation check
      if (reconRes && reconRes.ok) {
        const reconData = await reconRes.json();
        setReconCheckResult(reconData);
      }

      if (data.error) {
        setPreCheckResults({ error: data.error });
      } else {
        setPreCheckResults(data);
        fetchMonthData();
      }
    } catch (error) {
      setPreCheckResults({ error: '月結作業執行失敗: ' + error.message });
    }
    setPreCheckLoading(false);
  }

  // Lock a month-end
  async function handleLock(statusId) {
    if (!confirm('確定要鎖定此月份？鎖定後需要管理員才能解鎖。')) return;
    setLockLoading(true);
    try {
      const res = await fetch(`/api/month-end/${statusId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'lock' })
      });
      const data = await res.json();
      if (data.success) {
        fetchMonthData();
      } else {
        showToast(data.error || '鎖定失敗', 'error');
      }
    } catch (error) {
      showToast('鎖定失敗: ' + error.message, 'error');
    }
    setLockLoading(false);
  }

  // Open unlock modal
  function handleUnlockClick(monthData) {
    setUnlockTarget(monthData);
    setUnlockReason('');
    setShowUnlock(true);
  }

  // Submit unlock
  async function handleUnlockSubmit() {
    if (!unlockReason.trim()) {
      showToast('請輸入解鎖原因', 'error');
      return;
    }
    setUnlockLoading(true);
    try {
      const res = await fetch(`/api/month-end/${unlockTarget.statusId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'unlock',
          unlockedBy: userName,
          unlockReason: unlockReason.trim()
        })
      });
      const data = await res.json();
      if (data.success) {
        setShowUnlock(false);
        fetchMonthData();
      } else {
        showToast(data.error || '解鎖失敗', 'error');
      }
    } catch (error) {
      showToast('解鎖失敗: ' + error.message, 'error');
    }
    setUnlockLoading(false);
  }

  // View month detail (all reports)
  async function handleViewDetail(statusId) {
    setShowMonthDetail(true);
    setMonthDetail(null);
    setMonthDetailLoading(true);
    try {
      const res = await fetch(`/api/month-end/${statusId}`);
      const data = await res.json();
      setMonthDetail(data);
    } catch (error) {
      console.error('載入月結詳情失敗:', error);
    }
    setMonthDetailLoading(false);
  }

  // View a single report
  async function handleViewReport(reportId) {
    setShowReport(true);
    setReportData(null);
    setReportLoading(true);
    try {
      const res = await fetch(`/api/month-end/reports/${reportId}`);
      const data = await res.json();
      setReportData(data);
    } catch (error) {
      console.error('載入報表失敗:', error);
    }
    setReportLoading(false);
  }

  // Render a single report data as formatted tables
  function renderReportTable(reportType, data) {
    if (!data) return <p className="text-gray-500 text-sm">無資料</p>;

    switch (reportType) {
      case '進貨彙總':
        return (
          <div className="space-y-4">
            <div className="flex gap-4 text-sm">
              <span className="text-gray-600">期間: <strong>{data.period}</strong></span>
              <span className="text-gray-600">筆數: <strong>{data.totalCount}</strong></span>
              <span className="text-gray-600">總金額: <strong className="text-slate-700">${formatNumber(data.totalAmount)}</strong></span>
            </div>
            {data.bySupplier && data.bySupplier.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-slate-700 mb-2">依廠商</h4>
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="text-left p-2 border border-slate-200">廠商</th>
                      <th className="text-right p-2 border border-slate-200">筆數</th>
                      <th className="text-right p-2 border border-slate-200">金額</th>
                      <th className="text-right p-2 border border-slate-200">稅額</th>
                      <th className="text-right p-2 border border-slate-200">含稅總計</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.bySupplier.map((row, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="p-2 border border-slate-200">{row.name}</td>
                        <td className="text-right p-2 border border-slate-200">{row.count}</td>
                        <td className="text-right p-2 border border-slate-200">${formatNumber(row.amount)}</td>
                        <td className="text-right p-2 border border-slate-200">${formatNumber(row.tax)}</td>
                        <td className="text-right p-2 border border-slate-200 font-medium">${formatNumber(row.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {data.byWarehouse && data.byWarehouse.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-slate-700 mb-2">依館別</h4>
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="text-left p-2 border border-slate-200">館別</th>
                      <th className="text-right p-2 border border-slate-200">筆數</th>
                      <th className="text-right p-2 border border-slate-200">金額</th>
                      <th className="text-right p-2 border border-slate-200">稅額</th>
                      <th className="text-right p-2 border border-slate-200">含稅總計</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byWarehouse.map((row, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="p-2 border border-slate-200">{row.name}</td>
                        <td className="text-right p-2 border border-slate-200">{row.count}</td>
                        <td className="text-right p-2 border border-slate-200">${formatNumber(row.amount)}</td>
                        <td className="text-right p-2 border border-slate-200">${formatNumber(row.tax)}</td>
                        <td className="text-right p-2 border border-slate-200 font-medium">${formatNumber(row.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );

      case '銷貨彙總':
        return (
          <div className="space-y-4">
            <div className="flex gap-4 text-sm">
              <span className="text-gray-600">期間: <strong>{data.period}</strong></span>
              <span className="text-gray-600">筆數: <strong>{data.totalCount}</strong></span>
              <span className="text-gray-600">總金額: <strong className="text-slate-700">${formatNumber(data.totalAmount)}</strong></span>
            </div>
            {data.byStatus && data.byStatus.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-slate-700 mb-2">依狀態</h4>
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="text-left p-2 border border-slate-200">狀態</th>
                      <th className="text-right p-2 border border-slate-200">筆數</th>
                      <th className="text-right p-2 border border-slate-200">總計</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byStatus.map((row, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="p-2 border border-slate-200">{row.name}</td>
                        <td className="text-right p-2 border border-slate-200">{row.count}</td>
                        <td className="text-right p-2 border border-slate-200 font-medium">${formatNumber(row.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {data.byWarehouse && data.byWarehouse.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-slate-700 mb-2">依館別</h4>
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="text-left p-2 border border-slate-200">館別</th>
                      <th className="text-right p-2 border border-slate-200">筆數</th>
                      <th className="text-right p-2 border border-slate-200">總計</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byWarehouse.map((row, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="p-2 border border-slate-200">{row.name}</td>
                        <td className="text-right p-2 border border-slate-200">{row.count}</td>
                        <td className="text-right p-2 border border-slate-200 font-medium">${formatNumber(row.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );

      case '支出彙總':
        return (
          <div className="space-y-4">
            <div className="flex gap-4 text-sm">
              <span className="text-gray-600">期間: <strong>{data.period}</strong></span>
              <span className="text-gray-600">筆數: <strong>{data.totalCount}</strong></span>
              <span className="text-gray-600">總金額: <strong className="text-slate-700">${formatNumber(data.totalAmount)}</strong></span>
            </div>
            {data.byCategory && data.byCategory.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-slate-700 mb-2">依類別</h4>
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="text-left p-2 border border-slate-200">類別</th>
                      <th className="text-right p-2 border border-slate-200">筆數</th>
                      <th className="text-right p-2 border border-slate-200">總計</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byCategory.map((row, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="p-2 border border-slate-200">{row.name}</td>
                        <td className="text-right p-2 border border-slate-200">{row.count}</td>
                        <td className="text-right p-2 border border-slate-200 font-medium">${formatNumber(row.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {data.byWarehouse && data.byWarehouse.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-slate-700 mb-2">依館別</h4>
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="text-left p-2 border border-slate-200">館別</th>
                      <th className="text-right p-2 border border-slate-200">筆數</th>
                      <th className="text-right p-2 border border-slate-200">總計</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byWarehouse.map((row, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="p-2 border border-slate-200">{row.name}</td>
                        <td className="text-right p-2 border border-slate-200">{row.count}</td>
                        <td className="text-right p-2 border border-slate-200 font-medium">${formatNumber(row.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );

      case '現金流彙總':
        return (
          <div className="space-y-4">
            <div className="flex gap-4 text-sm">
              <span className="text-gray-600">期間: <strong>{data.period}</strong></span>
              <span className="text-gray-600">交易筆數: <strong>{data.totalTransactions}</strong></span>
            </div>
            {data.byAccountType && data.byAccountType.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-slate-700 mb-2">依帳戶類型</h4>
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="text-left p-2 border border-slate-200">帳戶類型</th>
                      <th className="text-right p-2 border border-slate-200">收入</th>
                      <th className="text-right p-2 border border-slate-200">支出</th>
                      <th className="text-right p-2 border border-slate-200">移轉</th>
                      <th className="text-right p-2 border border-slate-200">淨額</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byAccountType.map((row, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="p-2 border border-slate-200">{row.name}</td>
                        <td className="text-right p-2 border border-slate-200 text-green-600">${formatNumber(row.income)}</td>
                        <td className="text-right p-2 border border-slate-200 text-red-600">${formatNumber(row.expense)}</td>
                        <td className="text-right p-2 border border-slate-200 text-blue-600">${formatNumber(row.transfer)}</td>
                        <td className="text-right p-2 border border-slate-200 font-medium">${formatNumber(row.net)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );

      default:
        // Generic JSON display
        return (
          <pre className="bg-gray-50 p-3 rounded text-xs overflow-auto max-h-96">
            {JSON.stringify(data, null, 2)}
          </pre>
        );
    }
  }

  // Status badge component
  function StatusBadge({ status }) {
    const style = STATUS_BADGES[status] || STATUS_BADGES['未結帳'];
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${style.bg} ${style.text}`}>
        <span className={`w-2 h-2 rounded-full ${style.dot}`}></span>
        {status}
      </span>
    );
  }

  const yearOptions = [];
  for (let y = currentYear + 1; y >= currentYear - 5; y--) {
    yearOptions.push(y);
  }

  return (
    <div className="min-h-screen page-bg-monthend">
      <Navigation borderColor="border-slate-500" />

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Page header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">月結作業</h2>
            <p className="text-sm text-gray-500 mt-1">管理每月結帳流程、報表快照與期間鎖定</p>
          </div>
          <div className="flex items-center gap-3">
            <ExportButtons
              data={monthsData.map(m => ({
                year: selectedYear,
                month: m.month,
                status: m.status,
                closedAt: m.closedAt,
                closedBy: m.closedBy,
                note: m.note || '',
              }))}
              columns={EXPORT_CONFIGS.monthEnd.columns}
              exportName={EXPORT_CONFIGS.monthEnd.filename}
              period={String(selectedYear)}
              title={`${selectedYear} 年月結作業`}
              sheetName="月結狀態"
            />
            <label className="text-sm text-gray-600 font-medium">年度:</label>
            <select
              value={selectedYear}
              onChange={e => setSelectedYear(parseInt(e.target.value))}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-slate-400 focus:border-slate-400"
            >
              {yearOptions.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-600"></div>
            <span className="ml-3 text-gray-500">載入中...</span>
          </div>
        )}

        {/* Month cards grid */}
        {!loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {monthsData.map((md) => {
              const isClosed = md.status === '已結帳';
              const isLocked = md.status === '已鎖定';
              const isOpen = md.status === '未結帳';
              const isPast = new Date(selectedYear, md.month - 1, 1) < new Date(currentYear, new Date().getMonth(), 1);

              return (
                <div
                  key={md.month}
                  className={`bg-white rounded-xl shadow-sm border transition-all hover:shadow-md ${
                    isLocked ? 'border-blue-200' :
                    isClosed ? 'border-green-200' :
                    'border-gray-200'
                  }`}
                >
                  {/* Month header */}
                  <div className={`px-4 py-3 rounded-t-xl flex items-center justify-between ${
                    isLocked ? 'bg-blue-50' :
                    isClosed ? 'bg-green-50' :
                    'bg-slate-50'
                  }`}>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold text-slate-700">
                        {String(md.month).padStart(2, '0')}
                      </span>
                      <span className="text-sm text-slate-500">{MONTH_NAMES[md.month - 1]}</span>
                    </div>
                    <StatusBadge status={md.status} />
                  </div>

                  {/* Month body */}
                  <div className="px-4 py-3 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">進貨</span>
                      <span className="text-gray-700">
                        {md.purchaseCount} 筆 / <span className="font-medium">${formatNumber(md.purchaseTotal)}</span>
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">銷貨</span>
                      <span className="text-gray-700">
                        {md.salesCount} 筆 / <span className="font-medium">${formatNumber(md.salesTotal)}</span>
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">支出</span>
                      <span className="text-gray-700 font-medium">${formatNumber(md.expenseTotal)}</span>
                    </div>
                    {md.reportCount > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">報表</span>
                        <span className="text-slate-600 font-medium">{md.reportCount} 份</span>
                      </div>
                    )}
                    {md.closedAt && (
                      <div className="text-xs text-gray-400 pt-1 border-t border-gray-100">
                        結帳: {new Date(md.closedAt).toLocaleDateString('zh-TW')}
                        {md.closedBy ? ` (${md.closedBy})` : ''}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="px-4 py-3 border-t border-gray-100 flex gap-2 flex-wrap">
                    {isOpen && (
                      <button
                        onClick={() => handleStartClose(md.month)}
                        disabled={preCheckLoading}
                        className="flex-1 text-xs bg-slate-600 text-white px-3 py-1.5 rounded-lg hover:bg-slate-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {preCheckLoading ? '執行中...' : '開始月結'}
                      </button>
                    )}
                    {isClosed && (
                      <>
                        <button
                          onClick={() => handleViewDetail(md.statusId)}
                          className="flex-1 text-xs bg-white border border-slate-300 text-slate-600 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors"
                        >
                          檢視報表
                        </button>
                        <button
                          onClick={() => handleLock(md.statusId)}
                          disabled={lockLoading}
                          className="flex-1 text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50"
                        >
                          鎖定
                        </button>
                      </>
                    )}
                    {isLocked && (
                      <>
                        <button
                          onClick={() => handleViewDetail(md.statusId)}
                          className="flex-1 text-xs bg-white border border-slate-300 text-slate-600 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors"
                        >
                          檢視報表
                        </button>
                        {isAdmin && (
                          <button
                            onClick={() => handleUnlockClick(md)}
                            className="flex-1 text-xs bg-amber-500 text-white px-3 py-1.5 rounded-lg hover:bg-amber-600 transition-colors font-medium"
                          >
                            解鎖
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ========================================== */}
      {/* Pre-check / Closing Result Modal */}
      {/* ========================================== */}
      {showPreCheck && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-auto">
            <div className="sticky top-0 bg-white px-6 py-4 border-b border-slate-200 flex items-center justify-between z-10">
              <h3 className="text-lg font-bold text-slate-800">
                月結作業 - {selectedYear}/{String(preCheckMonth).padStart(2, '0')}
              </h3>
              <button
                onClick={() => { if (!preCheckLoading) setShowPreCheck(false); }}
                disabled={preCheckLoading}
                className="text-gray-400 hover:text-gray-600 text-xl font-bold disabled:opacity-30 disabled:cursor-not-allowed"
              >
                &times;
              </button>
            </div>

            <div className="px-6 py-4">
              {preCheckLoading && (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-600"></div>
                  <span className="ml-3 text-gray-500">執行月結作業中...</span>
                </div>
              )}

              {preCheckResults && preCheckResults.error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <p className="text-red-700 font-medium">{preCheckResults.error}</p>
                </div>
              )}

              {preCheckResults && preCheckResults.success && (
                <div className="space-y-6">
                  {/* Success banner */}
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
                    <svg className="w-6 h-6 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div>
                      <p className="text-green-800 font-medium">月結作業完成</p>
                      <p className="text-green-600 text-sm">已建立 {preCheckResults.reports?.length || 0} 份報表快照</p>
                    </div>
                  </div>

                  {/* Background report failure warning */}
                  {preCheckResults.reportGenerationFailed && (
                    <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-3 flex items-start gap-2">
                      <svg className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.268 16.5c-.77.833.192 2.5 1.732 2.5z" />
                      </svg>
                      <div>
                        <p className="text-sm font-medium text-yellow-800">自動業務報告產生失敗</p>
                        <p className="text-xs text-yellow-700 mt-0.5">月結資料已正常儲存，但背景業務報告未能自動產生，請通知管理員處理。</p>
                        {preCheckResults.reportGenerationError && (
                          <p className="text-xs text-yellow-600 mt-1 font-mono">{preCheckResults.reportGenerationError}</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Reconciliation Continuity Check */}
                  {reconCheckResult && (
                    <div>
                      <h4 className="text-sm font-semibold text-slate-700 mb-3">對帳連續性檢查</h4>
                      <div className="space-y-2">
                        {(reconCheckResult.accounts || []).map((acc, i) => (
                          <div key={i} className={`flex items-center justify-between p-3 rounded-lg border ${
                            acc.continuous ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'
                          }`}>
                            <div className="flex items-center gap-2">
                              {acc.continuous ? (
                                <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                              ) : (
                                <svg className="w-5 h-5 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.268 16.5c-.77.833.192 2.5 1.732 2.5z" />
                                </svg>
                              )}
                              <span className="text-sm">{acc.accountName}</span>
                            </div>
                            <span className={`text-xs ${acc.continuous ? 'text-green-600' : 'text-yellow-600'}`}>
                              {acc.continuous ? '連續' : `缺少 ${acc.missingMonths?.join(', ') || '部分'} 月`}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Pre-check results */}
                  <div>
                    <h4 className="text-sm font-semibold text-slate-700 mb-3">前置檢查結果</h4>
                    <div className="space-y-2">
                      {preCheckResults.preChecks?.map((check, i) => (
                        <div
                          key={i}
                          className={`flex items-center justify-between p-3 rounded-lg border ${
                            check.passed
                              ? 'bg-green-50 border-green-200'
                              : 'bg-yellow-50 border-yellow-200'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            {check.passed ? (
                              <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            ) : (
                              <svg className="w-5 h-5 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.268 16.5c-.77.833.192 2.5 1.732 2.5z" />
                              </svg>
                            )}
                            <span className={`text-sm ${check.passed ? 'text-green-700' : 'text-yellow-700'}`}>
                              {check.name}
                            </span>
                          </div>
                          <span className={`text-sm font-medium ${
                            check.passed ? 'text-green-600' : 'text-yellow-600'
                          }`}>
                            {check.passed ? '通過' : `${check.count} 筆待處理`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Summary */}
                  <div>
                    <h4 className="text-sm font-semibold text-slate-700 mb-3">月結摘要</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <div className="bg-slate-50 rounded-lg p-3 text-center">
                        <p className="text-xs text-gray-500">進貨</p>
                        <p className="text-lg font-bold text-slate-700">{preCheckResults.summary?.purchaseCount || 0}</p>
                        <p className="text-xs text-gray-500">${formatNumber(preCheckResults.summary?.purchaseTotal)}</p>
                      </div>
                      <div className="bg-slate-50 rounded-lg p-3 text-center">
                        <p className="text-xs text-gray-500">銷貨</p>
                        <p className="text-lg font-bold text-slate-700">{preCheckResults.summary?.salesCount || 0}</p>
                        <p className="text-xs text-gray-500">${formatNumber(preCheckResults.summary?.salesTotal)}</p>
                      </div>
                      <div className="bg-slate-50 rounded-lg p-3 text-center">
                        <p className="text-xs text-gray-500">支出</p>
                        <p className="text-lg font-bold text-slate-700">${formatNumber(preCheckResults.summary?.expenseTotal)}</p>
                      </div>
                      <div className="bg-slate-50 rounded-lg p-3 text-center">
                        <p className="text-xs text-gray-500">現金交易</p>
                        <p className="text-lg font-bold text-slate-700">{preCheckResults.summary?.cashTransactions || 0}</p>
                      </div>
                    </div>
                  </div>

                  {/* Generated reports list */}
                  {preCheckResults.reports && preCheckResults.reports.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-slate-700 mb-3">已產生報表</h4>
                      <div className="space-y-2">
                        {preCheckResults.reports.map((r) => (
                          <div
                            key={r.id}
                            className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200"
                          >
                            <div>
                              <span className="text-sm font-medium text-slate-700">{r.reportType}</span>
                              <span className="text-xs text-gray-400 ml-2">
                                {new Date(r.generatedAt).toLocaleString('zh-TW')}
                              </span>
                            </div>
                            <button
                              onClick={() => handleViewReport(r.id)}
                              className="text-xs text-slate-600 hover:text-slate-800 underline"
                            >
                              檢視
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* Month Detail Modal (all reports for a month) */}
      {/* ========================================== */}
      {showMonthDetail && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-auto">
            <div className="sticky top-0 bg-white px-6 py-4 border-b border-slate-200 flex items-center justify-between z-10">
              <h3 className="text-lg font-bold text-slate-800">
                {monthDetail ? `${monthDetail.year}/${String(monthDetail.month).padStart(2, '0')} 月結報表` : '月結詳情'}
              </h3>
              <button
                onClick={() => setShowMonthDetail(false)}
                className="text-gray-400 hover:text-gray-600 text-xl font-bold"
              >
                &times;
              </button>
            </div>

            <div className="px-6 py-4">
              {monthDetailLoading && (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-600"></div>
                  <span className="ml-3 text-gray-500">載入中...</span>
                </div>
              )}

              {monthDetail && (
                <div className="space-y-6">
                  {/* Month info */}
                  <div className="flex items-center gap-4 text-sm">
                    <StatusBadge status={monthDetail.status} />
                    {monthDetail.closedAt && (
                      <span className="text-gray-500">
                        結帳時間: {new Date(monthDetail.closedAt).toLocaleString('zh-TW')}
                      </span>
                    )}
                    {monthDetail.closedBy && (
                      <span className="text-gray-500">操作者: {monthDetail.closedBy}</span>
                    )}
                    {monthDetail.lockedAt && (
                      <span className="text-blue-600">
                        鎖定時間: {new Date(monthDetail.lockedAt).toLocaleString('zh-TW')}
                      </span>
                    )}
                  </div>

                  {monthDetail.unlockReason && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
                      <p className="text-amber-800">
                        <strong>曾解鎖:</strong> {monthDetail.unlockReason}
                      </p>
                      <p className="text-amber-600 text-xs mt-1">
                        由 {monthDetail.unlockedBy} 於 {new Date(monthDetail.unlockedAt).toLocaleString('zh-TW')} 解鎖
                      </p>
                    </div>
                  )}

                  {/* Reports */}
                  {monthDetail.reports && monthDetail.reports.length > 0 ? (
                    <div className="space-y-6">
                      {monthDetail.reports.map((report) => (
                        <div key={report.id} className="border border-slate-200 rounded-lg overflow-hidden">
                          <div className="bg-slate-50 px-4 py-3 flex items-center justify-between">
                            <h4 className="font-semibold text-slate-700">{report.reportType}</h4>
                            <span className="text-xs text-gray-400">
                              {new Date(report.generatedAt).toLocaleString('zh-TW')}
                            </span>
                          </div>
                          <div className="p-4 overflow-x-auto">
                            {renderReportTable(report.reportType, report.reportData)}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-center py-8">無報表資料</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* Single Report Viewer Modal */}
      {/* ========================================== */}
      {showReport && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-auto">
            <div className="sticky top-0 bg-white px-6 py-4 border-b border-slate-200 flex items-center justify-between z-10">
              <h3 className="text-lg font-bold text-slate-800">
                {reportData ? reportData.reportType : '報表'}
              </h3>
              <button
                onClick={() => setShowReport(false)}
                className="text-gray-400 hover:text-gray-600 text-xl font-bold"
              >
                &times;
              </button>
            </div>

            <div className="px-6 py-4">
              {reportLoading && (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-600"></div>
                  <span className="ml-3 text-gray-500">載入中...</span>
                </div>
              )}

              {reportData && (
                <div className="space-y-4">
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span>期間: {reportData.year}/{String(reportData.month).padStart(2, '0')}</span>
                    {reportData.warehouse && <span>館別: {reportData.warehouse}</span>}
                    <span>產生時間: {new Date(reportData.generatedAt).toLocaleString('zh-TW')}</span>
                  </div>
                  <div className="overflow-x-auto">
                    {renderReportTable(reportData.reportType, reportData.reportData)}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* Unlock Modal */}
      {/* ========================================== */}
      {showUnlock && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-slate-200">
              <h3 className="text-lg font-bold text-slate-800">解鎖月結</h3>
            </div>

            <div className="px-6 py-4 space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-amber-800 text-sm font-medium">
                  即將解鎖 {selectedYear}/{String(unlockTarget?.month).padStart(2, '0')} 月結
                </p>
                <p className="text-amber-600 text-xs mt-1">
                  解鎖後將允許修改該月份的資料，此操作僅限管理員執行。
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  解鎖原因 <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={unlockReason}
                  onChange={e => setUnlockReason(e.target.value)}
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-400 focus:border-amber-400"
                  placeholder="請說明解鎖原因..."
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-2">
              <button
                onClick={() => setShowUnlock(false)}
                className="px-4 py-2 text-sm border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleUnlockSubmit}
                disabled={unlockLoading || !unlockReason.trim()}
                className="px-4 py-2 text-sm bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors font-medium disabled:opacity-50"
              >
                {unlockLoading ? '處理中...' : '確認解鎖'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
