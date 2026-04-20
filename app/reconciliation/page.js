'use client';

import React, { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Navigation from '@/components/Navigation';
import { sortRows, SortableTh } from '@/components/SortableTh';
import { useDashboardTab } from '@/components/reconciliation/useDashboardTab';
import { useAccountTab } from '@/components/reconciliation/useAccountTab';
import { useCreditCardTab, CC_STATUS_MAP } from '@/components/reconciliation/useCreditCardTab';

const TABS = [
  { key: 'dashboard', label: '對帳儀表板' },
  { key: 'account', label: '帳戶對帳' },
  { key: 'rental', label: '租金對帳' },
  { key: 'formats', label: '銀行格式管理' },
  { key: 'credit-card', label: '信用卡對帳' }
];

const STATUS_MAP = {
  not_started: { label: '未開始', color: 'bg-red-100 text-red-700 border-red-300', dot: 'bg-red-500' },
  draft: { label: '進行中', color: 'bg-yellow-100 text-yellow-700 border-yellow-300', dot: 'bg-yellow-500' },
  confirmed: { label: '已確認', color: 'bg-green-100 text-green-700 border-green-300', dot: 'bg-green-500' }
};

function formatMoney(val) {
  if (val == null || isNaN(val)) return '0';
  return Number(val).toLocaleString('zh-TW', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function ReconciliationPageInner() {
  const { data: session } = useSession();
  const isLoggedIn = !!session;
  const router = useRouter();
  const searchParams = useSearchParams();

  // Tab state — initialised from URL, kept in sync on back/forward
  const [activeTab, setActiveTab] = useState(() => {
    const tab = searchParams.get('tab');
    return tab && TABS.find(t => t.key === tab) ? tab : 'dashboard';
  });

  // Messages
  const [message, setMessage] = useState({ text: '', type: '' });

  const showMessage = (text, type = 'success') => {
    setMessage({ text, type });
    setTimeout(() => setMessage({ text: '', type: '' }), 4000);
  };

  // Sync activeTab when browser back/forward changes URL
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (!tab) return;
    if (!TABS.find(t => t.key === tab)) {
      router.replace('?tab=dashboard');
      return;
    }
    if (tab !== activeTab) setActiveTab(tab);
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  const changeTab = (tab) => {
    setActiveTab(tab);
    router.push(`?tab=${tab}`, { scroll: false });
  };

  // ---- Shared state ----
  const now = new Date();
  const [accounts, setAccounts] = useState([]);
  const bankAccountsOnly = useMemo(
    () => accounts.filter(a => a.type === '銀行存款' && a.isActive),
    [accounts]
  );
  const [formats, setFormats] = useState([]);
  const [formatsLoading, setFormatsLoading] = useState(false);
  const [showFormatForm, setShowFormatForm] = useState(false);
  const [formatForm, setFormatForm] = useState({
    bankName: '', bankCode: '', fileEncoding: 'UTF-8', fileType: 'csv',
    dateColumn: '', descriptionColumn: '', debitColumn: '', creditColumn: '',
    balanceColumn: '', referenceColumn: '', dateFormat: 'YYYY-MM-DD'
  });
  const [formatSaving, setFormatSaving] = useState(false);
  const [rentalPayments, setRentalPayments] = useState([]);
  const [rentalReconLoading, setRentalReconLoading] = useState(false);
  const [rentalReconYear, setRentalReconYear] = useState(now.getFullYear());
  const [rentalReconMonth, setRentalReconMonth] = useState(now.getMonth() + 1);
  const [rentalReconAccountId, setRentalReconAccountId] = useState('');
  const [rentalReconMethodFilter, setRentalReconMethodFilter] = useState('');
  const [rentalReconSearch, setRentalReconSearch] = useState('');

  // ---- Accounts ----
  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/cashflow/accounts');
      const data = await res.json();
      setAccounts(Array.isArray(data) ? data.filter(a => a.isActive) : []);
    } catch (e) {
      showMessage('載入帳戶失敗：' + (e.message || '請稍後再試'), 'error');
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  // ---- Rental Reconciliation ----
  const fetchRentalPayments = useCallback(async () => {
    setRentalReconLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('year', rentalReconYear);
      if (rentalReconMonth) params.set('month', rentalReconMonth);
      if (rentalReconAccountId) params.set('accountId', rentalReconAccountId);
      if (rentalReconMethodFilter) params.set('paymentMethod', rentalReconMethodFilter);
      params.set('limit', '500');
      const res = await fetch(`/api/rentals/payments?${params}`);
      const data = await res.json();
      setRentalPayments(data.data || []);
    } catch (e) {
      showMessage('載入租金付款紀錄失敗：' + (e.message || '請稍後再試'), 'error');
    }
    setRentalReconLoading(false);
  }, [rentalReconYear, rentalReconMonth, rentalReconAccountId, rentalReconMethodFilter]);

  useEffect(() => {
    if (activeTab === 'rental') fetchRentalPayments();
  }, [activeTab, fetchRentalPayments]);

  // ---- Formats ----
  const fetchFormats = useCallback(async () => {
    setFormatsLoading(true);
    try {
      const res = await fetch('/api/reconciliation/bank-formats');
      const data = await res.json();
      setFormats(Array.isArray(data) ? data : []);
    } catch (e) {
      showMessage('載入銀行格式失敗：' + (e.message || '請稍後再試'), 'error');
    }
    setFormatsLoading(false);
  }, []);

  useEffect(() => {
    if (activeTab === 'formats' || activeTab === 'account') fetchFormats();
  }, [activeTab, fetchFormats]);



  // ---- Create bank format ----
  const submitFormat = async () => {
    if (!formatForm.bankName.trim()) {
      showMessage('銀行名稱為必填', 'error');
      return;
    }
    setFormatSaving(true);
    try {
      const res = await fetch('/api/reconciliation/bank-formats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formatForm)
      });
      const data = await res.json();
      if (data.error) {
        showMessage(data.error, 'error');
      } else {
        showMessage('銀行格式已建立');
        setShowFormatForm(false);
        setFormatForm({
          bankName: '', bankCode: '', fileEncoding: 'UTF-8', fileType: 'csv',
          dateColumn: '', descriptionColumn: '', debitColumn: '', creditColumn: '',
          balanceColumn: '', referenceColumn: '', dateFormat: 'YYYY-MM-DD'
        });
        fetchFormats();
      }
    } catch (e) {
      showMessage('儲存格式失敗', 'error');
    } finally {
      setFormatSaving(false);
    }
  };



  // ---- Hooks ----
  const {
    dashYear, setDashYear, dashMonth, setDashMonth,
    dashboardData, dashLoading, dashFilter, setDashFilter,
    dashSearch, setDashSearch, dashSortKey, dashSortDir, dashToggleSort,
    fetchDashboard,
  } = useDashboardTab({ activeTab, showMessage });

  const {
    selectedAccountId, setSelectedAccountId,
    acctYear, setAcctYear, acctMonth, setAcctMonth,
    reconciliation, bankLines, systemTxs, acctLoading,
    bankBalanceInput, setBankBalanceInput,
    confirmNote, setConfirmNote, diffExplained, setDiffExplained,
    selectedBankLine, setSelectedBankLine, selectedSystemTx, setSelectedSystemTx,
    showImportModal, setShowImportModal, showAdjustModal, setShowAdjustModal,
    adjustForm, setAdjustForm,
    importLines, importFileName, selectedFormatId, setSelectedFormatId,
    importSubmitting, adjustmentSubmitting,
    loadReconciliation, updateBankBalance, confirmReconciliation,
    matchPair, unmatchLine, handleFileUpload, submitImport, submitAdjustment,
  } = useAccountTab({ activeTab, showMessage, session, formats });

  const {
    ccStatements, ccSummary, ccMerchantConfigs, ccLoading,
    ccMonth, setCcMonth, ccWarehouseFilter, setCcWarehouseFilter,
    ccStatusFilter, setCcStatusFilter, ccExpandedId, setCcExpandedId,
    ccBuildings, ccShowUpload, setCcShowUpload,
    ccUploadWarehouse, setCcUploadWarehouse, ccParsedData, setCcParsedData,
    ccMatchResults, ccMatchLoading, ccInnerTab, setCcInnerTab,
    ccPmsRecords, ccPmsLoading,
    ccPmsStartDate, setCcPmsStartDate, ccPmsEndDate, setCcPmsEndDate,
    ccPmsWarehouse, setCcPmsWarehouse,
    ccShowConfigModal, setCcShowConfigModal,
    ccConfigForm, setCcConfigForm, ccBankType, setCcBankType, ccConfigSaving,
    fetchCcData, fetchCcPmsData, handleCcPdfUpload,
    saveParsedCcStatement, matchCcPms, matchAllCcPms,
    toggleCcConfirm, deleteCcStatement, saveCcConfig,
  } = useCreditCardTab({ activeTab, showMessage });

  const navigateToAccount = (accountId) => {
    setSelectedAccountId(String(accountId));
    changeTab('account');
  };

  // ---- Render credit card tab ----
  const renderCreditCardTab = () => {
    const summaryRows = ccSummary?.summary || [];
    const grandTotal = ccSummary?.grandTotal || {};

    // PMS records grouped by date for comparison
    const pmsByDate = {};
    for (const r of ccPmsRecords) {
      if (!pmsByDate[r.businessDate]) pmsByDate[r.businessDate] = { records: [], total: 0 };
      pmsByDate[r.businessDate].records.push(r);
      pmsByDate[r.businessDate].total += Number(r.amount);
    }
    const pmsTotalAmount = ccPmsRecords.reduce((s, r) => s + Number(r.amount), 0);
    const pmsGroupedByWarehouse = {};
    for (const r of ccPmsRecords) {
      if (!pmsGroupedByWarehouse[r.warehouse]) pmsGroupedByWarehouse[r.warehouse] = 0;
      pmsGroupedByWarehouse[r.warehouse] += Number(r.amount);
    }

    return (
    <div className="space-y-4">
      {/* Inner sub-tabs */}
      <div className="flex border-b">
        <button
          onClick={() => setCcInnerTab('statements')}
          className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${ccInnerTab === 'statements' ? 'border-violet-600 text-violet-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >信用卡對帳單</button>
        <button
          onClick={() => setCcInnerTab('pms')}
          className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${ccInnerTab === 'pms' ? 'border-violet-600 text-violet-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >PMS信用卡收入</button>
      </div>

      {/* ===== PMS sub-tab ===== */}
      {ccInnerTab === 'pms' && (
        <div className="space-y-4">
          {/* Search filters */}
          <div className="bg-white rounded-xl shadow-sm border p-4">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">開始日期</label>
                <input type="date" value={ccPmsStartDate} onChange={e => setCcPmsStartDate(e.target.value)}
                  className="border rounded-lg px-3 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">結束日期</label>
                <input type="date" value={ccPmsEndDate} onChange={e => setCcPmsEndDate(e.target.value)}
                  className="border rounded-lg px-3 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">館別</label>
                <select value={ccPmsWarehouse} onChange={e => setCcPmsWarehouse(e.target.value)}
                  className="border rounded-lg px-3 py-1.5 text-sm">
                  <option value="">全部</option>
                  {ccBuildings.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
                </select>
              </div>
              <button onClick={fetchCcPmsData} disabled={ccPmsLoading}
                className="px-4 py-1.5 bg-violet-600 text-white text-sm rounded-lg hover:bg-violet-700 disabled:opacity-50">
                {ccPmsLoading ? '查詢中...' : '查詢'}
              </button>
            </div>
          </div>

          {/* Summary cards */}
          {ccPmsRecords.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-white rounded-xl border shadow-sm p-4">
                <p className="text-xs text-gray-500">PMS信用卡總筆數</p>
                <p className="text-2xl font-bold text-violet-700 mt-1">{ccPmsRecords.length}</p>
              </div>
              <div className="bg-white rounded-xl border shadow-sm p-4">
                <p className="text-xs text-gray-500">PMS信用卡總金額</p>
                <p className="text-2xl font-bold text-violet-700 mt-1">{formatMoney(pmsTotalAmount)}</p>
              </div>
              {Object.entries(pmsGroupedByWarehouse).map(([w, amt]) => (
                <div key={w} className="bg-white rounded-xl border shadow-sm p-4">
                  <p className="text-xs text-gray-500">{w}</p>
                  <p className="text-xl font-bold text-gray-800 mt-1">{formatMoney(amt)}</p>
                </div>
              ))}
            </div>
          )}

          {/* PMS vs Statement comparison */}
          {ccPmsRecords.length > 0 && ccStatements.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
              <div className="px-4 py-3 bg-violet-50 border-b">
                <h4 className="text-sm font-semibold text-violet-800">PMS 信用卡 vs 銀行對帳單 比對</h4>
                <p className="text-xs text-gray-500 mt-0.5">以館別為單位，比較 PMS 匯入金額與信用卡請款金額</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">館別</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">PMS信用卡金額</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">銀行請款金額</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">差異</th>
                      <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">狀態</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {Object.entries(pmsGroupedByWarehouse).map(([w, pmsAmt]) => {
                      const stmts = ccStatements.filter(s => s.warehouse === w);
                      const stmtAmt = stmts.reduce((sum, s) => sum + Number(s.totalAmount), 0);
                      const diff = pmsAmt - stmtAmt;
                      const matched = stmts.length > 0 && Math.abs(diff) < 1;
                      return (
                        <tr key={w} className="hover:bg-gray-50">
                          <td className="px-3 py-2 font-medium text-gray-800">{w}</td>
                          <td className="px-3 py-2 text-right font-mono text-violet-700">{formatMoney(pmsAmt)}</td>
                          <td className="px-3 py-2 text-right font-mono text-gray-700">{stmts.length > 0 ? formatMoney(stmtAmt) : <span className="text-gray-400">尚無對帳單</span>}</td>
                          <td className={`px-3 py-2 text-right font-mono font-medium ${Math.abs(diff) < 1 ? 'text-green-600' : 'text-red-600'}`}>
                            {stmts.length > 0 ? (diff >= 0 ? '+' : '') + formatMoney(diff) : '-'}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {stmts.length === 0
                              ? <span className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-500">無對帳單</span>
                              : matched
                                ? <span className="px-2 py-0.5 rounded text-xs bg-green-100 text-green-700">金額相符</span>
                                : <span className="px-2 py-0.5 rounded text-xs bg-red-100 text-red-700">有差異</span>
                            }
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* PMS detail records */}
          {ccPmsLoading ? (
            <div className="text-center py-12 text-gray-500">載入中...</div>
          ) : ccPmsRecords.length === 0 ? (
            <div className="bg-white rounded-xl border shadow-sm p-8 text-center text-gray-500">
              <p className="text-sm">尚無資料，請選擇日期範圍後點擊查詢</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b flex items-center justify-between">
                <h4 className="text-sm font-semibold text-gray-700">每日信用卡收入明細（共 {ccPmsRecords.length} 筆）</h4>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">日期</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">館別</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">PMS科目</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">金額</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">批次</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {ccPmsRecords.map(r => (
                      <tr key={r.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-mono text-gray-700">{r.businessDate}</td>
                        <td className="px-3 py-2 text-gray-700">{r.warehouse}</td>
                        <td className="px-3 py-2 text-gray-600">{r.pmsColumnName}</td>
                        <td className="px-3 py-2 text-right font-mono font-medium text-violet-700">{formatMoney(r.amount)}</td>
                        <td className="px-3 py-2 text-xs text-gray-400">{r.importBatch?.batchNo || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t">
                    <tr>
                      <td colSpan={3} className="px-3 py-2 text-sm font-semibold text-gray-700">合計</td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-violet-800">{formatMoney(pmsTotalAmount)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== Statements sub-tab ===== */}
      {ccInnerTab === 'statements' && <div className="space-y-6">
      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">月份</label>
            <input type="month" value={ccMonth} onChange={e => setCcMonth(e.target.value)}
              className="border rounded-lg px-3 py-1.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">館別</label>
            <select value={ccWarehouseFilter} onChange={e => setCcWarehouseFilter(e.target.value)}
              className="border rounded-lg px-3 py-1.5 text-sm">
              <option value="">全部</option>
              {ccBuildings.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">狀態</label>
            <select value={ccStatusFilter} onChange={e => setCcStatusFilter(e.target.value)}
              className="border rounded-lg px-3 py-1.5 text-sm">
              <option value="all">全部</option>
              <option value="pending">待對帳</option>
              <option value="matched">已對帳</option>
              <option value="confirmed">已確認</option>
            </select>
          </div>
          <div className="flex items-end gap-2 ml-auto">
            <button onClick={() => setCcShowConfigModal(true)}
              className="px-4 py-1.5 border border-violet-300 text-violet-700 text-sm rounded-lg hover:bg-violet-50">
              特約商店設定
            </button>
            <button onClick={matchAllCcPms}
              disabled={ccStatements.filter(s => s.status !== 'confirmed').length === 0}
              className="px-4 py-1.5 border border-blue-300 text-blue-700 text-sm rounded-lg hover:bg-blue-50 disabled:opacity-50">
              批次比對 PMS
            </button>
            <button onClick={() => { setCcShowUpload(true); setCcParsedData(null); }}
              className="px-4 py-1.5 bg-violet-600 text-white text-sm rounded-lg hover:bg-violet-700">
              上傳 PDF 對帳單
            </button>
          </div>
        </div>
      </div>

      {/* Monthly Summary Table */}
      {summaryRows.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="px-4 py-3 bg-violet-50 border-b">
            <h4 className="text-sm font-semibold text-violet-800">
              {ccMonth.replace('-', ' 年 ')} 月 各館信用卡對帳匯總
            </h4>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">館別</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">筆數</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">請款金額</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">手續費</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">撥款淨額</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">PMS金額</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">差異</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">狀態</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {summaryRows.map(row => {
                  const si = CC_STATUS_MAP[row.status] || CC_STATUS_MAP.no_data;
                  return (
                    <tr key={row.warehouseId} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium text-gray-800">{row.warehouse}</td>
                      <td className="px-3 py-2 text-center">{row.totalCount}</td>
                      <td className="px-3 py-2 text-right">{formatMoney(row.totalAmount)}</td>
                      <td className="px-3 py-2 text-right text-red-600">{formatMoney(row.totalFee)}</td>
                      <td className="px-3 py-2 text-right font-medium">{formatMoney(row.netAmount)}</td>
                      <td className="px-3 py-2 text-right">{row.pmsAmount ? formatMoney(row.pmsAmount) : '-'}</td>
                      <td className={`px-3 py-2 text-right font-medium ${row.difference > 0 ? 'text-green-600' : row.difference < 0 ? 'text-red-600' : ''}`}>
                        {row.stmtCount > 0 ? (row.difference > 0 ? '+' : '') + formatMoney(row.difference) : '-'}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${si.color}`}>{si.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-violet-50 font-semibold text-sm">
                  <td className="px-3 py-2">合計</td>
                  <td className="px-3 py-2 text-center">{grandTotal.totalCount || 0}</td>
                  <td className="px-3 py-2 text-right">{formatMoney(grandTotal.totalAmount)}</td>
                  <td className="px-3 py-2 text-right text-red-600">{formatMoney(grandTotal.totalFee)}</td>
                  <td className="px-3 py-2 text-right">{formatMoney(grandTotal.netAmount)}</td>
                  <td className="px-3 py-2 text-right">{formatMoney(grandTotal.pmsAmount)}</td>
                  <td className={`px-3 py-2 text-right ${(grandTotal.difference || 0) !== 0 ? 'text-orange-600' : ''}`}>
                    {(grandTotal.difference > 0 ? '+' : '') + formatMoney(grandTotal.difference || 0)}
                  </td>
                  <td className="px-3 py-2"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Statements List */}
      {ccLoading ? (
        <div className="text-center py-12 text-gray-400">載入中...</div>
      ) : ccStatements.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border p-8 text-center text-gray-400">
          <p>本月尚無信用卡對帳單</p>
          <p className="text-sm mt-1">點擊「上傳 PDF 對帳單」匯入銀行撥款對帳單</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="px-4 py-3 bg-violet-50 border-b flex items-center justify-between">
            <h4 className="text-sm font-semibold text-violet-800">對帳單明細 ({ccStatements.length} 筆)</h4>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-8"></th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">館別</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">請款日</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">撥款日</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">筆數</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">請款金額</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">手續費</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">撥款淨額</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">狀態</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {ccStatements.map(stmt => {
                const si = CC_STATUS_MAP[stmt.status] || CC_STATUS_MAP.pending;
                const isExpanded = ccExpandedId === stmt.id;
                return (
                  <React.Fragment key={stmt.id}>
                    <tr className={`hover:bg-gray-50 cursor-pointer ${isExpanded ? 'bg-violet-50/50' : ''}`}
                      onClick={() => setCcExpandedId(isExpanded ? null : stmt.id)}>
                      <td className="px-3 py-2 text-gray-400">{isExpanded ? '▼' : '▶'}</td>
                      <td className="px-3 py-2 font-medium text-gray-800">{stmt.warehouse}</td>
                      <td className="px-3 py-2">{stmt.billingDate}</td>
                      <td className="px-3 py-2 text-gray-500">{stmt.paymentDate || '-'}</td>
                      <td className="px-3 py-2 text-center">{stmt.totalCount}</td>
                      <td className="px-3 py-2 text-right font-medium">{formatMoney(stmt.totalAmount)}</td>
                      <td className="px-3 py-2 text-right text-red-600">{formatMoney(stmt.totalFee)}</td>
                      <td className="px-3 py-2 text-right font-medium text-violet-700">{formatMoney(stmt.netAmount)}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${si.color}`}>{si.label}</span>
                      </td>
                      <td className="px-3 py-2 text-center" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => matchCcPms(stmt.id)} title="比對PMS"
                            className="text-blue-600 hover:text-blue-800 text-xs px-1.5 py-0.5 border border-blue-200 rounded hover:bg-blue-50">
                            比對
                          </button>
                          {stmt.status !== 'confirmed' ? (
                            <button onClick={() => toggleCcConfirm(stmt.id, stmt.status)} title="確認"
                              className="text-green-600 hover:text-green-800 text-xs px-1.5 py-0.5 border border-green-200 rounded hover:bg-green-50">
                              確認
                            </button>
                          ) : (
                            <button onClick={() => toggleCcConfirm(stmt.id, stmt.status)} title="取消確認"
                              className="text-orange-600 hover:text-orange-800 text-xs px-1.5 py-0.5 border border-orange-200 rounded hover:bg-orange-50">
                              取消
                            </button>
                          )}
                          {stmt.status !== 'confirmed' && (
                            <button onClick={() => deleteCcStatement(stmt.id)} title="刪除"
                              className="text-red-500 hover:text-red-700 text-xs px-1.5 py-0.5 border border-red-200 rounded hover:bg-red-50">
                              刪除
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {/* Expanded Detail */}
                    {isExpanded && (
                      <tr>
                        <td colSpan={10} className="px-4 py-4 bg-violet-50/30">
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            {/* Left: Batch Lines */}
                            <div className="bg-white rounded-lg border p-4">
                              <h5 className="text-sm font-semibold text-gray-700 mb-2">批次明細</h5>
                              {stmt.batchLines?.length > 0 ? (
                                <table className="w-full text-xs">
                                  <thead className="bg-gray-50">
                                    <tr>
                                      <th className="px-2 py-1 text-left">終端機</th>
                                      <th className="px-2 py-1 text-left">批次</th>
                                      <th className="px-2 py-1 text-left">卡別</th>
                                      <th className="px-2 py-1 text-center">筆數</th>
                                      <th className="px-2 py-1 text-right">金額</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y">
                                    {stmt.batchLines.map((l, i) => (
                                      <tr key={i}>
                                        <td className="px-2 py-1 font-mono">{l.terminalId}</td>
                                        <td className="px-2 py-1 font-mono">{l.batchNo}</td>
                                        <td className="px-2 py-1">
                                          <span className={`px-1.5 py-0.5 rounded text-xs ${
                                            l.cardType === 'VISA' ? 'bg-blue-100 text-blue-700' :
                                            l.cardType === 'MASTER' ? 'bg-red-100 text-red-700' :
                                            l.cardType === 'JCB' ? 'bg-green-100 text-green-700' :
                                            'bg-gray-100 text-gray-700'
                                          }`}>{l.cardType}</span>
                                        </td>
                                        <td className="px-2 py-1 text-center">{l.count}</td>
                                        <td className="px-2 py-1 text-right font-medium">{formatMoney(l.amount)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              ) : <p className="text-xs text-gray-400">無批次明細</p>}
                            </div>

                            {/* Right: Fee Details + PMS */}
                            <div className="space-y-4">
                              <div className="bg-white rounded-lg border p-4">
                                <h5 className="text-sm font-semibold text-gray-700 mb-2">手續費明細</h5>
                                {stmt.feeDetails?.length > 0 ? (
                                  <table className="w-full text-xs">
                                    <thead className="bg-gray-50">
                                      <tr>
                                        <th className="px-2 py-1 text-left">類型</th>
                                        <th className="px-2 py-1 text-left">卡別</th>
                                        <th className="px-2 py-1 text-center">筆數</th>
                                        <th className="px-2 py-1 text-right">金額</th>
                                        <th className="px-2 py-1 text-right">手續費</th>
                                        <th className="px-2 py-1 text-right">費率</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                      {stmt.feeDetails.map((d, i) => (
                                        <tr key={i}>
                                          <td className="px-2 py-1">{d.origin}</td>
                                          <td className="px-2 py-1">{d.cardType}</td>
                                          <td className="px-2 py-1 text-center">{d.count}</td>
                                          <td className="px-2 py-1 text-right">{formatMoney(d.amount)}</td>
                                          <td className="px-2 py-1 text-right text-red-600">{formatMoney(d.fee)}</td>
                                          <td className="px-2 py-1 text-right text-gray-500">{d.feeRate ? d.feeRate + '%' : '-'}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                ) : <p className="text-xs text-gray-400">無手續費明細</p>}
                              </div>

                              {/* PMS comparison */}
                              <div className="bg-white rounded-lg border p-4">
                                <div className="flex items-center justify-between mb-3">
                                  <h5 className="text-sm font-semibold text-gray-700">PMS 信用卡收入比對</h5>
                                  <button
                                    onClick={() => matchCcPms(stmt.id)}
                                    disabled={ccMatchLoading[stmt.id] || stmt.status === 'confirmed'}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    {ccMatchLoading[stmt.id] ? (
                                      <><span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />比對中…</>
                                    ) : '比對 PMS'}
                                  </button>
                                </div>
                                <div className="grid grid-cols-3 gap-3 text-sm mb-3">
                                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                                    <div className="text-xs text-gray-500 mb-1">銀行請款金額</div>
                                    <div className="font-bold text-lg">{formatMoney(stmt.totalAmount)}</div>
                                  </div>
                                  <div className="bg-blue-50 rounded-lg p-3 text-center">
                                    <div className="text-xs text-gray-500 mb-1">PMS 信用卡收入</div>
                                    <div className="font-bold text-lg text-blue-700">{stmt.pmsAmount != null ? formatMoney(stmt.pmsAmount) : <span className="text-gray-400 text-sm">未比對</span>}</div>
                                  </div>
                                  <div className={`rounded-lg p-3 text-center ${stmt.difference == null ? 'bg-gray-50' : Math.abs(stmt.difference) < 1 ? 'bg-green-50' : 'bg-red-50'}`}>
                                    <div className="text-xs text-gray-500 mb-1">差異</div>
                                    <div className={`font-bold text-lg ${stmt.difference > 0 ? 'text-green-700' : stmt.difference < 0 ? 'text-red-700' : 'text-green-700'}`}>
                                      {stmt.difference != null ? (stmt.difference > 0 ? '+' : '') + formatMoney(stmt.difference) : <span className="text-gray-400 text-sm">-</span>}
                                    </div>
                                    {stmt.difference != null && Math.abs(stmt.difference) < 1 && (
                                      <div className="text-xs text-green-600 mt-0.5">✓ 吻合</div>
                                    )}
                                  </div>
                                </div>

                                {/* Matched PMS records detail */}
                                {ccMatchResults[stmt.id] && (
                                  <div className="mt-2 border-t pt-2">
                                    <div className="text-xs text-gray-500 mb-1.5">
                                      比對日期：{ccMatchResults[stmt.id].matchedDates?.join('、')}
                                    </div>
                                    {ccMatchResults[stmt.id].pmsRecords?.length > 0 ? (
                                      <table className="w-full text-xs">
                                        <thead className="bg-gray-50">
                                          <tr>
                                            <th className="px-2 py-1 text-left text-gray-500">日期</th>
                                            <th className="px-2 py-1 text-left text-gray-500">項目</th>
                                            <th className="px-2 py-1 text-right text-gray-500">金額</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                          {ccMatchResults[stmt.id].pmsRecords.map((r, i) => (
                                            <tr key={i} className="hover:bg-gray-50">
                                              <td className="px-2 py-1 text-gray-600">{r.businessDate}</td>
                                              <td className="px-2 py-1 text-gray-700">{r.pmsColumnName}</td>
                                              <td className="px-2 py-1 text-right font-medium">{formatMoney(r.amount)}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    ) : (
                                      <p className="text-xs text-orange-600">未找到對應 PMS 信用卡收入紀錄</p>
                                    )}
                                  </div>
                                )}

                                {stmt.note && <p className="text-xs text-gray-500 mt-2 pt-2 border-t">備註：{stmt.note}</p>}
                              </div>

                              {/* Summary info */}
                              <div className="bg-violet-50 rounded-lg border border-violet-200 p-3 text-sm">
                                <div className="flex justify-between">
                                  <span>特店代號</span><span className="font-mono">{stmt.merchantId || '-'}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>入帳帳號</span><span className="font-mono">{stmt.accountNo || '-'}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>銀行</span><span>{stmt.bankName || '-'}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      </div>}
      {/* Upload PDF Modal */}
      {ccShowUpload && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-xl mx-4">
            <h3 className="text-lg font-bold text-gray-800 mb-4">上傳信用卡對帳單 PDF</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">館別 *</label>
                <select value={ccUploadWarehouse} onChange={e => setCcUploadWarehouse(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="">選擇館別</option>
                  {ccBuildings.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">銀行 *</label>
                <select value={ccBankType} onChange={e => { setCcBankType(e.target.value); setCcParsedData(null); }}
                  className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="國泰世華">國泰世華</option>
                  <option value="玉山">玉山銀行</option>
                  <option value="台新">台新銀行</option>
                  <option value="中信">中國信託</option>
                  <option value="合庫">合作金庫</option>
                  <option value="第一">第一銀行</option>
                  <option value="土銀">土地銀行</option>
                  <option value="台灣銀行">台灣銀行</option>
                  <option value="郵局">中華郵政</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">選擇 PDF 檔案</label>
                <input type="file" accept=".pdf,.txt" onChange={handleCcPdfUpload}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
                <p className="text-xs text-gray-400 mt-1">
                  {ccBankType === '國泰世華' ? '支援國泰世華信用卡特約商店撥款對帳單 PDF' : `支援 ${ccBankType} 信用卡特約商店對帳單 PDF（通用解析）`}
                </p>
              </div>

              {ccParsedData && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-green-800 mb-2">解析結果</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div><span className="text-gray-500">特店名稱：</span>{ccParsedData.merchantName}</div>
                    <div><span className="text-gray-500">特店代號：</span>{ccParsedData.merchantId}</div>
                    <div><span className="text-gray-500">請款日：</span>{ccParsedData.billingDate}</div>
                    <div><span className="text-gray-500">撥款日：</span>{ccParsedData.paymentDate}</div>
                    <div><span className="text-gray-500">筆數：</span>{ccParsedData.totalCount}</div>
                    <div><span className="text-gray-500">請款金額：</span>{formatMoney(ccParsedData.totalAmount)}</div>
                    <div><span className="text-gray-500">手續費：</span>{formatMoney(ccParsedData.totalFee)}</div>
                    <div><span className="text-gray-500">撥款淨額：</span><span className="font-bold text-violet-700">{formatMoney(ccParsedData.netAmount)}</span></div>
                  </div>
                  {ccParsedData.batchLines?.length > 0 && (
                    <p className="text-xs text-green-700 mt-2">批次明細 {ccParsedData.batchLines.length} 筆 / 手續費明細 {ccParsedData.feeDetails?.length || 0} 筆</p>
                  )}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => { setCcShowUpload(false); setCcParsedData(null); setCcBankType('國泰世華'); }}
                className="px-4 py-2 border text-gray-600 text-sm rounded-lg hover:bg-gray-50">取消</button>
              <button onClick={saveParsedCcStatement} disabled={!ccParsedData || !ccUploadWarehouse}
                className="px-6 py-2 bg-violet-600 text-white text-sm rounded-lg hover:bg-violet-700 disabled:opacity-50">
                匯入對帳單
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Merchant Config Modal */}
      {ccShowConfigModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-lg mx-4">
            <h3 className="text-lg font-bold text-gray-800 mb-4">信用卡特約商店設定</h3>

            {/* Existing configs */}
            {ccMerchantConfigs.length > 0 && (
              <div className="mb-4 border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-1.5 text-left text-xs">館別</th>
                      <th className="px-3 py-1.5 text-left text-xs">銀行</th>
                      <th className="px-3 py-1.5 text-left text-xs">特店代號</th>
                      <th className="px-3 py-1.5 text-right text-xs">國內%</th>
                      <th className="px-3 py-1.5 text-right text-xs">國外%</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {ccMerchantConfigs.map(c => (
                      <tr key={c.id}>
                        <td className="px-3 py-1.5">{c.warehouse?.name}</td>
                        <td className="px-3 py-1.5">{c.bankName}</td>
                        <td className="px-3 py-1.5 font-mono">{c.merchantId}</td>
                        <td className="px-3 py-1.5 text-right">{Number(c.domesticFeeRate)}%</td>
                        <td className="px-3 py-1.5 text-right">{Number(c.foreignFeeRate)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Add form */}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">館別 *</label>
                  <select value={ccConfigForm.warehouseId} onChange={e => setCcConfigForm({...ccConfigForm, warehouseId: e.target.value})}
                    className="w-full border rounded-lg px-3 py-1.5 text-sm">
                    <option value="">選擇</option>
                    {ccBuildings.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">銀行名稱 *</label>
                  <input type="text" value={ccConfigForm.bankName} onChange={e => setCcConfigForm({...ccConfigForm, bankName: e.target.value})}
                    className="w-full border rounded-lg px-3 py-1.5 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">特店代號 *</label>
                  <input type="text" value={ccConfigForm.merchantId} onChange={e => setCcConfigForm({...ccConfigForm, merchantId: e.target.value})}
                    className="w-full border rounded-lg px-3 py-1.5 text-sm" placeholder="例: 310800073" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">特店名稱</label>
                  <input type="text" value={ccConfigForm.merchantName} onChange={e => setCcConfigForm({...ccConfigForm, merchantName: e.target.value})}
                    className="w-full border rounded-lg px-3 py-1.5 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">入帳帳號</label>
                <input type="text" value={ccConfigForm.accountNo} onChange={e => setCcConfigForm({...ccConfigForm, accountNo: e.target.value})}
                  className="w-full border rounded-lg px-3 py-1.5 text-sm" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">國內手續費率%</label>
                  <input type="number" step="0.01" value={ccConfigForm.domesticFeeRate}
                    onChange={e => setCcConfigForm({...ccConfigForm, domesticFeeRate: e.target.value})}
                    className="w-full border rounded-lg px-3 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">國外手續費率%</label>
                  <input type="number" step="0.01" value={ccConfigForm.foreignFeeRate}
                    onChange={e => setCcConfigForm({...ccConfigForm, foreignFeeRate: e.target.value})}
                    className="w-full border rounded-lg px-3 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">自行卡費率%</label>
                  <input type="number" step="0.01" value={ccConfigForm.selfFeeRate}
                    onChange={e => setCcConfigForm({...ccConfigForm, selfFeeRate: e.target.value})}
                    className="w-full border rounded-lg px-3 py-1.5 text-sm" />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setCcShowConfigModal(false)}
                className="px-4 py-2 border text-gray-600 text-sm rounded-lg hover:bg-gray-50" disabled={ccConfigSaving}>關閉</button>
              <button onClick={saveCcConfig}
                disabled={ccConfigSaving}
                className="px-6 py-2 bg-violet-600 text-white text-sm rounded-lg hover:bg-violet-700 disabled:opacity-50">{ccConfigSaving ? '儲存中…' : '儲存設定'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
    );
  };

  // Dashboard filtered items
  const dashSortAccessors = {
    currentBalance: i => Number(i.currentBalance ?? 0),
    difference: i => Number(i.difference ?? 0),
    status: i => ({ not_started: 0, draft: 1, confirmed: 2 }[i.status] ?? 0),
  };
  const filteredDashItems = sortRows(
    (dashboardData?.items || []).filter(item => {
      if (dashFilter !== 'all' && item.status !== dashFilter) return false;
      if (dashSearch && !item.accountName.includes(dashSearch) && !(item.warehouse || '').includes(dashSearch)) return false;
      return true;
    }),
    dashSortKey, dashSortDir, dashSortAccessors
  );

  // Matched / unmatched helpers
  const matchedBankIds = new Set(bankLines.filter(l => l.matchStatus === 'matched').map(l => l.id));
  const matchedTxIds = new Set(bankLines.filter(l => l.matchedTransactionId).map(l => l.matchedTransactionId));
  const unmatchedBankLines = bankLines.filter(l => l.matchStatus !== 'matched');
  const unmatchedSystemTxs = systemTxs.filter(t => !matchedTxIds.has(t.id));

  const summary = reconciliation ? {
    matched: bankLines.filter(l => l.matchStatus === 'matched').length,
    bankOnly: unmatchedBankLines.length,
    systemOnly: unmatchedSystemTxs.length,
    difference: reconciliation.difference || 0
  } : { matched: 0, bankOnly: 0, systemOnly: 0, difference: 0 };

  return (
    <div className="min-h-screen page-bg-reconciliation">
      <Navigation borderColor="border-violet-500" />

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">存簿對帳</h2>
            <p className="text-sm text-gray-500 mt-1">銀行對帳單比對與核實</p>
          </div>
        </div>

        {/* Message */}
        {message.text && (
          <div className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium ${
            message.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'
          }`}>
            {message.text}
          </div>
        )}

        {/* Tabs */}
        <div className="flex flex-wrap gap-1 mb-6 bg-white rounded-lg p-1 shadow-sm border">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => changeTab(tab.key)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                activeTab === tab.key
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-violet-50 hover:text-violet-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ======== TAB: Dashboard ======== */}
        {activeTab === 'dashboard' && (
          <div>
            {/* Year/Month + Filters */}
            <div className="bg-white rounded-xl shadow-sm border p-4 mb-6">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-600">年份</label>
                  <select
                    value={dashYear}
                    onChange={e => setDashYear(parseInt(e.target.value))}
                    className="border rounded-lg px-3 py-1.5 text-sm"
                  >
                    {[2024, 2025, 2026, 2027].map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-600">月份</label>
                  <select
                    value={dashMonth}
                    onChange={e => setDashMonth(parseInt(e.target.value))}
                    className="border rounded-lg px-3 py-1.5 text-sm"
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                      <option key={m} value={m}>{m} 月</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-600">狀態</label>
                  <select
                    value={dashFilter}
                    onChange={e => setDashFilter(e.target.value)}
                    className="border rounded-lg px-3 py-1.5 text-sm"
                  >
                    <option value="all">全部</option>
                    <option value="not_started">未開始</option>
                    <option value="draft">進行中</option>
                    <option value="confirmed">已確認</option>
                  </select>
                </div>
                <input
                  type="text"
                  placeholder="搜尋帳戶名稱..."
                  value={dashSearch}
                  onChange={e => setDashSearch(e.target.value)}
                  className="border rounded-lg px-3 py-1.5 text-sm flex-1 min-w-[180px]"
                />
              </div>
            </div>

            {/* Progress Bar */}
            {dashboardData?.summary && (
              <div className="bg-white rounded-xl shadow-sm border p-4 mb-6">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-gray-700">
                    {dashYear} 年 {dashMonth} 月 對帳進度
                  </h3>
                  <span className="text-sm text-violet-600 font-medium">
                    {dashboardData.summary.completedCount} / {dashboardData.summary.totalAccounts} 完成
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div
                    className="bg-violet-500 h-3 rounded-full transition-all duration-500"
                    style={{
                      width: dashboardData.summary.totalAccounts > 0
                        ? `${(dashboardData.summary.completedCount / dashboardData.summary.totalAccounts * 100)}%`
                        : '0%'
                    }}
                  />
                </div>
                <div className="flex gap-6 mt-3 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" />
                    已確認: {dashboardData.summary.completedCount}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-yellow-500 inline-block" />
                    進行中: {dashboardData.summary.inProgressCount}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />
                    未開始: {dashboardData.summary.notStartedCount}
                  </span>
                  {dashboardData.summary.hasDifferenceCount > 0 && (
                    <span className="flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-full bg-orange-500 inline-block" />
                      有差異: {dashboardData.summary.hasDifferenceCount}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Account List Table */}
            {dashLoading ? (
              <div className="text-center py-12 text-gray-400">載入中...</div>
            ) : filteredDashItems.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-xl shadow-sm border">
                <p className="text-gray-400">尚無銀行帳戶或無符合篩選條件的資料</p>
                <p className="text-gray-300 text-sm mt-1">請先至現金流模組新增銀行存款帳戶</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <SortableTh label="帳戶名稱" colKey="accountName" sortKey={dashSortKey} sortDir={dashSortDir} onSort={dashToggleSort} className="px-4 py-3" />
                      <SortableTh label="館別" colKey="warehouse" sortKey={dashSortKey} sortDir={dashSortDir} onSort={dashToggleSort} className="px-4 py-3" />
                      <SortableTh label="存簿餘額" colKey="currentBalance" sortKey={dashSortKey} sortDir={dashSortDir} onSort={dashToggleSort} className="px-4 py-3" align="right" />
                      <SortableTh label="差異金額" colKey="difference" sortKey={dashSortKey} sortDir={dashSortDir} onSort={dashToggleSort} className="px-4 py-3" align="right" />
                      <SortableTh label="對帳狀態" colKey="status" sortKey={dashSortKey} sortDir={dashSortDir} onSort={dashToggleSort} className="px-4 py-3" align="center" />
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredDashItems.map(item => {
                      const statusInfo = STATUS_MAP[item.status] || STATUS_MAP.not_started;
                      const hasDiff = item.status === 'confirmed' && item.difference !== 0;
                      return (
                        <tr
                          key={item.accountId}
                          className={`hover:bg-violet-50/40 cursor-pointer transition-colors ${hasDiff ? 'bg-orange-50/30' : ''}`}
                          onClick={() => navigateToAccount(item.accountId)}
                        >
                          <td className="px-4 py-3">
                            <div className="font-medium text-gray-800">{item.accountName}</div>
                            {item.accountCode && <div className="text-xs text-gray-400">{item.accountCode}</div>}
                          </td>
                          <td className="px-4 py-3 text-gray-600">{item.warehouse || <span className="text-gray-300">—</span>}</td>
                          <td className="px-4 py-3 text-right font-mono font-medium text-gray-800">${formatMoney(item.currentBalance)}</td>
                          <td className="px-4 py-3 text-right font-mono">
                            {item.status === 'not_started' || item.difference === 0
                              ? <span className="text-gray-300">—</span>
                              : <span className={item.difference !== 0 ? 'text-orange-600 font-medium' : 'text-green-600'}>${formatMoney(item.difference)}</span>
                            }
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border ${statusInfo.color}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.dot}`} />
                              {statusInfo.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            {hasDiff && (
                              <span className="text-xs text-orange-500 flex items-center justify-end gap-1">
                                <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                                </svg>
                                需複查
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="px-4 py-2 bg-gray-50 border-t text-xs text-gray-400 text-right">
                  共 {filteredDashItems.length} 筆帳戶
                </div>
              </div>
            )}
          </div>
        )}

        {/* ======== TAB: Account Reconciliation ======== */}
        {activeTab === 'account' && (
          <div>
            {/* Selectors */}
            <div className="bg-white rounded-xl shadow-sm border p-4 mb-4">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-600">帳戶</label>
                  <select
                    value={selectedAccountId}
                    onChange={e => setSelectedAccountId(e.target.value)}
                    className="border rounded-lg px-3 py-1.5 text-sm min-w-[200px]"
                  >
                    <option value="">-- 選擇帳戶 --</option>
                    {bankAccountsOnly.map(a => (
                      <option key={a.id} value={a.id}>{a.name}{a.warehouse ? ` (${a.warehouse})` : ''}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-600">年份</label>
                  <select value={acctYear} onChange={e => setAcctYear(parseInt(e.target.value))} className="border rounded-lg px-3 py-1.5 text-sm">
                    {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-600">月份</label>
                  <select value={acctMonth} onChange={e => setAcctMonth(parseInt(e.target.value))} className="border rounded-lg px-3 py-1.5 text-sm">
                    {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{m} 月</option>)}
                  </select>
                </div>
                {selectedAccountId && reconciliation && (
                  <>
                    <button
                      onClick={() => setShowImportModal(true)}
                      className="ml-auto px-4 py-1.5 bg-violet-600 text-white text-sm rounded-lg hover:bg-violet-700 transition-colors"
                      disabled={reconciliation.status === 'confirmed'}
                    >
                      匯入 CSV
                    </button>
                    <button
                      onClick={() => setShowAdjustModal(true)}
                      className="px-4 py-1.5 bg-amber-500 text-white text-sm rounded-lg hover:bg-amber-600 transition-colors"
                      disabled={reconciliation.status === 'confirmed'}
                    >
                      補建交易
                    </button>
                  </>
                )}
              </div>
            </div>

            {!selectedAccountId ? (
              <div className="text-center py-16 bg-white rounded-xl shadow-sm border">
                <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
                <p className="text-gray-400">請選擇帳戶以開始對帳</p>
              </div>
            ) : acctLoading ? (
              <div className="text-center py-12 text-gray-400">載入中...</div>
            ) : reconciliation ? (
              <>
                {/* Reconciliation Info Bar */}
                <div className="bg-white rounded-xl shadow-sm border p-4 mb-4">
                  <div className="flex flex-wrap items-center gap-6 text-sm">
                    <div>
                      <span className="text-gray-500">對帳編號：</span>
                      <span className="font-medium">{reconciliation.reconciliationNo}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">狀態：</span>
                      <span className={`font-medium ${reconciliation.status === 'confirmed' ? 'text-green-600' : 'text-yellow-600'}`}>
                        {reconciliation.status === 'confirmed' ? '已確認' : '草稿'}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">期初餘額：</span>
                      <span className="font-medium">${formatMoney(reconciliation.openingBalance)}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">系統期末餘額：</span>
                      <span className="font-medium">${formatMoney(reconciliation.closingBalanceSystem)}</span>
                    </div>
                    {reconciliation.adjustmentCount > 0 && (
                      <div>
                        <span className="text-gray-500">調整筆數：</span>
                        <span className="font-medium text-amber-600">{reconciliation.adjustmentCount}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Bank Balance Input */}
                <div className="bg-white rounded-xl shadow-sm border p-4 mb-4">
                  <div className="flex flex-wrap items-end gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">銀行存簿期末餘額</label>
                      <input
                        type="number"
                        value={bankBalanceInput}
                        onChange={e => setBankBalanceInput(e.target.value)}
                        className="border rounded-lg px-3 py-1.5 text-sm w-48"
                        placeholder="輸入銀行存簿金額"
                        disabled={reconciliation.status === 'confirmed'}
                      />
                    </div>
                    <button
                      onClick={updateBankBalance}
                      className="px-4 py-1.5 bg-violet-600 text-white text-sm rounded-lg hover:bg-violet-700 disabled:opacity-50"
                      disabled={reconciliation.status === 'confirmed'}
                    >
                      更新餘額
                    </button>
                    <div className="ml-auto flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-xs text-gray-500">差異金額</div>
                        <div className={`text-lg font-bold ${
                          reconciliation.difference === 0 ? 'text-green-600' : 'text-orange-600'
                        }`}>
                          ${formatMoney(reconciliation.difference)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Three-column Match Layout */}
                <div className="grid grid-cols-1 lg:grid-cols-11 gap-3 mb-4">
                  {/* Left: Bank Statement Lines */}
                  <div className="lg:col-span-5 bg-white rounded-xl shadow-sm border overflow-hidden">
                    <div className="px-4 py-3 bg-violet-50 border-b flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-violet-800">銀行對帳單明細</h3>
                      <span className="text-xs text-violet-600">{bankLines.length} 筆</span>
                    </div>
                    <div className="overflow-auto max-h-[500px]">
                      {bankLines.length === 0 ? (
                        <div className="text-center py-8 text-gray-400 text-sm">
                          尚無銀行明細，請匯入 CSV
                        </div>
                      ) : (
                        <table className="w-full text-xs">
                          <thead className="bg-gray-50 sticky top-0">
                            <tr>
                              <th className="px-2 py-2 text-left">日期</th>
                              <th className="px-2 py-2 text-left">說明</th>
                              <th className="px-2 py-2 text-left min-w-[100px]">備註</th>
                              <th className="px-2 py-2 text-right">提款</th>
                              <th className="px-2 py-2 text-right">存入</th>
                              <th className="px-2 py-2 text-center">狀態</th>
                            </tr>
                          </thead>
                          <tbody>
                            {bankLines.map(line => {
                              const isMatched = line.matchStatus === 'matched';
                              const isSelected = selectedBankLine === line.id;
                              return (
                                <tr
                                  key={line.id}
                                  className={`border-b cursor-pointer transition-colors ${
                                    isMatched
                                      ? 'bg-green-50 hover:bg-green-100'
                                      : isSelected
                                        ? 'bg-violet-100'
                                        : 'bg-yellow-50 hover:bg-yellow-100'
                                  }`}
                                  onClick={() => {
                                    if (!isMatched && reconciliation.status !== 'confirmed') {
                                      setSelectedBankLine(isSelected ? null : line.id);
                                    }
                                  }}
                                >
                                  <td className="px-2 py-1.5">{line.txDate}</td>
                                  <td className="px-2 py-1.5 max-w-[120px] truncate" title={line.description}>
                                    {line.description || '-'}
                                  </td>
                                  <td className="px-2 py-1.5 max-w-[160px] truncate text-gray-600" title={line.note || line.referenceNo || ''}>
                                    {line.note || line.referenceNo || '—'}
                                  </td>
                                  <td className="px-2 py-1.5 text-right text-red-600">
                                    {line.debitAmount > 0 ? formatMoney(line.debitAmount) : ''}
                                  </td>
                                  <td className="px-2 py-1.5 text-right text-green-600">
                                    {line.creditAmount > 0 ? formatMoney(line.creditAmount) : ''}
                                  </td>
                                  <td className="px-2 py-1.5 text-center">
                                    {isMatched ? (
                                      <span className="inline-flex items-center gap-1">
                                        <span className="text-green-600">已配對</span>
                                        {reconciliation.status !== 'confirmed' && (
                                          <button
                                            onClick={(e) => { e.stopPropagation(); unmatchLine(line.id); }}
                                            className="text-red-400 hover:text-red-600 ml-1"
                                            title="取消配對"
                                          >
                                            x
                                          </button>
                                        )}
                                      </span>
                                    ) : (
                                      <span className="text-yellow-600">未配對</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>

                  {/* Center: Match Controls */}
                  <div className="lg:col-span-1 flex flex-col items-center justify-center gap-3 py-4">
                    <button
                      onClick={matchPair}
                      disabled={!selectedBankLine || !selectedSystemTx || reconciliation.status === 'confirmed'}
                      className="p-2 bg-violet-600 text-white rounded-full hover:bg-violet-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      title="配對選取項目"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                      </svg>
                    </button>
                    <div className="text-xs text-gray-400 text-center">
                      {selectedBankLine && selectedSystemTx
                        ? '點擊配對'
                        : '選取兩側各一筆'}
                    </div>
                    <div className="w-px h-8 bg-gray-200" />
                    <div className="text-center text-xs space-y-1">
                      <div className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-green-500" />
                        <span className="text-gray-500">{summary.matched}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-yellow-500" />
                        <span className="text-gray-500">{summary.bankOnly}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-orange-500" />
                        <span className="text-gray-500">{summary.systemOnly}</span>
                      </div>
                    </div>
                  </div>

                  {/* Right: System Transactions */}
                  <div className="lg:col-span-5 bg-white rounded-xl shadow-sm border overflow-hidden">
                    <div className="px-4 py-3 bg-violet-50 border-b flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-violet-800">系統交易紀錄</h3>
                      <span className="text-xs text-violet-600">{systemTxs.length} 筆</span>
                    </div>
                    <div className="overflow-auto max-h-[500px]">
                      {systemTxs.length === 0 ? (
                        <div className="text-center py-8 text-gray-400 text-sm">
                          本月尚無系統交易
                        </div>
                      ) : (
                        <table className="w-full text-xs">
                          <thead className="bg-gray-50 sticky top-0">
                            <tr>
                              <th className="px-2 py-2 text-left">日期</th>
                              <th className="px-2 py-2 text-left">說明</th>
                              <th className="px-2 py-2 text-center">類型</th>
                              <th className="px-2 py-2 text-right">金額</th>
                              <th className="px-2 py-2 text-center">狀態</th>
                            </tr>
                          </thead>
                          <tbody>
                            {systemTxs.map(tx => {
                              const isMatched = matchedTxIds.has(tx.id);
                              const isSelected = selectedSystemTx === tx.id;
                              return (
                                <tr
                                  key={tx.id}
                                  className={`border-b cursor-pointer transition-colors ${
                                    isMatched
                                      ? 'bg-green-50 hover:bg-green-100'
                                      : isSelected
                                        ? 'bg-violet-100'
                                        : 'bg-orange-50 hover:bg-orange-100'
                                  }`}
                                  onClick={() => {
                                    if (!isMatched && reconciliation.status !== 'confirmed') {
                                      setSelectedSystemTx(isSelected ? null : tx.id);
                                    }
                                  }}
                                >
                                  <td className="px-2 py-1.5">{tx.transactionDate}</td>
                                  <td className="px-2 py-1.5 max-w-[140px] truncate" title={tx.description}>
                                    {tx.description || tx.category?.name || '-'}
                                  </td>
                                  <td className="px-2 py-1.5 text-center">
                                    <span className={`px-1.5 py-0.5 rounded text-xs ${
                                      tx.type === '收入' ? 'bg-green-100 text-green-700'
                                        : tx.type === '支出' ? 'bg-red-100 text-red-700'
                                        : 'bg-blue-100 text-blue-700'
                                    }`}>
                                      {tx.type}
                                    </span>
                                  </td>
                                  <td className={`px-2 py-1.5 text-right font-medium ${
                                    tx.type === '收入' || tx.type === '移轉入' ? 'text-green-600' : 'text-red-600'
                                  }`}>
                                    {formatMoney(tx.amount)}
                                  </td>
                                  <td className="px-2 py-1.5 text-center">
                                    {isMatched ? (
                                      <span className="text-green-600">已配對</span>
                                    ) : (
                                      <span className="text-orange-600">未配對</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                </div>

                {/* Summary Bar */}
                <div className="bg-white rounded-xl shadow-sm border p-4 mb-4">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex gap-6 text-sm">
                      <span className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-green-500" />
                        已配對: <strong>{summary.matched}</strong>
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-yellow-500" />
                        銀行獨有: <strong>{summary.bankOnly}</strong>
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-orange-500" />
                        系統獨有: <strong>{summary.systemOnly}</strong>
                      </span>
                      <span className="flex items-center gap-2">
                        差異金額: <strong className={summary.difference === 0 ? 'text-green-600' : 'text-orange-600'}>
                          ${formatMoney(summary.difference)}
                        </strong>
                      </span>
                    </div>
                    {reconciliation.status !== 'confirmed' && (
                      <div className="flex items-center gap-3">
                        {reconciliation.difference !== 0 && (
                          <input
                            type="text"
                            value={diffExplained}
                            onChange={e => setDiffExplained(e.target.value)}
                            placeholder="差異說明（差異不為零時必填）"
                            className="border rounded-lg px-3 py-1.5 text-sm w-60"
                          />
                        )}
                        <button
                          onClick={confirmReconciliation}
                          className="px-6 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
                        >
                          確認封存
                        </button>
                      </div>
                    )}
                    {reconciliation.status === 'confirmed' && (
                      <div className="flex items-center gap-2 text-sm text-green-600">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        已確認封存
                        {reconciliation.confirmedBy && <span>({reconciliation.confirmedBy})</span>}
                        {reconciliation.confirmedAt && (
                          <span className="text-gray-400 text-xs">
                            {new Date(reconciliation.confirmedAt).toLocaleDateString('zh-TW')}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : null}
          </div>
        )}

        {/* ======== TAB: Formats ======== */}
        {activeTab === 'formats' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-800">銀行格式管理</h3>
              {isLoggedIn && (
                <button
                  onClick={() => setShowFormatForm(!showFormatForm)}
                  className="px-4 py-2 bg-violet-600 text-white text-sm rounded-lg hover:bg-violet-700 transition-colors"
                >
                  {showFormatForm ? '取消' : '+ 新增自訂格式'}
                </button>
              )}
            </div>

            {/* Add format form */}
            {showFormatForm && (
              <div className="bg-white rounded-xl shadow-sm border p-4 mb-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-3">新增自訂銀行格式</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">銀行名稱 *</label>
                    <input
                      type="text"
                      value={formatForm.bankName}
                      onChange={e => setFormatForm({ ...formatForm, bankName: e.target.value })}
                      className="w-full border rounded-lg px-3 py-1.5 text-sm"
                      placeholder="例: 華南銀行"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">銀行代碼</label>
                    <input
                      type="text"
                      value={formatForm.bankCode}
                      onChange={e => setFormatForm({ ...formatForm, bankCode: e.target.value })}
                      className="w-full border rounded-lg px-3 py-1.5 text-sm"
                      placeholder="例: 008"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">檔案編碼</label>
                    <select
                      value={formatForm.fileEncoding}
                      onChange={e => setFormatForm({ ...formatForm, fileEncoding: e.target.value })}
                      className="w-full border rounded-lg px-3 py-1.5 text-sm"
                    >
                      <option value="UTF-8">UTF-8</option>
                      <option value="Big5">Big5</option>
                      <option value="MS950">MS950</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">日期欄位名稱</label>
                    <input
                      type="text"
                      value={formatForm.dateColumn}
                      onChange={e => setFormatForm({ ...formatForm, dateColumn: e.target.value })}
                      className="w-full border rounded-lg px-3 py-1.5 text-sm"
                      placeholder="例: 交易日期"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">日期格式</label>
                    <select
                      value={formatForm.dateFormat}
                      onChange={e => setFormatForm({ ...formatForm, dateFormat: e.target.value })}
                      className="w-full border rounded-lg px-3 py-1.5 text-sm"
                    >
                      <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                      <option value="YYYY/MM/DD">YYYY/MM/DD</option>
                      <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                      <option value="YYYMMDD">民國 YYYMMDD</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">說明欄位名稱</label>
                    <input
                      type="text"
                      value={formatForm.descriptionColumn}
                      onChange={e => setFormatForm({ ...formatForm, descriptionColumn: e.target.value })}
                      className="w-full border rounded-lg px-3 py-1.5 text-sm"
                      placeholder="例: 摘要"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">提款欄位名稱</label>
                    <input
                      type="text"
                      value={formatForm.debitColumn}
                      onChange={e => setFormatForm({ ...formatForm, debitColumn: e.target.value })}
                      className="w-full border rounded-lg px-3 py-1.5 text-sm"
                      placeholder="例: 提款金額"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">存入欄位名稱</label>
                    <input
                      type="text"
                      value={formatForm.creditColumn}
                      onChange={e => setFormatForm({ ...formatForm, creditColumn: e.target.value })}
                      className="w-full border rounded-lg px-3 py-1.5 text-sm"
                      placeholder="例: 存入金額"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">餘額欄位名稱</label>
                    <input
                      type="text"
                      value={formatForm.balanceColumn}
                      onChange={e => setFormatForm({ ...formatForm, balanceColumn: e.target.value })}
                      className="w-full border rounded-lg px-3 py-1.5 text-sm"
                      placeholder="例: 餘額"
                    />
                  </div>
                </div>
                <div className="flex justify-end mt-4">
                  <button
                    onClick={submitFormat}
                    disabled={formatSaving}
                    className="px-6 py-2 bg-violet-600 text-white text-sm rounded-lg hover:bg-violet-700 disabled:opacity-50"
                  >
                    {formatSaving ? '儲存中…' : '儲存格式'}
                  </button>
                </div>
              </div>
            )}

            {/* Formats list */}
            {formatsLoading ? (
              <div className="text-center py-12 text-gray-400">載入中...</div>
            ) : (
              <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-violet-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-violet-800">銀行名稱</th>
                      <th className="px-4 py-3 text-left font-medium text-violet-800">銀行代碼</th>
                      <th className="px-4 py-3 text-left font-medium text-violet-800">檔案格式</th>
                      <th className="px-4 py-3 text-left font-medium text-violet-800">編碼</th>
                      <th className="px-4 py-3 text-left font-medium text-violet-800">日期格式</th>
                      <th className="px-4 py-3 text-center font-medium text-violet-800">類型</th>
                    </tr>
                  </thead>
                  <tbody>
                    {formats.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                          尚無銀行格式設定
                        </td>
                      </tr>
                    ) : (
                      formats.map(f => (
                        <tr key={f.id} className="border-b hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium">{f.bankName}</td>
                          <td className="px-4 py-3 text-gray-500">{f.bankCode || '-'}</td>
                          <td className="px-4 py-3">{f.fileType?.toUpperCase()}</td>
                          <td className="px-4 py-3">{f.fileEncoding}</td>
                          <td className="px-4 py-3">{f.dateFormat || '-'}</td>
                          <td className="px-4 py-3 text-center">
                            {f.isBuiltIn ? (
                              <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                </svg>
                                內建
                              </span>
                            ) : (
                              <span className="text-xs text-violet-600">自訂</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ======== TAB: Rental Reconciliation ======== */}
        {activeTab === 'rental' && (() => {
          const filtered = rentalPayments.filter(p => {
            if (!rentalReconSearch) return true;
            const q = rentalReconSearch.toLowerCase();
            return (
              (p.propertyName || '').toLowerCase().includes(q) ||
              (p.tenantName || '').toLowerCase().includes(q) ||
              (p.matchTransferRef || '').toLowerCase().includes(q) ||
              (p.matchBankAccountName || '').toLowerCase().includes(q) ||
              (p.accountName || '').toLowerCase().includes(q) ||
              (p.accountCode || '').toLowerCase().includes(q)
            );
          });
          const totalAmount = filtered.reduce((s, p) => s + Number(p.amount || 0), 0);
          const transferCount = filtered.filter(p => p.paymentMethod === 'transfer').length;
          const transferTotal = filtered.filter(p => p.paymentMethod === 'transfer').reduce((s, p) => s + Number(p.amount || 0), 0);
          return (
            <div>
              {/* Filters */}
              <div className="bg-white rounded-xl shadow-sm border p-4 mb-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-gray-600">年份</label>
                    <input type="number" value={rentalReconYear} onChange={e => setRentalReconYear(Number(e.target.value))}
                      className="border rounded px-2 py-1 w-20 text-sm" />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-gray-600">月份</label>
                    <select value={rentalReconMonth} onChange={e => setRentalReconMonth(e.target.value)}
                      className="border rounded px-2 py-1 text-sm">
                      <option value="">全部</option>
                      {Array.from({ length: 12 }, (_, i) => (
                        <option key={i + 1} value={i + 1}>{i + 1} 月</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-gray-600">收款帳戶</label>
                    <select value={rentalReconAccountId} onChange={e => setRentalReconAccountId(e.target.value)}
                      className="border rounded px-2 py-1 text-sm min-w-[180px]">
                      <option value="">全部收款帳戶</option>
                      {accounts.map(a => (
                        <option key={a.id} value={a.id}>
                          {a.name}{a.type ? `（${a.type}）` : ''}{a.warehouse ? ` · ${a.warehouse}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-gray-600">付款方式</label>
                    <select value={rentalReconMethodFilter} onChange={e => setRentalReconMethodFilter(e.target.value)}
                      className="border rounded px-2 py-1 text-sm">
                      <option value="">全部</option>
                      <option value="transfer">轉帳</option>
                      <option value="現金">現金</option>
                      <option value="支票">支票</option>
                      <option value="匯款">匯款</option>
                    </select>
                  </div>
                  <input type="text" value={rentalReconSearch} onChange={e => setRentalReconSearch(e.target.value)}
                    placeholder="搜尋物業/租客/轉帳參考號/收款帳戶"
                    className="border rounded px-2 py-1 text-sm w-48" />
                  <button onClick={fetchRentalPayments} disabled={rentalReconLoading}
                    className="px-4 py-1.5 bg-violet-600 text-white text-sm rounded hover:bg-violet-700 disabled:opacity-50">
                    {rentalReconLoading ? '載入中…' : '查詢'}
                  </button>
                  <a href="/rentals?tab=cashier" target="_blank"
                    className="text-xs text-violet-600 underline ml-2">前往收租工作台</a>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div className="bg-white rounded-lg shadow-sm border p-3 border-l-4 border-violet-500">
                  <p className="text-xs text-gray-500">收款筆數</p>
                  <p className="text-xl font-bold text-violet-700">{filtered.length}</p>
                </div>
                <div className="bg-white rounded-lg shadow-sm border p-3 border-l-4 border-green-500">
                  <p className="text-xs text-gray-500">合計金額</p>
                  <p className="text-xl font-bold text-green-700">${formatMoney(totalAmount)}</p>
                </div>
                <div className="bg-white rounded-lg shadow-sm border p-3 border-l-4 border-blue-500">
                  <p className="text-xs text-gray-500">轉帳筆數</p>
                  <p className="text-xl font-bold text-blue-700">{transferCount}</p>
                  <p className="text-xs text-gray-400">${formatMoney(transferTotal)}</p>
                </div>
                <div className="bg-white rounded-lg shadow-sm border p-3 border-l-4 border-gray-400">
                  <p className="text-xs text-gray-500">非轉帳筆數</p>
                  <p className="text-xl font-bold text-gray-700">{filtered.length - transferCount}</p>
                  <p className="text-xs text-gray-400">${formatMoney(totalAmount - transferTotal)}</p>
                </div>
              </div>

              {/* Table */}
              <div className="bg-white rounded-xl shadow-sm border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-violet-50 border-b">
                    <tr>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600">收款日期</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600">物業</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600">租客</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600">年/月</th>
                      <th className="text-right px-3 py-2 text-xs font-semibold text-gray-600">金額</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600">付款方式</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-teal-700">收款帳戶</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-violet-700">轉帳參考號</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-violet-700">匯款戶名</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600">備註</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rentalReconLoading ? (
                      <tr><td colSpan={10} className="text-center py-10 text-gray-400">載入中…</td></tr>
                    ) : filtered.length === 0 ? (
                      <tr><td colSpan={10} className="text-center py-10 text-gray-400">暫無資料</td></tr>
                    ) : filtered.map(p => (
                      <tr key={p.id} className="border-t hover:bg-violet-50">
                        <td className="px-3 py-2 text-gray-700">{p.paymentDate}</td>
                        <td className="px-3 py-2">{p.propertyName}</td>
                        <td className="px-3 py-2 text-gray-600">{p.tenantName}</td>
                        <td className="px-3 py-2 text-gray-500">{p.incomeYear}/{String(p.incomeMonth).padStart(2, '0')}</td>
                        <td className="px-3 py-2 text-right font-medium text-green-700">${formatMoney(p.amount)}</td>
                        <td className="px-3 py-2">
                          <span className={`text-xs px-1.5 py-0.5 rounded ${p.paymentMethod === 'transfer' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                            {p.paymentMethod === 'transfer' ? '轉帳' : (p.paymentMethod || '-')}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs text-teal-800" title={p.accountWarehouse || ''}>
                          <span className="font-medium">{p.accountName || '—'}</span>
                          {p.accountCode ? <span className="text-gray-400 ml-1">({p.accountCode})</span> : null}
                          {p.accountType ? <span className="block text-[10px] text-gray-400">{p.accountType}</span> : null}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-violet-700">{p.matchTransferRef || '-'}</td>
                        <td className="px-3 py-2 text-xs text-gray-600">{p.matchBankAccountName || '-'}</td>
                        <td className="px-3 py-2 text-xs text-gray-500">{p.matchNote || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}

        {/* ======== TAB: Credit Card ======== */}
        {activeTab === 'credit-card' && renderCreditCardTab()}

        {/* ======== MODAL: Import CSV ======== */}
        {showImportModal && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowImportModal(false)}>
            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-semibold text-gray-800 mb-4">匯入銀行對帳單 (CSV / Excel / PDF)</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">銀行格式</label>
                  <select
                    value={selectedFormatId}
                    onChange={e => setSelectedFormatId(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="">-- 選擇格式 --</option>
                    {formats.map(f => (
                      <option key={f.id} value={f.id}>{f.bankName}{f.isBuiltIn ? ' (內建)' : ''}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">上傳對帳單檔案</label>
                  <p className="text-xs text-gray-400 mb-2">
                    {selectedFormatId && ['土地', '世華', '國泰世華', '陽信', '兆豐', '玉山'].some(k => formats.find(f => String(f.id) === String(selectedFormatId))?.bankName?.includes(k)) ? (
                      <>已選銀行格式；兆豐、玉山請上傳 .xls/.xlsx，其餘支援 CSV 或 PDF（請先選格式再上傳）</>
                    ) : (
                      <>支援 CSV、Excel（.xls/.xlsx）或 PDF 格式；PDF 請先選擇對應銀行格式</>
                    )}
                  </p>
                  <input
                    type="file"
                    accept=".csv,.xls,.xlsx,.pdf"
                    onChange={handleFileUpload}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                {importLines.length > 0 && (
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-sm text-gray-600 mb-2">預覽: 共 {importLines.length} 筆</p>
                    <div className="max-h-40 overflow-auto text-xs">
                      <table className="w-full">
                        <thead>
                          <tr className="text-gray-500">
                            <th className="text-left py-1">日期</th>
                            <th className="text-left py-1">說明</th>
                            <th className="text-left py-1">備註</th>
                            <th className="text-right py-1">提款</th>
                            <th className="text-right py-1">存入</th>
                          </tr>
                        </thead>
                        <tbody>
                          {importLines.slice(0, 10).map((line, i) => (
                            <tr key={i} className="border-t">
                              <td className="py-1">{line.txDate}</td>
                              <td className="py-1 max-w-[100px] truncate" title={line.description}>{line.description}</td>
                              <td className="py-1 max-w-[120px] truncate text-gray-600" title={line.note || line.referenceNo}>{line.note || line.referenceNo || '—'}</td>
                              <td className="py-1 text-right text-red-600">{line.debitAmount !== '0' ? line.debitAmount : ''}</td>
                              <td className="py-1 text-right text-green-600">{line.creditAmount !== '0' ? line.creditAmount : ''}</td>
                            </tr>
                          ))}
                          {importLines.length > 10 && (
                            <tr><td colSpan={5} className="py-1 text-gray-400">...還有 {importLines.length - 10} 筆</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => { setShowImportModal(false); setImportLines([]); setImportFileName(''); }}
                  className="px-4 py-2 border text-gray-600 text-sm rounded-lg hover:bg-gray-50"
                >
                  取消
                </button>
                <button
                  onClick={submitImport}
                  disabled={importLines.length === 0 || !selectedFormatId || importSubmitting}
                  className="px-6 py-2 bg-violet-600 text-white text-sm rounded-lg hover:bg-violet-700 disabled:opacity-50"
                >
                  {importSubmitting ? '匯入中…' : '確認匯入'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ======== MODAL: Adjustment ======== */}
        {showAdjustModal && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowAdjustModal(false)}>
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-semibold text-gray-800 mb-4">補建調整交易</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">金額</label>
                  <input
                    type="number"
                    value={adjustForm.amount}
                    onChange={e => setAdjustForm({ ...adjustForm, amount: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                    placeholder="正數=收入，負數=支出"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">說明 *</label>
                  <input
                    type="text"
                    value={adjustForm.description}
                    onChange={e => setAdjustForm({ ...adjustForm, description: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                    placeholder="例: 銀行手續費扣款"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">交易日期</label>
                  <input
                    type="date"
                    value={adjustForm.transactionDate}
                    onChange={e => setAdjustForm({ ...adjustForm, transactionDate: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => setShowAdjustModal(false)}
                  className="px-4 py-2 border text-gray-600 text-sm rounded-lg hover:bg-gray-50"
                >
                  取消
                </button>
                <button
                  onClick={submitAdjustment}
                  disabled={adjustmentSubmitting}
                  className="px-6 py-2 bg-amber-500 text-white text-sm rounded-lg hover:bg-amber-600 disabled:opacity-50"
                >
                  {adjustmentSubmitting ? '建立中…' : '建立調整'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ReconciliationPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-gray-500">載入中…</div>}>
      <ReconciliationPageInner />
    </Suspense>
  );
}
