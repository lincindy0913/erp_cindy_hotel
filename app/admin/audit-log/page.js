'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Navigation from '@/components/Navigation';
import ExportButtons from '@/components/ExportButtons';
import { EXPORT_CONFIGS } from '@/lib/export-columns';

const ACTION_LABELS = {
  'payment_order.create': '建立付款單',
  'payment_order.update': '修改付款單',
  'payment_order.void': '作廢付款單',
  'cashier.execute': '出約確認執行',
  'cashier.void': '出納作廢',
  'cashier.reject': '出納退回',
  'cash_transaction.create': '建立現金交易',
  'cash_transaction.update': '修攺現金交易',
  'cash_transaction.reverse': '沉鈷現金交易',
  'cash_account.create': '建立現金帳戴',
  'cash_account.update': '修改現金帶戶',
  'check.create': '建立支祠',
  'check.clear': '支票兌現',
  'check.void': '支票作庢',
  'check.bounce': '支票退祠',
  'loan.create': '建立買款',
  'loan_record.confirm': '貸款核實',
  'loan_record.delete': '刪除買款記錄',
  'month_end.close': '月結關尳',
  'month_end.unlock': '月結解鎖',
  'system_config.update': '系統設定修改',
  'user.create': '建立使用者',
  'user.update': '修改使用者',
  'user.deactivate': '停用使用者',
  'user_role.assign': '指派角色',
  'user_role.remove': '移除角色',
  'auth.login': '登入成功',
  'auth.login_failed': '登入失敗',
  'attachment.upload': '上傳附件',
  'attachment.delete': '刪除附件',
  'attempt.unauthorized': '未授權存取',
  'attempt.delete_confirmed': '嘗試刪除已確認記錄',
  'attempt.modify_locked': '嗗詖修改已鎖定期間',
};

const LEVEL_STYLES = {
  finance: 'bg-indigo-100 text-indigo-800',
  admin: 'bg-red-100 text-red-800',
  operation: 'bg-blue-100 text-blue-800',
  attempt: 'bg-yellow-100 text-yellow-800',
};

const LEVEL_LABELS = {
  finance: '財務',
  admin: '管理',
  operation: '操作',
  attempt: '嗗試',
};

const TABS = [
  { key: 'logs', label: '操作日誌' },
  { key: 'critical', label: '重大決策' },
  { key: 'compliance', label: '合規報告' },
];

function defaultAuditDateFrom() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().split('T')[0];
}

