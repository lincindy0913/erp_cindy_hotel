'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useToast } from '@/context/ToastContext';
import { todayStr, localDateStr } from '@/lib/localDate';

export const ACTION_LABELS = {
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

export const LEVEL_STYLES = {
  finance: 'bg-indigo-100 text-indigo-800',
  admin: 'bg-red-100 text-red-800',
  operation: 'bg-blue-100 text-blue-800',
  attempt: 'bg-yellow-100 text-yellow-800',
};

export const LEVEL_LABELS = {
  finance: '財務',
  admin: '管理',
  operation: '操作',
  attempt: '嗗試',
};

export const TABS = [
  { key: 'logs', label: '操作日誌' },
  { key: 'critical', label: '重大決策' },
  { key: 'compliance', label: '合規報告' },
];

function defaultAuditDateFrom() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return localDateStr(d);
}

export function useAuditLog() {
  const { data: session } = useSession();
  const { showToast } = useToast();

  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [logsError, setLogsError] = useState(null);
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 0 });
  const [expandedId, setExpandedId] = useState(null);

  const [filters, setFilters] = useState({
    level: '',
    action: '',
    userEmail: '',
    dateFrom: defaultAuditDateFrom(),
    dateTo: '',
    keyword: '',
  });

  const [summary, setSummary] = useState({ todayOps: 0, monthFinance: 0, monthAttempts: 0 });

  const [activeTab, setActiveTab] = useState('logs');

  const [criticalDecisions, setCriticalDecisions] = useState([]);
  const [criticalLoading, setCriticalLoading] = useState(false);

  const [complianceReport, setComplianceReport] = useState(null);
  const [complianceLoading, setComplianceLoading] = useState(false);
  const [complianceYear, setComplianceYear] = useState(new Date().getFullYear());
  const [complianceMonth, setComplianceMonth] = useState(new Date().getMonth() + 1);

  const [showCleanupModal, setShowCleanupModal] = useState(false);
  const [cleanupDays, setCleanupDays] = useState(90);
  const [cleanupPreview, setCleanupPreview] = useState(null);
  const [cleanupResult, setCleanupResult] = useState(null);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [cleanupConfirm, setCleanupConfirm] = useState('');

  useEffect(() => {
    fetchLogs(1);
    fetchSummary();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchLogs(page) {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: page.toString(), limit: '50' });
      Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });

      const res = await fetch(`/api/audit-logs?${params}`);
      const data = await res.json();
      setLogsError(null);
      setLogs(data.data || []);
      setPagination(data.pagination || { page: 1, total: 0, totalPages: 0 });
    } catch { setLogsError('稽核日誌載入失敗，請檢查網路後重試。'); }
    setLoading(false);
  }

  async function fetchSummary() {
    try {
      const today = todayStr();
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
    } catch (e) { console.warn('[audit-log] summary fetch failed:', e.message); }
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
      showToast('預覽失敗，請稍後再試', 'error');
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
      showToast('清理失敗，請稍後再試', 'error');
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

  return {
    // session
    session,
    // logs tab
    logs, loading, logsError,
    pagination, fetchLogs,
    expandedId, setExpandedId,
    filters, setFilters,
    summary,
    handleSearch, handleReset,
    // tab
    activeTab, handleTabChange,
    // critical
    criticalDecisions, criticalLoading, fetchCriticalDecisions,
    // compliance
    complianceReport, complianceLoading,
    complianceYear, setComplianceYear,
    complianceMonth, setComplianceMonth,
    fetchComplianceReport,
    getScoreColor, getScoreBg,
    // cleanup
    showCleanupModal, setShowCleanupModal,
    cleanupDays, setCleanupDays,
    cleanupPreview, setCleanupPreview,
    cleanupResult,
    cleanupLoading,
    cleanupConfirm, setCleanupConfirm,
    handleCleanupPreview, handleCleanupConfirm, handleCleanupClose,
  };
}