export default function AuditLogPage() {
  const { data: session } = useSession();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 0 });
  const [expandedId, setExpandedId] = useState(null);

  // Filters
  const [filters, setFilters] = useState({
    level: '',
    action: '',
    userEmail: '',
    dateFrom: defaultAuditDateFrom(),
    dateTo: '',
    keyword: '',
  });

  const [summary, setSummary] = useState({ todayOps: 0, monthFinance: 0, monthAttempts: 0 });

  // Tab state
  const [activeTab, setActiveTab] = useState('logs');

  // Critical decisions state
  const [criticalDecisions, setCriticalDecisions] = useState([]);
  const [criticalLoading, setCriticalLoading] = useState(false);

  // Compliance report state
  const [complianceReport, setComplianceReport] = useState(null);
  const [complianceLoading, setComplianceLoading] = useState(false);
  const [complianceYear, setComplianceYear] = useState(new Date().getFullYear());
  const [complianceMonth, setComplianceMonth] = useState(new Date().getMonth() + 1);

  // Cleanup state
  const [showCleanupModal, setShowCleanupModal] = useState(false);
  const [cleanupDays, setCleanupDays] = useState(90);
  const [cleanupPreview, setCleanupPreview] = useState(null);
  const [cleanupResult, setCleanupResult] = useState(null);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [cleanupConfirm, setCleanupConfirm] = useState('');

  useEffect(() => {
    fetchLogs(1);
    fetchSummary();
  }, []);

  async function fetchLogs(page) {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: page.toString(), limit: '50' });
      Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });

      const res = await fetch(`/api/audit-logs?${params}`);
      const data = await res.json();
      setLogs(data.data || []);
      setPagination(data.pagination || { page: 1, total: 0, totalPages: 0 });
    } catch { setLogs([]); }
    setLoading(false);
  }

  async function fetchSummary() {
    try {
      const today = new Date().toISOString().split('T')[0];
      const monthStart = today.substring(0, 7) + '-01';

      const [todayRes, financeRes, attemptRes] = await Promise.all([
        fetch(`/api/audit-logs?dateFrom=${today}&dateTo=${today}&limit=1`),
        fetch(`/api/audit-logs?level=finance&dateFrom=${monthStart}&limit=1`),
        fetch(`/api/audit-logs?level=attempt&dateFrom=${monthStart}&limit=1`),
      ]);

      const [todayData, financeData, attemptData] = await Promise.all([
        todayRes.json(), financeRes.json(), attemptRes.json(),
      ]);

      setSummary({
        todayOps: todayData.pagination?.total || 0,
        monthFinance: financeData.pagination?.total || 0,
        monthAttempts: attemptData.pagination?.total || 0,
      });
    } catch {}
  }

  function handleSearch(e) {
    e.preventDefault();
    fetchLogs(1);
  }

  function handleReset() {
    setFilters({ level: '', action: '', userEmail: '', dateFrom: defaultAuditDateFrom(), dateTo: '', keyword: '' });
    setTimeout(() => fetchLogs(1), 0);
  }

  async function handleCleanupPreview() {
    setCleanupLoading(true);
    setCleanupPreview(null);
    try {
      const res = await fetch('/api/audit-logs/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preview: true, retentionDays: cleanupDays }),
      });
      const data = await res.json();
      setCleanupPreview(data);
    } catch {
      alert('預覽失敗，請稍後再試');
    }
    setCleanupLoading(false);
  }

  async function handleCleanupConfirm() {
    if (cleanupConfirm !== '確認清理') return;
    setCleanupLoading(true);
    try {
      const res = await fetch('/api/audit-logs/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preview: false, retentionDays: cleanupDays }),
      });
      const data = await res.json();
      setCleanupResult(data);
      setCleanupPreview(null);
      setCleanupConfirm('');
      fetchLogs(1);
      fetchSummary();
    } catch {
      alert('清理失敗，請稍後再試');
    }
    setCleanupLoading(false);
  }

  function handleCleanupClose() {
    setShowCleanupModal(false);
    setCleanupPreview(null);
    setCleanupResult(null);
    setCleanupConfirm('');
    setCleanupDays(90);
  }

  async function fetchCriticalDecisions() {
    setCriticalLoading(true);
    try {
      const res = await fetch('/api/audit-logs/critical-decisions');
      const data = await res.json();
      setCriticalDecisions(data.data || []);
    } catch {
      setCriticalDecisions([]);
    }
    setCriticalLoading(false);
  }

  async function fetchComplianceReport(year, month) {
    setComplianceLoading(true);
    try {
      const res = await fetch(`/api/audit-logs/compliance-report?year=${year}&month=${month}`);
      const data = await res.json();
      setComplianceReport(data.data || data);
    } catch {
      setComplianceReport(null);
    }
    setComplianceLoading(false);
  }

  function handleTabChange(tabKey) {
    setActiveTab(tabKey);
    if (tabKey === 'critical' && criticalDecisions.length === 0) {
      fetchCriticalDecisions();
    }
    if (tabKey === 'compliance' && !complianceReport) {
      fetchComplianceReport(complianceYear, complianceMonth);
    }
  }

  function getScoreColor(score) {
    if (score < 60) return 'text-red-600';
    if (score < 80) return 'text-yellow-600';
    return 'text-green-600';
  }

  function getScoreBg(score) {
    if (score < 60) return 'bg-red-100 border-red-300';
    if (score < 80) return 'bg-yellow-100 border-yellow-300';
    return 'bg-green-100 border-green-300';
  }

  function renderStateDiff(before, after) {
    if (!before && !after) return <p className="text-gray-400 text-sm">無狀態記錄</p>;

    const beforeObj = before && typeof before === 'object' ? before : {};
    const afterObj = after && typeof after === 'object' ? after : {};
    const allKeys = [...new Set([...Object.keys(beforeObj), ...Object.keys(afterObj)])];

    return (
      <div className="grid grid-cols-2 gap-4">
        <div>
          <h4 className="text-sm font-medium text-gray-500 mb-2">變更前</h4>
          <pre className="text-xs bg-gray-50 p-3 rounded overflow-auto max-h-48">
            {before ? JSON.stringify(before, null, 2) : '(無)'}
          </pre>
        </div>
        <div>
          <h4 className="text-sm font-medium text-gray-500 mb-2">變更後</h4>
          <pre className="text-xs bg-gray-50 p-3 rounded overflow-auto max-h-48">
            {after ? JSON.stringify(after, null, 2) : '(無)'}
          </pre>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen page-bg-audit">
      <Navigation borderColor="border-zinc-500" />
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-zinc-800">稽核日誌</h2>
          {activeTab === 'logs' && (
            <div className="flex items-center gap-2">
              <ExportButtons
                data={logs.map(log => ({
                  ...log,
                  actionLabel: ACTION_LABELS[log.action] || log.action,
                  levelLabel: LEVEL_LABELS[log.level] || log.level,
                }))}
                columns={EXPORT_CONFIGS.auditLog.columns}
                exportName={EXPORT_CONFIGS.auditLog.filename}
                title="稽核日誌"
                sheetName="稽核日誌"
              />
              {session?.user?.role === 'admin' && (
                <button
                  onClick={() => setShowCleanupModal(true)}
                  className="bg-red-600 text-white px-3 py-2 rounded text-sm hover:bg-red-700"
                >
                  清理舊日誌
                </button>
              )}
            </div>
          )}
        </div>

        {/* Tab Buttons */}
        <div className="flex flex-wrap gap-1 mb-6 bg-white rounded-lg shadow p-1">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              className={`flex-1 px-4 py-2.5 rounded-md text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'bg-zinc-700 text-white shadow-sm'
                  : 'text-zinc-600 hover:bg-zinc-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab: 操作日誌 */}
        {activeTab === 'logs' && (<>
        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-blue-500">
            <p className="text-sm text-gray-500">今日操作</p>
            <p className="text-2xl font-bold text-blue-700">{summary.todayOps}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-indigo-500">
            <p className="text-sm text-gray-500">本月財務操作</p>
            <p className="text-2xl font-bold text-indigo-700">{summary.monthFinance}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-yellow-500">
            <p className="text-sm text-gray-500">本月異常嘗試</p>
            <p className="text-2xl font-bold text-yellow-700">{summary.monthAttempts}</p>
          </div>
        </div>

        {/* Filter Bar */}
        <form onSubmit={handleSearch} className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="grid grid-cols-6 gap-3">
            <select value={filters.level} onChange={e => setFilters({...filters, level: e.target.value})}
              className="border rounded px-3 py-2 text-sm">
              <option value="">全部等紀</option>
              <option value="finance">財務</option>
              <option value="admin">管理</option>
              <option value="operation">操作</option>
              <option value="attempt">嗗試</option>
            </select>
            <input type="text" placeholder="操作者信箥" value={filters.userEmail}
              onChange={e => setFilters({...filters, userEmail: e.target.value})}
              className="border rounded px-3 py-2 text-sm" />
            <input type="date" value={filters.dateFrom}
              onChange={e => setFilters({...filters, dateFrom: e.target.value})}
              className="border rounded px-3 py-2 text-sm" />
            <input type="date" value={filters.dateTo}
              onChange={e => setFilters({...filters, dateTo: e.target.value})}
              className="border rounded px-3 py-2 text-sm" />
            <input type="text" placeholder="關鍵字搜尋" value={filters.keyword}
              onChange={e => setFilters({...filters, keyword: e.target.value})}
              className="border rounded px-3 py-2 text-sm" />
            <div className="flex gap-2">
              <button type="submit" className="bg-zinc-600 text-white px-4 py-2 rounded text-sm hover:bg-zinc-700">搜尋</button>
              <button type="button" onClick={handleReset} className="border border-gray-300 px-4 py-2 rounded text-sm hover:bg-gray-50">清除</button>
            </div>
          </div>
        </form>

        {/* Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-500">載入中...</div>
          ) : logs.length === 0 ? (
            <div className="p-8 text-center text-gray-500">無稳核日誌記錄</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">時鐓</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">使用者</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">操作</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">等紀</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">模約</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">記錄編號</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-600">詳情</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <>
                    <tr key={log.id} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString('zh-TW')}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{log.userName || '-'}</div>
                        <div className="text-xs text-gray-400">{log.userEmail || '-'}</div>
                      </td>
                      <td className="px-4 py-3">{ACTION_LABELS[log.action] || log.action}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs ${LEVEL_STYLES[log.level] || 'bg-gray-100 text-gray-800'}`}>
                          {LEVEL_LABELS[log.level] || log.level}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{log.targetModule || '-'}</td>
                      <td className="px-4 py-3 text-gray-600">{log.targetRecordNo || '-'}</td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                          className="text-zinc-500 hover:text-zinc-700"
                        >
                          {expandedId === log.id ? '收合' : '展開'}
                        </button>
                      </td>
                    </tr>
                    {expandedId === log.id && (
                      <tr key={`detail-${log.id}`} className="bg-zinc-50">
                        <td colSpan={7} className="px-6 py-4">
                          {log.note && <p className="text-sm text-gray-600 mb-3">備註：{log.note}</p>}
                          {log.ipAddress && <p className="text-xs text-gray-400 mb-3">IP: {log.ipAddress}</p>}
                          {renderStateDiff(log.beforeState, log.afterState)}
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          )}

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50">
              <span className="text-sm text-gray-500">
                共 {pagination.total} 筆，第 {pagination.page} / {pagination.totalPages} 頁
              </span>
              <div className="flex gap-2">
                <button
                  disabled={pagination.page <= 1}
                  onClick={() => fetchLogs(pagination.page - 1)}
                  className="px-3 py-1 border rounded text-sm disabled:opacity-50 hover:bg-gray-100"
                >上一頁</button>
                <button
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() => fetchLogs(pagination.page + 1)}
                  className="px-3 py-1 border rounded text-sm disabled:opacity-50 hover:bg-gray-100"
                >下一頁</button>
              </div>
            </div>
          )}
        </div>
        </>)}

        {/* Tab: 重大決策 */}
        {activeTab === 'critical' && (
          <div>
            {/* Critical Summary */}
            <div className="bg-white rounded-lg shadow p-4 mb-6 border-l-4 border-red-500">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">重大決策總數</p>
                  <p className="text-2xl font-bold text-red-700">{criticalDecisions.length}</p>
                </div>
                <button
                  onClick={fetchCriticalDecisions}
                  className="bg-zinc-600 text-white px-4 py-2 rounded text-sm hover:bg-zinc-700"
                >
                  重新載入
                </button>
              </div>
            </div>

            {/* Critical Decisions Table */}
            <div className="bg-white rounded-lg shadow overflow-hidden">
              {criticalLoading ? (
                <div className="p-8 text-center text-gray-500">載入中...</div>
              ) : criticalDecisions.length === 0 ? (
                <div className="p-8 text-center text-gray-500">無重大決策記錄</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-zinc-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">時間</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">使用者</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">操作</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">等級</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">模組</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">備註</th>
                    </tr>
                  </thead>
                  <tbody>
                    {criticalDecisions.map(item => (
                      <tr key={item.id} className="border-b hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                          {new Date(item.createdAt).toLocaleString('zh-TW')}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium">{item.userName || '-'}</div>
                          <div className="text-xs text-gray-400">{item.userEmail || '-'}</div>
                        </td>
                        <td className="px-4 py-3">{ACTION_LABELS[item.action] || item.action}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-xs ${LEVEL_STYLES[item.level] || 'bg-gray-100 text-gray-800'}`}>
                            {LEVEL_LABELS[item.level] || item.level}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{item.targetModule || '-'}</td>
                        <td className="px-4 py-3 text-gray-600">{item.note || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* Tab: 合規報告 */}
        {activeTab === 'compliance' && (
          <div>
            {/* Year/Month Selector */}
            <div className="bg-white rounded-lg shadow p-4 mb-6">
              <div className="flex items-center gap-4">
                <label className="text-sm font-medium text-gray-600">選擇期間：</label>
                <select
                  value={complianceYear}
                  onChange={e => setComplianceYear(Number(e.target.value))}
                  className="border rounded px-3 py-2 text-sm"
                >
                  {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map(y => (
                    <option key={y} value={y}>{y} 年</option>
                  ))}
                </select>
                <select
                  value={complianceMonth}
                  onChange={e => setComplianceMonth(Number(e.target.value))}
                  className="border rounded px-3 py-2 text-sm"
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                    <option key={m} value={m}>{m} 月</option>
                  ))}
                </select>
                <button
                  onClick={() => fetchComplianceReport(complianceYear, complianceMonth)}
                  className="bg-zinc-600 text-white px-4 py-2 rounded text-sm hover:bg-zinc-700"
                >
                  查詢
                </button>
              </div>
            </div>

            {complianceLoading ? (
              <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">載入中...</div>
            ) : !complianceReport ? (
              <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">請選擇期間後查詢</div>
            ) : (
              <>
                {/* Compliance Score */}
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className={`rounded-lg shadow p-6 border text-center ${getScoreBg(complianceReport.score ?? 0)}`}>
                    <p className="text-sm text-gray-600 mb-2">合規分數</p>
                    <p className={`text-4xl font-bold ${getScoreColor(complianceReport.score ?? 0)}`}>
                      {complianceReport.score ?? '-'}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">滿分 100</p>
                  </div>
                  <div className="bg-white rounded-lg shadow p-6 border-l-4 border-yellow-500">
                    <p className="text-sm text-gray-500">異常次數</p>
                    <p className="text-3xl font-bold text-yellow-700">{complianceReport.anomalyCount ?? 0}</p>
                  </div>
                  <div className="bg-white rounded-lg shadow p-6 border-l-4 border-blue-500">
                    <p className="text-sm text-gray-500">總操作次數</p>
                    <p className="text-3xl font-bold text-blue-700">{complianceReport.totalOperations ?? 0}</p>
                  </div>
                </div>

                {/* Top Users Table */}
                {complianceReport.topUsers && complianceReport.topUsers.length > 0 && (
                  <div className="bg-white rounded-lg shadow overflow-hidden">
                    <div className="px-4 py-3 border-b bg-zinc-50">
                      <h3 className="text-sm font-medium text-gray-700">操作最多使用者</h3>
                    </div>
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="px-4 py-3 text-left font-medium text-gray-600">排名</th>
                          <th className="px-4 py-3 text-left font-medium text-gray-600">使用者</th>
                          <th className="px-4 py-3 text-left font-medium text-gray-600">信箱</th>
                          <th className="px-4 py-3 text-right font-medium text-gray-600">操作次數</th>
                        </tr>
                      </thead>
                      <tbody>
                        {complianceReport.topUsers.map((user, idx) => (
                          <tr key={user.email || idx} className="border-b hover:bg-gray-50">
                            <td className="px-4 py-3 text-gray-600">{idx + 1}</td>
                            <td className="px-4 py-3 font-medium">{user.name || '-'}</td>
                            <td className="px-4 py-3 text-gray-600">{user.email || '-'}</td>
                            <td className="px-4 py-3 text-right font-medium">{user.count ?? 0}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </main>

      {/* Cleanup Modal */}
      {showCleanupModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
            <h3 className="text-lg font-bold text-zinc-800 mb-1">清理舊日誌</h3>
            <p className="text-xs text-gray-500 mb-4">
              財務日誌保留 730 天、管理日誌保留 365 天，不受下方設定影響。
            </p>

            {cleanupResult ? (
              /* 完成畫面 */
              <div>
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                  <p className="text-sm font-medium text-green-800 mb-2">清理完成，共刪除 {cleanupResult.deleted.total} 筆</p>
                  <ul className="text-xs text-green-700 space-y-0.5">
                    <li>操作日誌：{cleanupResult.deleted.operation} 筆</li>
                    <li>嘗試記錄：{cleanupResult.deleted.attempt} 筆</li>
                    <li>財務日誌：{cleanupResult.deleted.finance} 筆</li>
                    <li>管理日誌：{cleanupResult.deleted.admin} 筆</li>
                  </ul>
                </div>
                <button onClick={handleCleanupClose} className="w-full bg-zinc-600 text-white py-2 rounded text-sm hover:bg-zinc-700">關閉</button>
              </div>
            ) : (
              <>
                {/* 保留天數選擇 */}
                <div className="mb-4">
                  <label className="text-sm font-medium text-gray-700 block mb-2">
                    操作 / 嘗試日誌保留天數
                  </label>
                  <div className="flex gap-2">
                    {[30, 60, 90, 180, 365].map(d => (
                      <button
                        key={d}
                        onClick={() => { setCleanupDays(d); setCleanupPreview(null); setCleanupConfirm(''); }}
                        className={`flex-1 py-1.5 rounded text-sm border ${cleanupDays === d ? 'bg-zinc-700 text-white border-zinc-700' : 'border-gray-300 hover:bg-gray-50'}`}
                      >
                        {d}天
                      </button>
                    ))}
                  </div>
                </div>

                {/* 預覽結果 */}
                {cleanupPreview && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-xs">
                    <p className="font-medium text-amber-800 mb-1.5">預計刪除 {cleanupPreview.counts.total} 筆</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-amber-700">
                      <span>操作日誌（{cleanupPreview.cutoffs.operation} 前）</span>
                      <span className="text-right font-medium">{cleanupPreview.counts.operation} 筆</span>
                      <span>嘗試記錄（{cleanupPreview.cutoffs.attempt} 前）</span>
                      <span className="text-right font-medium">{cleanupPreview.counts.attempt} 筆</span>
                      <span>財務日誌（{cleanupPreview.cutoffs.finance} 前）</span>
                      <span className="text-right font-medium">{cleanupPreview.counts.finance} 筆</span>
                      <span>管理日誌（{cleanupPreview.cutoffs.admin} 前）</span>
                      <span className="text-right font-medium">{cleanupPreview.counts.admin} 筆</span>
                    </div>
                  </div>
                )}

                {/* 確認輸入 */}
                {cleanupPreview && cleanupPreview.counts.total > 0 && (
                  <div className="mb-4">
                    <label className="text-sm text-gray-600 block mb-1">
                      輸入「<span className="font-mono font-bold">確認清理</span>」以繼續
                    </label>
                    <input
                      type="text"
                      value={cleanupConfirm}
                      onChange={e => setCleanupConfirm(e.target.value)}
                      placeholder="確認清理"
                      className="w-full border rounded px-3 py-2 text-sm"
                    />
                  </div>
                )}

                <div className="flex gap-2">
                  <button onClick={handleCleanupClose} className="flex-1 border border-gray-300 py-2 rounded text-sm hover:bg-gray-50">取消</button>
                  <button
                    onClick={handleCleanupPreview}
                    disabled={cleanupLoading}
                    className="flex-1 bg-zinc-600 text-white py-2 rounded text-sm hover:bg-zinc-700 disabled:opacity-50"
                  >
                    {cleanupLoading && !cleanupPreview ? '計算中...' : '預覽'}
                  </button>
                  {cleanupPreview && cleanupPreview.counts.total > 0 && (
                    <button
                      onClick={handleCleanupConfirm}
                      disabled={cleanupLoading || cleanupConfirm !== '確認清理'}
                      className="flex-1 bg-red-600 text-white py-2 rounded text-sm hover:bg-red-700 disabled:opacity-50"
                    >
                      {cleanupLoading && cleanupPreview ? '清理中...' : '執行清理'}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
