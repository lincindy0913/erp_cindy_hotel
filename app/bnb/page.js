'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Navigation from '@/components/Navigation';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import ExportButtons from '@/components/ExportButtons';
import PaymentModal from './_components/PaymentModal';
import BookingFormModal from './_components/BookingFormModal';
import BnbBatchLockModal from './_components/BnbBatchLockModal';
import { todayStr } from '@/lib/localDate';
import { openPrintWindow } from '@/lib/printWindow';
import { useDepositMatch } from './_hooks/useDepositMatch';
import { useBnbRecords } from './_hooks/useBnbRecords';
import { useBnbAnalytics } from './_hooks/useBnbAnalytics';
import { useOtaReconcile } from './_hooks/useOtaReconcile';
import { BNB_SOURCES, BNB_SOURCE_COLORS } from './_constants';
import CalendarTab      from './_tabs/CalendarTab';
import OccupancyTab     from './_tabs/OccupancyTab';
import PayAuditTab      from './_tabs/PayAuditTab';
import SourceAnalysisTab from './_tabs/SourceAnalysisTab';
import OtaAnalyticsTab  from './_tabs/OtaAnalyticsTab';
import PaymentSplitTab  from './_tabs/PaymentSplitTab';
import GuestHistoryTab  from './_tabs/GuestHistoryTab';
import OtaReconTab      from './_tabs/OtaReconTab';
import OtaCommissionTab from './_tabs/OtaCommissionTab';
import BossWithdrawTab  from './_tabs/BossWithdrawTab';

const NT = (v) => `NT$ ${Number(v || 0).toLocaleString()}`;
const DEFAULT_WAREHOUSE = '民宿';
const parseAmount = (v) => {
  if (v == null || v === '') return 0;
  const n = parseFloat(String(v).replace(/,/g, '').trim());
  return isNaN(n) ? 0 : Math.abs(n);
};

// ── 匯出欄位定義 ──────────────────────────────────────────────────
const BOOKING_EXPORT_COLS = [
  { header: '館別',     key: 'warehouse' },
  { header: '來源',     key: 'source' },
  { header: '姓名',     key: 'guestName' },
  { header: '房間',     key: 'roomNo' },
  { header: '入住日期', key: 'checkInDate' },
  { header: '退房日期', key: 'checkOutDate' },
  { header: '房費',     key: 'roomCharge',  format: 'number' },
  { header: '消費',     key: 'otherCharge', format: 'number' },
  { header: '訂金匯款', key: 'payDeposit',  format: 'number' },
  { header: '匯款日期', key: 'depositDate' },
  { header: '帳號後五碼',key: 'depositLast5' },
  { header: '當天匯款', key: 'payTransfer', format: 'number' },
  { header: '匯款日期', key: 'transferDate' },
  { header: '帳號後五碼',key: 'transferLast5' },
  { header: '刷卡',     key: 'payCard',     format: 'number' },
  { header: '刷卡手續費',key:'cardFee',     format: 'number' },
  { header: '現金',     key: 'payCash',     format: 'number' },
  { header: '住宿卷',   key: 'payVoucher',  format: 'number' },
  { header: '狀態',     key: 'status' },
  { header: '備註',     key: 'note' },
];

const MONTHLY_EXPORT_COLS = [
  { header: '月份',     key: 'month' },
  { header: '間數',     key: 'rooms',        format: 'number' },
  { header: '住宿房費', key: 'totalRevenue', format: 'number' },
  { header: '其他消費', key: 'otherCharge',  format: 'number' },
  { header: '訂金匯款', key: 'payDeposit',   format: 'number' },
  { header: '當天匯款', key: 'payTransfer',  format: 'number' },
  { header: '刷卡',     key: 'payCard',      format: 'number' },
  { header: '現金',     key: 'payCash',      format: 'number' },
  { header: '住宿卷',   key: 'payVoucher',   format: 'number' },
  { header: '手續費',   key: 'cardFee',      format: 'number' },
  { header: '淨收入',   key: 'netRevenue',   format: 'number' },
];

const PNL_EXPORT_COLS = [
  { header: '月份',     key: 'month' },
  { header: '住宿淨收入',key:'netRevenue',    format: 'number' },
  { header: '其他收入', key: 'otherIncome',   format: 'number' },
  { header: '收入合計', key: 'incomeTotal',   format: 'number' },
  { header: '採購支出', key: 'purchaseExpense',format:'number' },
  { header: '固定費用', key: 'fixedExpense',  format: 'number' },
  { header: '支出合計', key: 'totalExpense',  format: 'number' },
  { header: '淨利',     key: 'pnlNetProfit',  format: 'number' },
];

const TABS = [
  { key: 'records',      label: '訂房明細' },
  { key: 'otherIncome',  label: '其他收入' },
  { key: 'analytics',    label: '分析' },
  { key: 'declaration',label: '旅宿網申報' },
  { key: 'deposit',    label: '訂金核對' },
  { key: 'otaRecon',   label: 'OTA比對' },
  { key: 'otaCommission', label: 'OTA傭金' },
  { key: 'bossWithdraw', label: '老闆收取' },
  { key: 'payAudit',       label: '付款稽核' },
  { key: 'guestHistory',   label: '房客歷史' },
];

/** 分析分頁內子分頁（每日收入、報表與統計） */
const ANALYTICS_SUB_TABS = [
  { key: 'dailyRev',       label: '每日收入' },
  { key: 'monthly',        label: '月收入總表' },
  { key: 'pnl',            label: '月收支總表' },
  { key: 'declList',       label: '年度申報總表' },
  { key: 'sourceAnalysis', label: '來源分析' },
  { key: 'otaAnalytics',  label: 'OTA收益分析' },
  { key: 'paymentSplit',  label: '收款分流' },
  { key: 'occupancy',      label: '入住率統計' },
  { key: 'calendar',       label: '訂房日曆' },
];

const STATUS_COLORS = {
  '已退房': 'bg-gray-100 text-gray-600',
  '已入住': 'bg-green-100 text-green-700',
  '已預訂': 'bg-blue-100 text-blue-700',
  '已刪除': 'bg-red-100 text-red-500',
  '取消':   'bg-orange-100 text-orange-600',
  '未入住': 'bg-yellow-100 text-yellow-700',
};
function getStatusColor(s) { return STATUS_COLORS[s] ?? 'bg-gray-100 text-gray-600'; }
const SOURCE_COLORS = BNB_SOURCE_COLORS;

// 民宿快速館別按鈕（點同館別再次點擊可取消選取回到全部）
function WhQuickBtns({ list = [], value, onChange }) {
  return list.map(wh => (
    <button key={wh} type="button"
      onClick={() => onChange(value === wh ? '' : wh)}
      className={`text-xs px-2 py-1 rounded border transition-colors whitespace-nowrap ${value === wh ? 'bg-indigo-600 border-indigo-600 text-white font-medium' : 'bg-white border-gray-200 text-gray-600 hover:border-indigo-300 hover:text-indigo-700'}`}>
      {wh}
    </button>
  ));
}

// ── 主頁面 ────────────────────────────────────────────────────────
// ── 付款欄位順序（Excel Tab 跳格用）────────────────────────────
const PAY_FIELDS = ['payDeposit', 'depositDate', 'depositLast5', 'payTransfer', 'transferDate', 'transferLast5', 'payCard', 'payCash', 'payVoucher'];

function BnbPage() {
  const { data: session } = useSession();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const router = useRouter();
  const searchParams = useSearchParams();
  const doPrint = useCallback((title, headers, rows) => {
    if (!doPrint(title, headers, rows)) showToast('請允許彈出視窗以進行列印', 'error');
  }, [showToast]);
  const [activeTab, setActiveTab] = useState(() => searchParams.get('tab') || 'records');
  /** 分析分頁內子分頁 */
  const [analyticsSub, setAnalyticsSub] = useState(() => searchParams.get('sub') || 'dailyRev');

  // ── 出納同步失敗 banner ───────────────────────────────────────
  const [syncFailures, setSyncFailures] = useState([]);
  const [syncRetrying, setSyncRetrying] = useState(null);
  useEffect(() => {
    fetch('/api/bnb/sync-failures?resolved=false')
      .then(r => r.ok ? r.json() : [])
      .then(data => setSyncFailures(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);
  async function retrySyncFailure(failure) {
    setSyncRetrying(failure.id);
    try {
      const res = await fetch(`/api/bnb/sync-failures/${failure.id}`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        showToast('重試成功，出納已同步', 'success');
        setSyncFailures(prev => prev.filter(f => f.id !== failure.id));
      } else {
        showToast(data.error || '重試失敗', 'error');
      }
    } catch { showToast('重試失敗', 'error'); }
    finally { setSyncRetrying(null); }
  }

  // 是否有鎖帳權限
  const canLock = session?.user?.role === 'admin'
    || (session?.user?.permissions || []).includes('bnb.lock')
    || (session?.user?.permissions || []).includes('bnb.edit');

  // ── 訂房明細 hook ─────────────────────────────────────────────
  const {
    records, setRecords,
    recLoading, recPage, recTotal,
    filterMonth, setFilterMonth,
    filterSource, setFilterSource,
    filterStatus, setFilterStatus,
    filterWarehouse, setFilterWarehouse,
    filterPayment, setFilterPayment,
    selectedIds, setSelectedIds,
    batchField, setBatchField,
    batchValue, setBatchValue,
    batchApplying,
    inlineEdit, setInlineEdit,
    editMode, editMap, dirtyIds, batchSaving, locking, rowErrors,
    roomNoList,
    fetchRecords,
    handleBatchApply,
    handleInlineSave,
    enterEditMode, cancelEditMode, updateCell, focusPayCell, handlePayKeyDown, saveAllEdits,
    handleLockToggle, lockAllFilled, handleUnlockRow, handleDelete, handleRestore,
  } = useBnbRecords();
  const REC_PAGE_SIZE = 200;
  const [editRecord,    setEditRecord]    = useState(null); // PaymentModal
  const [editBooking,   setEditBooking]   = useState(null); // BookingFormModal (edit)
  const [addBookingOpen,setAddBookingOpen]= useState(false); // BookingFormModal (add)

  // ── 分析資料 hook ─────────────────────────────────────────────
  const {
    occYear, setOccYear, occWarehouse, setOccWarehouse, occData, occLoading, fetchOccupancy,
    saYear, setSaYear, saWarehouse, setSaWarehouse, saData, saLoading, fetchSourceAnalysis,
    oaYear, setOaYear, oaWarehouse, setOaWarehouse, oaData, oaPrevData, oaCompare, setOaCompare, oaLoading, fetchOtaAnalytics,
    psYear, setPsYear, psWarehouse, setPsWarehouse, psData, psLoading, fetchPaymentSplit,
    auditMonth, setAuditMonth, auditWarehouse, setAuditWarehouse, auditData, auditLoading, auditOverflow, fetchAudit,
    ghSearch, setGhSearch, ghData, ghLoading, ghSearched, fetchGuestHistory,
    summaryYear, setSummaryYear, summaryWarehouse, setSummaryWarehouse, summaryMode, setSummaryMode,
    summaryRows, summaryLoading, summaryFixedHelp, fetchSummary,
  } = useBnbAnalytics({ showToast });

  // ── 館別清單 state ────────────────────────────────────────────
  const [warehouseList, setWarehouseList] = useState([]);

  // ── 訂金核對（已拆至 _hooks/useDepositMatch）────────────────────
  const {
    dmMonth, setDmMonth, dmWarehouse, setDmWarehouse,
    dmAccountId, setDmAccountId, dmData, setDmData,
    dmLoading, dmAccounts, dmSelBnb, setDmSelBnb,
    dmSelLine, setDmSelLine, dmMatching, dmPayType, setDmPayType,
    dmMarkModal, setDmMarkModal, dmMarkNote, setDmMarkNote,
    fetchDepositMatch, handleMatch, handleUnmatch,
    handleMark, handleClearMark, handleAutoMatch,
  } = useDepositMatch();

  // ── 老闆收取 state ───────────────────────────────────────────
  const [bwMonth,       setBwMonth]       = useState(() => todayStr().slice(0, 7));
  const [bwWarehouse,   setBwWarehouse]   = useState('');
  const [bwViewMode,    setBwViewMode]    = useState('detail');
  const [bwYear,        setBwYear]        = useState(() => String(new Date().getFullYear()));
  const [bwData,        setBwData]        = useState(null);
  const [bwLoading,     setBwLoading]     = useState(false);
  const [bwSummary,     setBwSummary]     = useState(null);
  const [bwSummaryLoad, setBwSummaryLoad] = useState(false);

  const fetchBossWithdraw = useCallback(async () => {
    setBwLoading(true);
    try {
      const q = new URLSearchParams({ month: bwMonth });
      if (bwWarehouse) q.set('warehouse', bwWarehouse);
      const res = await fetch(`/api/bnb/boss-withdraw?${q}`);
      if (res.ok) setBwData(await res.json());
    } catch { /* ignore */ } finally { setBwLoading(false); }
  }, [bwMonth, bwWarehouse]);

  const fetchBossWithdrawSummary = useCallback(async () => {
    setBwSummaryLoad(true);
    try {
      const q = new URLSearchParams({ year: bwYear, summary: 'true' });
      if (bwWarehouse) q.set('warehouse', bwWarehouse);
      const res = await fetch(`/api/bnb/boss-withdraw?${q}`);
      if (res.ok) setBwSummary(await res.json());
    } catch { /* ignore */ } finally { setBwSummaryLoad(false); }
  }, [bwYear, bwWarehouse]);

  // ── 存簿匯入 modal state ──────────────────────────────────────
  const [showBankImport, setShowBankImport] = useState(false);
  const [bankImportLines, setBankImportLines] = useState([]);
  const [bankImportFileName, setBankImportFileName] = useState('');
  const [bankImportParsing, setBankImportParsing] = useState(false);
  const [bankImportSubmitting, setBankImportSubmitting] = useState(false);
  const [bankImportError, setBankImportError] = useState('');

  // ── 收款流水帳 state ─────────────────────────────────────────
  const thisMonth = todayStr().slice(0, 7);
  const [ledgerMonthFrom, setLedgerMonthFrom] = useState(thisMonth);
  const [ledgerMonthTo,   setLedgerMonthTo]   = useState(thisMonth);
  const [ledgerWarehouse, setLedgerWarehouse] = useState('');
  const [ledgerRows,      setLedgerRows]      = useState([]);
  const [ledgerLoading,   setLedgerLoading]   = useState(false);

  // ── 月固定費用模板 state ─────────────────────────────────────
  const [recurringTemplates, setRecurringTemplates] = useState([]);
  const [showRecurringMgr,   setShowRecurringMgr]   = useState(false);
  const [recurringForm,      setRecurringForm]       = useState({ warehouse: '', category: '', description: '', defaultAmt: '' });
  const [recurringDraftMonth, setRecurringDraftMonth] = useState(thisMonth);
  const [recurringDrafting,   setRecurringDrafting]   = useState(false);

  async function fetchRecurringTemplates(wh) {
    const p = new URLSearchParams(wh ? { warehouse: wh } : {});
    fetch(`/api/bnb/recurring-expenses?${p}`)
      .then(r => r.ok ? r.json() : [])
      .then(data => setRecurringTemplates(Array.isArray(data) ? data : []))
      .catch(() => {});
  }

  async function saveRecurringTemplate() {
    if (!recurringForm.warehouse || !recurringForm.category || !recurringForm.description || !recurringForm.defaultAmt) {
      showToast('請填寫所有欄位', 'error'); return;
    }
    const res = await fetch('/api/bnb/recurring-expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(recurringForm),
    });
    if (res.ok) {
      showToast('模板已建立', 'success');
      setRecurringForm({ warehouse: '', category: '', description: '', defaultAmt: '' });
      fetchRecurringTemplates();
    } else {
      const err = await res.json().catch(() => ({}));
      showToast(err.error || '建立失敗', 'error');
    }
  }

  async function deleteRecurringTemplate(id) {
    const res = await fetch(`/api/bnb/recurring-expenses/${id}`, { method: 'DELETE' });
    if (res.ok) { showToast('已停用', 'success'); fetchRecurringTemplates(); }
    else showToast('操作失敗', 'error');
  }

  async function createRecurringDrafts() {
    if (!recurringDraftMonth) { showToast('請選擇月份', 'error'); return; }
    setRecurringDrafting(true);
    try {
      const res = await fetch('/api/bnb/recurring-expenses?action=draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: recurringDraftMonth }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        showToast(data.message || `已建立 ${data.created} 筆草稿`, 'success');
        fetchOtherIncome();
      } else showToast(data.error || '建立失敗', 'error');
    } catch { showToast('建立失敗', 'error'); }
    finally { setRecurringDrafting(false); }
  }

  // ── 其他收入 state ──────────────────────────────────────────
  const [oiMonth,       setOiMonth]       = useState(thisMonth);
  const [oiWarehouse,   setOiWarehouse]   = useState('');
  const [oiRows,        setOiRows]        = useState([]);
  const [oiLoading,     setOiLoading]     = useState(false);
  const [oiModalOpen,   setOiModalOpen]   = useState(false);
  const [oiEditRow,     setOiEditRow]     = useState(null); // null=新增, obj=編輯
  const [oiSaving,      setOiSaving]      = useState(false);
  const OI_CATEGORIES = ['停車費', '清潔費', '設備租借', '其他'];
  const [oiForm, setOiForm] = useState({ importMonth: thisMonth, warehouse: DEFAULT_WAREHOUSE, incomeDate: '', category: '', description: '', amount: '', note: '' });

  async function fetchOtherIncome() {
    setOiLoading(true);
    try {
      const params = new URLSearchParams();
      if (oiMonth) params.set('month', oiMonth);
      if (oiWarehouse) params.set('warehouse', oiWarehouse);
      const res = await fetch(`/api/bnb/other-income?${params}`);
      const json = await res.json();
      setOiRows(Array.isArray(json.data) ? json.data : []);
    } catch { setOiRows([]); }
    finally { setOiLoading(false); }
  }

  function openOiModal(row) {
    setOiEditRow(row);
    setOiForm(row ? {
      importMonth: row.importMonth || oiMonth,
      warehouse: row.warehouse || DEFAULT_WAREHOUSE,
      incomeDate: row.incomeDate || '',
      category: row.category || '',
      description: row.description || '',
      amount: row.amount != null ? String(row.amount) : '',
      note: row.note || '',
    } : {
      importMonth: oiMonth,
      warehouse: oiWarehouse || DEFAULT_WAREHOUSE,
      incomeDate: todayStr(),
      category: '',
      description: '',
      amount: '',
      note: '',
    });
    setOiModalOpen(true);
  }

  async function saveOtherIncome() {
    if (!oiForm.importMonth || !oiForm.incomeDate || !oiForm.description || !oiForm.amount) {
      showToast('請填寫月份、日期、說明、金額', 'error'); return;
    }
    setOiSaving(true);
    try {
      const body = {
        importMonth: oiForm.importMonth,
        warehouse: oiForm.warehouse,
        incomeDate: oiForm.incomeDate,
        category: oiForm.category || null,
        description: oiForm.description.trim(),
        amount: parseFloat(oiForm.amount) || 0,
        note: oiForm.note?.trim() || null,
      };
      const url = oiEditRow ? `/api/bnb/other-income/${oiEditRow.id}` : '/api/bnb/other-income';
      const method = oiEditRow ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { showToast(data.error || '儲存失敗', 'error'); return; }
      showToast(oiEditRow ? '已更新' : '已新增', 'success');
      setOiModalOpen(false);
      fetchOtherIncome();
    } catch { showToast('儲存失敗', 'error'); }
    finally { setOiSaving(false); }
  }

  async function deleteOtherIncome(id) {
    try {
      const res = await fetch(`/api/bnb/other-income/${id}`, { method: 'DELETE' });
      if (!res.ok) { const d = await res.json(); showToast(d.error || '刪除失敗', 'error'); return; }
      showToast('已刪除', 'success');
      fetchOtherIncome();
    } catch { showToast('刪除失敗', 'error'); }
  }

  // ── 旅宿網申報 state ─────────────────────────────────────────
  const [declMonth,     setDeclMonth]     = useState(() => todayStr().slice(0, 7));
  const [declWarehouse, setDeclWarehouse] = useState(DEFAULT_WAREHOUSE);
  const [declActual,    setDeclActual]    = useState(null);  // 實際資料（auto-computed）
  const [declForm, setDeclForm] = useState({
    cardTotal: '', roomPriceTotal: '', subsidizedRooms: '',
    avgRoomRate: '', monthlyRoomCount: '', roomSuppliesCost: '', fbExpense: '',
    fitGuestCount: '', staffCount: '', salary: '', businessSource: '其他100%',
    otherIncome: '', otherIncomeNote: '', note: '',
  });
  const [declSaving, setDeclSaving] = useState(false);
  const [declLoading, setDeclLoading] = useState(false);
  const [declSearched, setDeclSearched] = useState(false);

  // ── 年度申報總覽 state ─────────────────────────────────────
  const [dlYear,    setDlYear]    = useState(() => new Date().getFullYear().toString());
  const [dlWarehouse, setDlWarehouse] = useState(DEFAULT_WAREHOUSE);
  const [dlRows,    setDlRows]    = useState([]);
  const [dlLoading, setDlLoading] = useState(false);

  // ── OTA 比對 + 傭金 hook ────────────────────────────────────
  const {
    otaSource, setOtaSource, otaDateFrom, setOtaDateFrom, otaDateTo, setOtaDateTo,
    otaWarehouse, setOtaWarehouse, otaFile, setOtaFile, otaPreview, otaPreviewLoading,
    otaResult, otaLoading, otaMonth, setOtaMonth, otaViewTab, setOtaViewTab,
    previewOta, runOtaReconcile, confirmReconcile, reconcileConfirmed, reconcileConfirming,
    openOtaEdit, deleteOtaBnb, openOtaAdd,
    reconLogs, reconLogsLoading, fetchReconLogs,
    commAmt, setCommAmt, commMethod, setCommMethod, commNote, setCommNote,
    commSubmitting, commExisting, commSource, setCommSource,
    commHistRows, commHistLoading, commEditId, setCommEditId, commEditData, setCommEditData, commEditSaving,
    submitCommission, fetchCommHistory, confirmCommission, cancelCommission,
    startEditComm, saveEditComm,
  } = useOtaReconcile({ showToast, confirm, setEditBooking, DEFAULT_WAREHOUSE });

  // ── 鎖帳 state ──────────────────────────────────────────────
  const [lockStatus, setLockStatus]       = useState(null);
  const [lockAudits, setLockAudits]       = useState([]);
  const [showLockHistory, setShowLockHistory] = useState(false);
  const [showBatchLock, setShowBatchLock]     = useState(false);
  const [lockLoading, setLockLoading] = useState(false);

  // ── 館別清單（session 載入後才 fetch，否則會 401）────────────
  useEffect(() => {
    if (!session) return;
    fetch('/api/warehouse-departments')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.list) {
          const list = data.list.filter(w => w.type === 'building' && !w.parentId).map(w => w.name);
          if (list.length === 0) return;
          setWarehouseList(list);
          const first = list[0];
          setImportWarehouse(prev => prev === DEFAULT_WAREHOUSE ? first : prev);
          setDrWarehouse(prev    => prev === DEFAULT_WAREHOUSE ? first : prev);
          setDeclWarehouse(prev  => prev === DEFAULT_WAREHOUSE ? first : prev);
          setDlWarehouse(prev    => prev === DEFAULT_WAREHOUSE ? first : prev);
          setOtaWarehouse(prev   => prev === DEFAULT_WAREHOUSE ? first : prev);
        }
      })
      .catch(() => {});
  }, [session]);

  // ── 銀行帳戶 fetch（mount once）──────────────────────────────

  // ── 鎖帳 fetch / toggle ──────────────────────────────────────
  const fetchLockStatus = useCallback(async (month, warehouse = DEFAULT_WAREHOUSE) => {
    if (!month) return;
    try {
      const p = new URLSearchParams({ month, warehouse });
      const res = await fetch(`/api/bnb/lock?${p}`);
      if (res.ok) setLockStatus(await res.json());
    } catch { /* ignore */ }
  }, []);

  const getActiveLockContext = useCallback(() => {
    switch (activeTab) {
      case 'declaration': return { month: declMonth,   warehouse: declWarehouse };
      case 'deposit':     return { month: dmMonth,     warehouse: dmWarehouse || DEFAULT_WAREHOUSE };
      default:            return { month: filterMonth,  warehouse: DEFAULT_WAREHOUSE };
    }
  }, [activeTab, filterMonth, declMonth, declWarehouse, dmMonth, dmWarehouse]);

  const fetchLockAudits = useCallback(async (month, warehouse) => {
    if (!month) return;
    const p = new URLSearchParams({ month, warehouse });
    fetch(`/api/bnb/lock-audits?${p}`)
      .then(r => r.ok ? r.json() : [])
      .then(data => setLockAudits(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  const toggleLock = useCallback(async () => {
    if (lockLoading) return;
    const { month, warehouse } = getActiveLockContext();
    const isLocked = lockStatus?.locked;
    const action = isLocked ? '解鎖' : '鎖帳';

    let reason = '';
    if (isLocked) {
      reason = window.prompt(`請填寫「${month}（${warehouse}）」解鎖原因（必填）：`);
      if (reason === null) return; // 取消
      if (!reason.trim()) { showToast('解鎖原因不可為空', 'error'); return; }
    } else {
      if (!(await confirm(`確定要鎖帳「${month}（${warehouse}）」？\n鎖帳後所有訂房資料、付款明細、匯入、申報都將無法修改。`, { title: '鎖帳確認', danger: true }))) return;
    }

    setLockLoading(true);
    try {
      const p = new URLSearchParams({ month, warehouse, ...(isLocked ? { reason } : {}) });
      const res = isLocked
        ? await fetch(`/api/bnb/lock?${p}`, { method: 'DELETE' })
        : await fetch('/api/bnb/lock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ month, warehouse }) });
      if (res.ok) {
        const data = await res.json();
        setLockStatus(data);
        showToast(`${month} 已${data.locked ? '鎖帳' : '解鎖'}`, 'success');
        fetchLockAudits(month, warehouse);
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || `${action}失敗`, 'error');
      }
    } catch { showToast(`${action}失敗`, 'error'); }
    finally { setLockLoading(false); }
  }, [lockStatus, lockLoading, getActiveLockContext]);

  // ── 月彙整 fetch ──────────────────────────────────────────────

  // ── 訂房日曆 fetch ────────────────────────────────────────────
  const fetchCalendar = useCallback(async () => {
    setCalLoading(true);
    try {
      const ym = `${calYear}-${String(calMonth).padStart(2, '0')}`;
      const p = new URLSearchParams({ month: ym, pageSize: '500' });
      if (calWarehouse) p.set('warehouse', calWarehouse);
      const res = await fetch(`/api/bnb?${p}`);
      if (!res.ok) return;
      const json = await res.json();
      const rows = json.data ?? json;
      setCalData(rows);
      setCalOverflow(rows.length >= 500);
    } catch { showToast('載入日曆失敗', 'error'); }
    finally { setCalLoading(false); }
  }, [calYear, calMonth, calWarehouse]);


  const fetchDailyRevenue = useCallback(async () => {
    setDrLoading(true);
    setDrExpandDay(null);
    try {
      const p = new URLSearchParams({ month: drMonth });
      if (drWarehouse) p.set('warehouse', drWarehouse);
      const res = await fetch(`/api/bnb/daily-revenue?${p}`);
      if (!res.ok) { showToast('載入每日收入失敗', 'error'); return; }
      setDrData(await res.json());
    } catch { showToast('載入每日收入失敗', 'error'); }
    finally { setDrLoading(false); }
  }, [drMonth, drWarehouse]);

  // ── 旅宿網申報 fetch（實際 + 已存報表）─────────────────────────
  const fetchDecl = useCallback(async () => {
    setDeclLoading(true);
    setDeclSearched(true);
    try {
      const wh = encodeURIComponent(declWarehouse);
      const [actualRes, reportRes] = await Promise.all([
        fetch(`/api/bnb/actual-stats?month=${declMonth}&warehouse=${wh}`),
        fetch(`/api/bnb/monthly-report?month=${declMonth}&warehouse=${wh}`),
      ]);

      const actual = actualRes.ok ? await actualRes.json() : null;
      setDeclActual(actual);

      const saved = reportRes.ok ? await reportRes.json() : null;

      if (saved) {
        setDeclForm({
          cardTotal:        saved.cardTotal        ?? '',
          roomPriceTotal:   saved.roomPriceTotal   ?? '',
          subsidizedRooms:  saved.subsidizedRooms  ?? '',
          avgRoomRate:      saved.avgRoomRate       ?? '',
          monthlyRoomCount: saved.monthlyRoomCount ?? '',
          roomSuppliesCost: saved.roomSuppliesCost ?? '',
          fbExpense:        saved.fbExpense        ?? '',
          fitGuestCount:    saved.fitGuestCount    ?? '',
          staffCount:       saved.staffCount       ?? '',
          salary:           saved.salary           ?? '',
          businessSource:   saved.businessSource   || '其他100%',
          otherIncome:      saved.otherIncome      || '',
          otherIncomeNote:  saved.otherIncomeNote  || '',
          note:             saved.note             || '',
        });
      } else if (actual) {
        setDeclForm({
          cardTotal:        Math.round(actual.payCard) || '',
          roomPriceTotal:   Math.round(actual.revenueTotal) || '',
          subsidizedRooms:  '',
          avgRoomRate:      actual.avgRoomRate || '',
          monthlyRoomCount: actual.roomCount || '',
          roomSuppliesCost: '',
          fbExpense:        '',
          fitGuestCount:    '',
          staffCount:       '',
          salary:           '',
          businessSource:   actual.businessSourceAuto || '其他100%',
          otherIncome:      '',
          otherIncomeNote:  '',
          note:             '',
        });
      }
    } finally { setDeclLoading(false); }
  }, [declMonth, declWarehouse]);

  const fetchDeclList = useCallback(async () => {
    setDlLoading(true);
    try {
      const res = await fetch(`/api/bnb/declaration-list?year=${dlYear}&warehouse=${encodeURIComponent(dlWarehouse)}`);
      if (res.ok) {
        const data = await res.json();
        setDlRows(data.rows || []);
      }
    } catch { /* ignore */ }
    finally { setDlLoading(false); }
  }, [dlYear, dlWarehouse]);

  useEffect(() => {
    if (activeTab === 'records')     fetchRecords();
    if (activeTab === 'otherIncome') fetchOtherIncome();
    if (activeTab === 'analytics' && analyticsSub === 'dailyRev') fetchDailyRevenue();
    if (activeTab === 'analytics' && (analyticsSub === 'monthly' || analyticsSub === 'pnl')) fetchSummary();
    if (activeTab === 'declaration') { setDeclSearched(false); setDeclActual(null); }
    if (activeTab === 'analytics' && analyticsSub === 'declList') fetchDeclList();
    if (activeTab === 'deposit' && dmAccountId) fetchDepositMatch();
    if (activeTab === 'otaCommission') { fetchCommHistory(); fetchReconLogs(); }
    if (activeTab === 'bossWithdraw')  fetchBossWithdraw();
    if (activeTab === 'analytics' && analyticsSub === 'occupancy') fetchOccupancy();
    if (activeTab === 'analytics' && analyticsSub === 'sourceAnalysis') fetchSourceAnalysis();
    if (activeTab === 'analytics' && analyticsSub === 'otaAnalytics')  fetchOtaAnalytics();
    if (activeTab === 'analytics' && analyticsSub === 'paymentSplit')  fetchPaymentSplit();
    if (activeTab === 'payAudit')      fetchAudit();
    if (activeTab === 'analytics' && analyticsSub === 'calendar') fetchCalendar();
  }, [activeTab, analyticsSub]);

  useEffect(() => {
    const ctx = getActiveLockContext();
    fetchLockStatus(ctx.month, ctx.warehouse);
  }, [activeTab, filterMonth, declMonth, declWarehouse, dmMonth, dmWarehouse]);

  useEffect(() => {
    if (activeTab === 'records') { setSelectedIds(new Set()); fetchRecords(); }
  }, [filterMonth, filterSource, filterStatus, filterWarehouse]);
  useEffect(() => {
    if (activeTab === 'analytics' && (analyticsSub === 'monthly' || analyticsSub === 'pnl')) fetchSummary();
  }, [summaryYear, summaryWarehouse, summaryMode, activeTab, analyticsSub]);
  useEffect(() => {
    if (activeTab === 'analytics' && analyticsSub === 'declList') fetchDeclList();
  }, [dlYear, dlWarehouse, activeTab, analyticsSub]);
  useEffect(() => { if (activeTab === 'bossWithdraw') fetchBossWithdraw(); }, [bwMonth, bwWarehouse, activeTab]);
  useEffect(() => {
    if (activeTab === 'analytics' && analyticsSub === 'occupancy') fetchOccupancy();
  }, [occYear, occWarehouse, activeTab, analyticsSub]);
  useEffect(() => {
    if (activeTab === 'analytics' && analyticsSub === 'sourceAnalysis') fetchSourceAnalysis();
  }, [saYear, saWarehouse, activeTab, analyticsSub]);
  useEffect(() => {
    if (activeTab === 'analytics' && analyticsSub === 'otaAnalytics') fetchOtaAnalytics();
  }, [oaYear, oaWarehouse, oaCompare, activeTab, analyticsSub]);
  useEffect(() => {
    if (activeTab === 'analytics' && analyticsSub === 'paymentSplit') fetchPaymentSplit();
  }, [psYear, psWarehouse, activeTab, analyticsSub]);
  useEffect(() => {
    if (activeTab === 'deposit') fetchDepositMatch();
  }, [dmPayType, activeTab]);
  useEffect(() => { if (activeTab === 'payAudit') fetchAudit(); }, [auditMonth, auditWarehouse, activeTab]);
  useEffect(() => {
    if (activeTab === 'analytics' && analyticsSub === 'calendar') fetchCalendar();
  }, [calYear, calMonth, calWarehouse, activeTab, analyticsSub]);

  useEffect(() => {
    if (activeTab === 'analytics' && analyticsSub === 'dailyRev') fetchDailyRevenue();
  }, [drMonth, drWarehouse, activeTab, analyticsSub]);

  const isLocked   = !!lockStatus?.locked;
  const monthLocked = isLocked;

  // ── 選擇檔案後自動預覽（偵測月份 + 前 5 筆） ─────────────────
  async function handleFileSelect(file) {
    setImportFile(file);
    setImportPreview(null);
    setImportResult(null);
    setImportConfirm(null);
    if (!file) return;
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('importMonth', importMonth);
      fd.append('warehouse', importWarehouse);
      fd.append('preview', 'true');
      const res  = await fetch('/api/bnb/import', { method: 'POST', body: fd });
      const data = await res.json();
      if (res.ok && data.preview) {
        setImportPreview(data);
        // 自動更新月份（若偵測到不同月份）
        if (data.detectedMonth && data.detectedMonth !== importMonth) {
          setImportMonth(data.detectedMonth);
        }
      }
    } catch {} // 預覽失敗不阻礙後續操作
  }

  // ── 匯入（帶覆蓋確認） ────────────────────────────────────────
  async function handleImport() {
    if (!importFile) { showToast('請選擇檔案', 'error'); return; }
    if (importReplace) {
      // 查現有筆數，若有資料則顯示確認對話框
      try {
        const res  = await fetch(`/api/bnb/import?importMonth=${importMonth}&warehouse=${encodeURIComponent(importWarehouse)}`);
        const data = await res.json();
        if (data.count > 0) { setImportConfirm({ existingCount: data.count }); return; }
      } catch {}
    }
    await doImport();
  }

  // ── 實際執行匯入 ──────────────────────────────────────────────
  async function doImport() {
    setImporting(true); setImportResult(null); setImportConfirm(null);
    try {
      const fd = new FormData();
      fd.append('file', importFile);
      fd.append('importMonth', importMonth);
      fd.append('warehouse', importWarehouse);
      fd.append('replace', importReplace ? 'true' : 'false');
      const res  = await fetch('/api/bnb/import', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) { showToast(data.error || data.message || '匯入失敗', 'error'); return; }
      setImportResult(data);
      const msg = `匯入成功：${data.imported} 筆` +
        (data.deleted > 0 ? `，刪除舊資料 ${data.deleted} 筆` : '') +
        (data.skipped > 0 ? `，略過重複 ${data.skipped} 筆` : '');
      showToast(msg, 'success');
      setImportFile(null);
      setImportPreview(null);
      // 匯入後跳到對應月份
      setFilterMonth(importMonth);
      fetchRecords(1);
      // 寫入本次 session 歷史
      const entry = {
        importMonth,
        warehouse: importWarehouse,
        imported:  data.imported,
        deleted:   data.deleted || 0,
        skipped:   data.skipped || 0,
        replace:   importReplace,
        at:        new Date().toLocaleString('zh-TW'),
      };
      setImportHistory(prev => {
        const next = [entry, ...prev].slice(0, 20);
        try { localStorage.setItem('bnb_import_history', JSON.stringify(next)); } catch {}
        return next;
      });
    } catch { showToast('匯入失敗', 'error'); }
    finally { setImporting(false); }
  }

  // ── 批次選取 ──────────────────────────────────────────────────
  function toggleSelect(id) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function toggleSelectAll() {
    const eligible = records.filter(r => r.status !== '已刪除').map(r => r.id);
    if (selectedIds.size === eligible.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(eligible));
    }
  }

  // ── 旅宿網申報儲存 ────────────────────────────────────────────
  async function handleDeclSave() {
    setDeclSaving(true);
    try {
      const res = await fetch('/api/bnb/monthly-report', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...declForm, reportMonth: declMonth, warehouse: declWarehouse }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || '儲存失敗', 'error');
        return;
      }
      showToast('月報已儲存', 'success');
      if (activeTab === 'analytics' && (analyticsSub === 'monthly' || analyticsSub === 'pnl')) fetchSummary();
      if (activeTab === 'analytics' && analyticsSub === 'declList') fetchDeclList();
    } finally { setDeclSaving(false); }
  }

  function handleAutoFillDecl() {
    if (!declActual) { showToast('請先查詢實際資料', 'error'); return; }
    setDeclForm(prev => ({
      ...prev,
      cardTotal:        Math.round(declActual.payCard) || '',
      roomPriceTotal:   Math.round(declActual.revenueTotal) || '',
      avgRoomRate:      declActual.avgRoomRate || prev.avgRoomRate || '',
      monthlyRoomCount: declActual.roomCount || '',
      businessSource:   declActual.businessSourceAuto || prev.businessSource || '',
    }));
    showToast('已從實際資料帶入可計算的欄位', 'success');
  }

  // ── 統計摘要 ──────────────────────────────────────────────────
  const recStats = records.reduce((acc, r) => {
    if (r.status === '已刪除') return acc;
    acc.rooms++;
    acc.revenue  += Number(r.roomCharge) + Number(r.otherCharge);
    acc.deposit  += Number(r.payDeposit);
    acc.transfer += Number(r.payTransfer);
    acc.card     += Number(r.payCard);
    acc.cash     += Number(r.payCash);
    acc.voucher  += Number(r.payVoucher);
    acc.cardFee  += Number(r.cardFee);
    acc.unfilled      += (!r.paymentFilled && !r.isComplimentary) ? 1 : 0;
    acc.complimentary += r.isComplimentary ? 1 : 0;
    acc.locked        += r.paymentLocked ? 1 : 0;
    const pt = Number(r.payDeposit) + Number(r.payTransfer) + Number(r.payCard) + Number(r.payCash) + Number(r.payVoucher);
    const ct = Number(r.roomCharge) + Number(r.otherCharge);
    if (r.paymentFilled && !r.isComplimentary && Math.abs(pt - ct) > 0.01) acc.mismatch++;
    return acc;
  }, { rooms: 0, revenue: 0, deposit: 0, transfer: 0, card: 0, cash: 0, voucher: 0, cardFee: 0, unfilled: 0, complimentary: 0, locked: 0, mismatch: 0 });

  // ── 房號分析（依目前 records 頁面資料計算）────────────────────
  const roomStats = (() => {
    const map = {};
    for (const r of records) {
      if (r.status === '已刪除') continue;
      const key = r.roomNo || '未指定';
      if (!map[key]) map[key] = { roomNo: key, bookings: 0, revenue: 0, nights: 0 };
      map[key].bookings++;
      map[key].revenue += Number(r.roomCharge) + Number(r.otherCharge);
      map[key].nights  += Math.max(0, Math.round((new Date(r.checkOutDate) - new Date(r.checkInDate)) / 86400000));
    }
    return Object.values(map).sort((a, b) => b.bookings - a.bookings);
  })();

  const inputCls = 'border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-400 outline-none';
  const btnCls   = 'px-3 py-1.5 text-sm rounded-lg border hover:bg-gray-50 transition-colors';

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation borderColor="border-indigo-500" />

      <main className="max-w-[96rem] mx-auto px-4 py-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900">民宿帳</h2>
          <p className="text-sm text-gray-500 mt-1">訂房收入、付款明細、月收支總表、旅宿網申報</p>
        </div>

        {/* 出納同步失敗 banner */}
        {syncFailures.length > 0 && (
          <div className="mb-4 bg-amber-50 border border-amber-300 rounded-xl px-4 py-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-amber-700 font-medium text-sm">⚠ {syncFailures.length} 筆訂房出納同步失敗，帳務可能不一致</span>
            </div>
            <div className="space-y-1">
              {syncFailures.map(f => (
                <div key={f.id} className="flex items-center gap-3 text-xs text-amber-800">
                  <span className="font-medium">{f.booking?.guestName} {f.booking?.checkInDate}</span>
                  <span className="text-amber-600 truncate max-w-xs">{f.errorMsg}</span>
                  <button
                    onClick={() => retrySyncFailure(f)}
                    disabled={syncRetrying === f.id}
                    className="ml-auto px-2.5 py-1 border border-amber-400 rounded text-amber-700 hover:bg-amber-100 disabled:opacity-50 whitespace-nowrap">
                    {syncRetrying === f.id ? '重試中…' : '重試同步'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab bar */}
        <div className="flex flex-wrap gap-1 mb-6 bg-white rounded-xl shadow-sm border border-gray-100 p-1">
          {TABS.map(t => (
            <button key={t.key} onClick={() => {
              setActiveTab(t.key);
              const url = t.key === 'analytics' ? `?tab=analytics&sub=${analyticsSub}` : `?tab=${t.key}`;
              router.replace(url, { scroll: false });
            }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === t.key ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'
              }`}>
              {t.label}
            </button>
          ))}
          {/* 鎖帳狀態指示 + 按鈕 */}
          <div className="ml-auto flex items-center gap-2">
            {isLocked && (
              <span className="flex items-center gap-1 text-xs text-red-600 bg-red-50 px-2.5 py-1.5 rounded-lg border border-red-200">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" /></svg>
                {getActiveLockContext().month} 已鎖帳
                {lockStatus?.lockedBy && <span className="text-gray-400">（{lockStatus.lockedBy}）</span>}
              </span>
            )}
            <button onClick={toggleLock} disabled={lockLoading}
              className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                isLocked
                  ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
                  : 'border-green-300 bg-green-50 text-green-700 hover:bg-green-100'
              } disabled:opacity-50`}>
              {lockLoading ? '處理中…' : isLocked ? '解鎖此月' : '鎖帳此月'}
            </button>
            <button onClick={() => { const { month, warehouse } = getActiveLockContext(); fetchLockAudits(month, warehouse); setShowLockHistory(true); }}
              className="px-3 py-1.5 text-xs rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50">
              紀錄
            </button>
            <button onClick={() => setShowBatchLock(true)}
              className="px-3 py-1.5 text-xs rounded-lg border border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100">
              批次鎖帳
            </button>
          </div>
        </div>

        {activeTab === 'analytics' && (
          <div className="flex flex-wrap gap-1 mb-6 bg-indigo-50/80 rounded-xl border border-indigo-100 p-1.5">
            {ANALYTICS_SUB_TABS.map(st => (
              <button
                key={st.key}
                type="button"
                onClick={() => { setAnalyticsSub(st.key); router.replace(`?tab=analytics&sub=${st.key}`, { scroll: false }); }}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  analyticsSub === st.key ? 'bg-indigo-700 text-white shadow-sm' : 'text-indigo-900/80 hover:bg-white/80'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>
        )}

        {/* ══ Tab: 訂房明細 ══ */}
        {activeTab === 'records' && (
          <div>
            {/* 篩選列 */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4 flex flex-wrap gap-3 items-end">
              <div>
                <label htmlFor="f" className="block text-xs text-gray-500 mb-1">月份</label>
                <input id="f" type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label htmlFor="f-2" className="block text-xs text-gray-500 mb-1">來源</label>
                <select id="f-2" value={filterSource} onChange={e => setFilterSource(e.target.value)} className={inputCls}>
                  <option value="">全部</option>
                  {BNB_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="f-3" className="block text-xs text-gray-500 mb-1">狀態</label>
                <select id="f-3" value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className={inputCls}>
                  <option value="">全部</option>
                  {Object.keys(STATUS_COLORS).map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="f-39" className="block text-xs text-gray-500 mb-1">館別</label>
                <select id="f-39" value={filterWarehouse} onChange={e => setFilterWarehouse(e.target.value)} className={inputCls}>
                  <option value="">全部</option>
                  {warehouseList.map(w => <option key={w} value={w}>{w}</option>)}
                </select>
                <WhQuickBtns list={warehouseList} value={filterWarehouse} onChange={setFilterWarehouse} />
              </div>
              <button onClick={fetchRecords} className={`${btnCls} bg-indigo-50 text-indigo-700`}>查詢</button>
              <button onClick={() => setAddBookingOpen(true)}
                className="px-3 py-1.5 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 flex items-center gap-1">
                + 新增訂房
              </button>
              <button
                onClick={() => { setShowImportPanel(v => !v); setImportResult(null); }}
                className={`px-3 py-1.5 text-sm rounded-lg border flex items-center gap-1 transition-colors font-medium ${showImportPanel ? 'bg-violet-600 text-white border-violet-600' : 'bg-violet-50 text-violet-700 border-violet-300 hover:bg-violet-100'}`}>
                ↑ 雲掌櫃匯入
              </button>
              <div className="ml-auto flex items-end gap-2">
                {canLock && !editMode && (
                  <button onClick={lockAllFilled} disabled={locking}
                    title="鎖定本月全部已填付款記錄"
                    className="px-3 py-1.5 text-sm rounded-lg bg-slate-700 text-white hover:bg-slate-800 disabled:opacity-50 flex items-center gap-1">
                    🔒 全部鎖帳
                  </button>
                )}
                {!editMode ? (
                  <button onClick={enterEditMode}
                    className="px-4 py-1.5 text-sm rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 font-medium">
                    修改付款
                  </button>
                ) : (
                  <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-300 rounded-lg px-3 py-1.5">
                    <span className="text-xs text-emerald-700 font-medium">
                      Excel 模式{dirtyIds.size > 0 ? ` (已修改 ${dirtyIds.size} 筆)` : ''}
                    </span>
                    <button onClick={saveAllEdits} disabled={batchSaving}
                      className="px-3 py-1 text-xs rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
                      {batchSaving ? '儲存中…' : '儲存全部'}
                    </button>
                    <button onClick={cancelEditMode}
                      className="px-3 py-1 text-xs rounded-lg border border-gray-300 hover:bg-gray-50 text-gray-600">
                      取消
                    </button>
                  </div>
                )}
                <ExportButtons
                  data={records}
                  columns={BOOKING_EXPORT_COLS}
                  filename={`訂房明細_${filterMonth}`}
                  title={`訂房明細 ${filterMonth}`}
                />
                <button
                  onClick={() => doPrint(
                    `訂房明細 ${filterMonth}`,
                    BOOKING_EXPORT_COLS.map(c => c.header),
                    records.map(r => BOOKING_EXPORT_COLS.map(c => r[c.key] ?? ''))
                  )}
                  className={`${btnCls} text-gray-600`}
                >列印</button>
              </div>
            </div>

            {/* 雲掌櫃匯入面板 */}
            {showImportPanel && (
              <div className="mb-4 bg-white rounded-xl shadow-sm border border-violet-100 p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-gray-800 text-sm">上傳雲掌櫃匯出檔</h3>
                  <p className="text-xs text-gray-400">支援 .xlsx / .xls / .csv　欄位：A來源 B姓名 C房費 D消費 E房間 F入住 G離店 H狀態</p>
                </div>

                {/* 設定列 */}
                <div className="flex flex-wrap gap-3 items-end">
                  <div>
                    <label htmlFor="f-4" className="block text-xs text-gray-500 mb-1">匯入月份</label>
                    <input id="f-4" type="month" value={importMonth} onChange={e => setImportMonth(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label htmlFor="f-5" className="block text-xs text-gray-500 mb-1">館別</label>
                    <select id="f-5" value={importWarehouse} onChange={e => setImportWarehouse(e.target.value)} className={inputCls}>
                      {(warehouseList.length ? warehouseList : [importWarehouse]).map(w => <option key={w} value={w}>{w}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="span" className="block text-xs text-gray-500 mb-1">
                      選擇檔案
                      {importPreview && <span className="ml-2 text-violet-600 font-semibold">（解析到 {importPreview.totalRows} 筆）</span>}
                    </label>
                    <input id="span" type="file" accept=".xlsx,.xls,.csv"
                      onChange={e => handleFileSelect(e.target.files?.[0] || null)}
                      className="block text-sm text-gray-600 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border file:border-indigo-300 file:text-indigo-600 file:bg-indigo-50 hover:file:bg-indigo-100" />
                  </div>
                  <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                    <input type="checkbox" checked={importReplace} onChange={e => setImportReplace(e.target.checked)} className="rounded" />
                    取代同月舊資料
                  </label>
                  {isLocked ? (
                    <span className="text-xs text-red-500 px-2 py-1.5 bg-red-50 border border-red-200 rounded-lg">
                      {filterMonth} 已鎖帳，無法匯入
                    </span>
                  ) : (
                    <button onClick={handleImport} disabled={importing || !importFile}
                      className="px-4 py-1.5 text-sm rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 transition-colors font-medium">
                      {importing ? '匯入中…' : '開始匯入'}
                    </button>
                  )}
                  {importResult && (
                    <span className="text-xs text-green-700 px-2 py-1.5 bg-green-50 border border-green-200 rounded-lg">
                      ✓ {importResult.imported} 筆
                      {importResult.deleted > 0 && `，刪除 ${importResult.deleted} 筆`}
                      {importResult.skipped > 0 && `，略過重複 ${importResult.skipped} 筆`}
                      　{importResult.importMonth}／{importResult.warehouse}
                    </span>
                  )}
                </div>

                {/* 欄位對應預覽表 */}
                {importPreview && importPreview.rows.length > 0 && (
                  <div className="border border-violet-100 rounded-lg overflow-hidden">
                    <div className="bg-violet-50 px-3 py-2 flex items-center justify-between flex-wrap gap-2">
                      <span className="text-xs font-medium text-violet-700">
                        預覽（前 {importPreview.rows.length} 筆，共 {importPreview.totalRows} 筆）
                      </span>
                      {importPreview.detectedMonth !== importMonth && (
                        <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                          偵測到月份 {importPreview.detectedMonth}，已自動更新匯入月份
                        </span>
                      )}
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50 text-gray-500 sticky top-0 z-10">
                          <tr>
                            {['來源','姓名','房間','入住日','離店日','房費','狀態'].map(h => (
                              <th key={h} className="px-3 py-1.5 text-left font-medium">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {importPreview.rows.map((r, i) => (
                            <tr key={i} className="hover:bg-gray-50">
                              <td className="px-3 py-1.5">{r.source}</td>
                              <td className="px-3 py-1.5 font-medium">{r.guestName}</td>
                              <td className="px-3 py-1.5">{r.roomNo || '—'}</td>
                              <td className="px-3 py-1.5">{r.checkInDate}</td>
                              <td className="px-3 py-1.5">{r.checkOutDate}</td>
                              <td className="px-3 py-1.5 text-right">{(r.roomCharge || 0).toLocaleString('zh-TW')}</td>
                              <td className="px-3 py-1.5">{r.status}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* 覆蓋確認對話框 */}
                {importConfirm && (
                  <div className="border border-red-200 bg-red-50 rounded-lg px-4 py-3">
                    <p className="text-sm text-red-800 font-medium mb-3">
                      確定覆蓋？將刪除 <strong>{importWarehouse} / {importMonth}</strong> 現有 <strong>{importConfirm.existingCount} 筆</strong> 資料，再匯入 <strong>{importPreview?.totalRows ?? '？'} 筆</strong>新資料，此操作無法還原。
                    </p>
                    <div className="flex gap-2">
                      <button onClick={doImport} disabled={importing}
                        className="px-4 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">
                        {importing ? '匯入中…' : `確定刪除 ${importConfirm.existingCount} 筆並匯入`}
                      </button>
                      <button onClick={() => setImportConfirm(null)} className="px-4 py-1.5 text-sm border border-gray-300 bg-white rounded-lg hover:bg-gray-50">
                        取消
                      </button>
                    </div>
                  </div>
                )}

                {/* 本次 session 上傳歷史 */}
                {importHistory.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs text-gray-400 font-medium">本次工作階段上傳記錄</span>
                      <button type="button" onClick={() => {
                        setImportHistory([]);
                        try { localStorage.removeItem('bnb_import_history'); } catch {}
                      }} className="text-xs text-gray-300 hover:text-red-500">清除</button>
                    </div>
                    <div className="space-y-1">
                      {importHistory.map((h, i) => (
                        <div key={i} className="flex flex-wrap items-center gap-3 text-xs text-gray-500 bg-gray-50 px-3 py-1.5 rounded-lg">
                          <span className="text-gray-400">{h.at}</span>
                          <span className="font-medium text-gray-700">{h.importMonth} / {h.warehouse}</span>
                          <span className="text-green-600">匯入 {h.imported} 筆</span>
                          {h.deleted > 0 && <span className="text-red-500">刪除 {h.deleted} 筆</span>}
                          {h.skipped > 0 && <span className="text-amber-500">略過重複 {h.skipped} 筆</span>}
                          <span className="text-gray-300 ml-auto">{h.replace ? '覆蓋' : '追加'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 摘要卡 */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-4">
              {[
                { label: '筆數', val: recStats.rooms },
                { label: '房費+消費', val: NT(recStats.revenue) },
                { label: '訂金匯款', val: NT(recStats.deposit) },
                { label: '當天匯款', val: NT(recStats.transfer) },
                { label: '刷卡', val: NT(recStats.card) },
                { label: '現金', val: NT(recStats.cash) },
                { label: '住宿卷', val: NT(recStats.voucher) },
                { label: '刷卡手續費', val: NT(recStats.cardFee) },
              ].map(c => (
                <div key={c.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
                  <p className="text-xs text-gray-500">{c.label}</p>
                  <p className="font-bold text-gray-800 text-sm mt-0.5">{c.val}</p>
                </div>
              ))}
            </div>

            {/* 付款完成度橫幅 */}
            <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 bg-white rounded-xl shadow-sm border border-gray-100 text-sm">
              <span className="text-gray-500">本月共</span>
              <span className="font-semibold text-gray-800">{recStats.rooms} 筆</span>
              <span className="text-gray-300">|</span>
              <button
                onClick={() => setFilterPayment(filterPayment === 'filled' ? '' : 'filled')}
                className={`rounded px-2 py-0.5 transition-colors ${filterPayment === 'filled' ? 'bg-green-100 text-green-800 font-semibold' : 'text-green-600 hover:bg-green-50'}`}>
                已填付款 {recStats.rooms - recStats.unfilled}
              </button>
              <span className="text-gray-300">|</span>
              <button
                onClick={() => setFilterPayment(filterPayment === 'unfilled' ? '' : 'unfilled')}
                className={`rounded px-2 py-0.5 transition-colors ${filterPayment === 'unfilled' ? 'bg-amber-100 text-amber-800 font-semibold' : recStats.unfilled > 0 ? 'text-amber-600 hover:bg-amber-50' : 'text-gray-400 cursor-default'}`}
                disabled={recStats.unfilled === 0}>
                未填 {recStats.unfilled} 筆
              </button>
              {recStats.complimentary > 0 && (
                <>
                  <span className="text-gray-300">|</span>
                  <span className="text-rose-500">招待 {recStats.complimentary} 筆</span>
                </>
              )}
              <span className="text-gray-300">|</span>
              <span className="text-slate-500">已鎖帳 <span className={recStats.locked === recStats.rooms && recStats.rooms > 0 ? 'text-green-600 font-semibold' : 'text-slate-700'}>{recStats.locked}</span></span>
              {recStats.mismatch > 0 && (
                <>
                  <span className="text-gray-300">|</span>
                  <span className="text-red-500 font-medium">金額不符 {recStats.mismatch} 筆</span>
                </>
              )}
              {filterPayment && (
                <button onClick={() => setFilterPayment('')}
                  className="ml-auto text-xs text-gray-400 hover:text-gray-600 underline">
                  清除篩選
                </button>
              )}
            </div>

            {/* 房號分析面板（僅有房號資料時顯示） */}
            {roomStats.length > 1 && (
              <div className="mb-3 bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                <div className="text-xs font-semibold text-gray-500 mb-2">房號統計（本頁資料）</div>
                <div className="flex flex-wrap gap-2">
                  {roomStats.map(r => (
                    <div key={r.roomNo} className="text-xs bg-gray-50 rounded-lg px-3 py-1.5 border border-gray-100">
                      <span className="font-medium text-gray-700">{r.roomNo}</span>
                      <span className="ml-1.5 text-indigo-500">{r.bookings}筆</span>
                      <span className="ml-1 text-teal-500">{r.nights}晚</span>
                      <span className="ml-1 text-emerald-500">NT${r.revenue.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 批次行動列 */}
            {selectedIds.size > 0 && (
              <div className="mb-3 flex flex-wrap items-center gap-3 p-3 bg-amber-50 rounded-xl border border-amber-200">
                <span className="text-sm font-medium text-amber-800">已選 {selectedIds.size} 筆</span>
                {/* 狀態批次套用 */}
                {!editMode && (
                  <>
                    <select value={batchField} onChange={e => { setBatchField(e.target.value); setBatchValue(''); }}
                      className="border rounded-lg px-2 py-1 text-sm focus:ring-2 focus:ring-amber-400 outline-none">
                      <option value="status">狀態</option>
                    </select>
                    <select value={batchValue} onChange={e => setBatchValue(e.target.value)}
                      className="border rounded-lg px-2 py-1 text-sm focus:ring-2 focus:ring-amber-400 outline-none">
                      <option value="">選擇狀態</option>
                      <option value="已入住">已入住</option>
                      <option value="已退房">已退房</option>
                      <option value="已預訂">已預訂</option>
                    </select>
                    <button onClick={handleBatchApply} disabled={batchApplying}
                      className="px-3 py-1.5 text-sm rounded-lg bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50">
                      {batchApplying ? '套用中…' : '套用'}
                    </button>
                    <span className="text-gray-300 text-xs">|</span>
                  </>
                )}
                {/* 鎖帳 / 解鎖（需有鎖帳權限） */}
                {canLock && !editMode && (
                  <>
                    <button onClick={() => handleLockToggle('lock')} disabled={locking}
                      className="px-3 py-1.5 text-sm rounded-lg bg-slate-700 text-white hover:bg-slate-800 disabled:opacity-50 flex items-center gap-1">
                      <span>🔒</span> 鎖帳
                    </button>
                    <button onClick={() => handleLockToggle('unlock')} disabled={locking}
                      className="px-3 py-1.5 text-sm rounded-lg border border-slate-400 text-slate-600 hover:bg-slate-50 disabled:opacity-50 flex items-center gap-1">
                      <span>🔓</span> 解鎖
                    </button>
                  </>
                )}
                <button onClick={() => setSelectedIds(new Set())}
                  className="text-xs text-gray-500 hover:underline ml-auto">清除選取</button>
              </div>
            )}

            {/* Excel 模式提示 */}
            {editMode && (
              <div className="mb-3 p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-700 flex items-center gap-2">
                <span className="font-medium">Excel 模式：</span>
                Tab 跳下一格 ／ Enter 跳下一行同欄 ／ Esc 取消編輯模式。訂金欄位含後五碼輸入。
                <span className="ml-auto text-emerald-500">🔒 灰色鎖定列不可編輯</span>
              </div>
            )}

            {/* 表格 */}
            {recLoading ? (
              <div className="text-center py-16 text-gray-400">載入中…</div>
            ) : (() => {
              // 可編輯的列（未刪除、未鎖定）供 Tab 跳格使用
              const editableRecords = records.filter(r => r.status !== '已刪除' && !r.paymentLocked);
              // 付款篩選（client-side）
              const visibleRecords  = filterPayment
                ? records.filter(r => filterPayment === 'filled' ? r.paymentFilled : !r.paymentFilled)
                : records;
              // 逾期未填判斷基準日
              const today = todayStr();

              return (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 tbl-wrap">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10">
                    <tr className={`text-xs ${editMode ? 'bg-emerald-50 text-emerald-800' : 'bg-indigo-50 text-indigo-800'}`}>
                      <th className="px-3 py-2">
                        <input type="checkbox"
                          checked={selectedIds.size > 0 && selectedIds.size === records.filter(r => r.status !== '已刪除').length}
                          onChange={toggleSelectAll}
                          className="rounded cursor-pointer" />
                      </th>
                      <th className="px-3 py-2 text-left font-medium whitespace-nowrap">館別</th>
                      <th className="px-3 py-2 text-left font-medium whitespace-nowrap">來源</th>
                      <th className="px-3 py-2 text-left font-medium whitespace-nowrap">姓名</th>
                      <th className="px-3 py-2 text-left font-medium whitespace-nowrap">房間</th>
                      <th className="px-3 py-2 text-left font-medium whitespace-nowrap">入住</th>
                      <th className="px-3 py-2 text-left font-medium whitespace-nowrap">退房</th>
                      <th className="px-3 py-2 text-left font-medium whitespace-nowrap">房費</th>
                      <th className="px-3 py-2 text-left font-medium whitespace-nowrap">消費</th>
                      <th className="px-3 py-2 text-left font-medium whitespace-nowrap">
                        訂金{editMode && <span className="block text-[10px] font-normal opacity-60">後五碼</span>}
                      </th>
                      <th className="px-3 py-2 text-left font-medium whitespace-nowrap">
                        當天匯款{editMode && <span className="block text-[10px] font-normal opacity-60">後五碼</span>}
                      </th>
                      <th className="px-3 py-2 text-left font-medium whitespace-nowrap">刷卡</th>
                      <th className="px-3 py-2 text-left font-medium whitespace-nowrap">手續費</th>
                      <th className="px-3 py-2 text-left font-medium whitespace-nowrap">現金</th>
                      <th className="px-3 py-2 text-left font-medium whitespace-nowrap">住宿卷</th>
                      <th className="px-3 py-2 text-left font-medium whitespace-nowrap">金流</th>
                      <th className="px-3 py-2 text-left font-medium whitespace-nowrap">狀態</th>
                      <th className="px-3 py-2 text-left font-medium whitespace-nowrap">備註</th>
                      {!editMode && <th className="px-3 py-2 text-center font-medium whitespace-nowrap">操作</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {visibleRecords.length === 0 && (
                      <tr><td colSpan={19} className="text-center py-10 text-gray-400">
                        {filterPayment ? `無${filterPayment === 'filled' ? '已填付款' : '未填付款'}記錄` : '無資料'}
                      </td></tr>
                    )}
                    {visibleRecords.map(r => {
                      const isSelected      = selectedIds.has(r.id);
                      const isDeleted       = r.status === '已刪除';
                      const isRowLocked     = !!r.paymentLocked;
                      const isLocked        = isRowLocked || monthLocked;
                      const inExcelMode     = editMode && !isDeleted && !isLocked;
                      const isDirty         = dirtyIds.has(r.id);
                      const hasRowError     = rowErrors[r.id];
                      const isOverdueUnpaid = !isDeleted && r.status === '已退房' && !r.paymentFilled && !r.isComplimentary && r.checkOutDate && r.checkOutDate < today;
                      const payTotal        = Number(r.payDeposit) + Number(r.payTransfer) + Number(r.payCard) + Number(r.payCash) + Number(r.payVoucher);
                      const chargeTotal     = Number(r.roomCharge) + Number(r.otherCharge);
                      const paymentMismatch = !isDeleted && r.paymentFilled && !r.isComplimentary && Math.abs(payTotal - chargeTotal) > 0.01;

                      // ── 一般模式：點擊式 inline edit ────────────────
                      const editCell = (field, colorCls) => {
                        const isEditing = !editMode && inlineEdit?.id === r.id && inlineEdit?.field === field;
                        const val = Number(r[field]);
                        if (isEditing) return (
                          <input autoFocus type="number" min="0" value={inlineValue}
                            onChange={e => setInlineValue(e.target.value)}
                            onBlur={() => handleInlineSave(r.id, field, inlineValue)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleInlineSave(r.id, field, inlineValue);
                              if (e.key === 'Escape') setInlineEdit(null);
                            }}
                            className="w-20 border border-indigo-400 rounded px-1 py-0.5 text-xs text-right outline-none ring-1 ring-indigo-400" />
                        );
                        return (
                          <span
                            onClick={() => {
                              if (isLocked) {
                                showToast(monthLocked ? `${filterMonth} 已鎖帳，如需修改請先解鎖該月` : '此筆記錄已鎖帳，請點擊右側「解鎖」按鈕', 'error');
                                return;
                              }
                              if (!isDeleted && !editMode) { setInlineEdit({ id: r.id, field }); setInlineValue(val || ''); }
                            }}
                            className={`${!isLocked && !editMode ? 'cursor-pointer hover:underline hover:text-indigo-600' : 'cursor-not-allowed'} ${colorCls} ${val > 0 ? '' : 'text-gray-300'}`}
                            title={isLocked ? (monthLocked ? `${filterMonth} 已鎖帳` : '此筆已鎖帳') : editMode ? '' : '點擊編輯'}>
                            {val > 0 ? Math.round(val).toLocaleString() : '—'}
                          </span>
                        );
                      };

                      // ── Excel 模式：數字 input ───────────────────────
                      const excelInput = (field, colorBorder) => {
                        const val = editMap[r.id]?.[field] ?? '';
                        return (
                          <input
                            id={`pc-${r.id}-${field}`}
                            type="number" min="0"
                            value={val}
                            onChange={e => updateCell(r.id, field, e.target.value)}
                            onFocus={e => e.target.select()}
                            onKeyDown={e => handlePayKeyDown(e, r.id, field, editableRecords)}
                            className={`w-20 border rounded px-1.5 py-0.5 text-xs text-right outline-none focus:ring-1 ${colorBorder} ${isDirty ? 'bg-yellow-50' : 'bg-white'}`}
                          />
                        );
                      };

                      const excelTextInput = (field) => {
                        const val = editMap[r.id]?.[field] ?? '';
                        return (
                          <input
                            id={`pc-${r.id}-${field}`}
                            type="text" maxLength={5}
                            value={val}
                            onChange={e => updateCell(r.id, field, e.target.value)}
                            onFocus={e => e.target.select()}
                            onKeyDown={e => handlePayKeyDown(e, r.id, field, editableRecords)}
                            placeholder="後五碼"
                            className={`w-16 border rounded px-1.5 py-0.5 text-xs outline-none focus:ring-1 focus:ring-blue-300 border-blue-200 ${isDirty ? 'bg-yellow-50' : 'bg-white'} text-blue-500 font-mono`}
                          />
                        );
                      };

                      // ── 備註 inline edit ─────────────────────────
                      const noteCell = () => {
                        const isEditing = !editMode && inlineEdit?.id === r.id && inlineEdit?.field === 'note';
                        if (isEditing) return (
                          <input autoFocus type="text" value={inlineValue}
                            onChange={e => setInlineValue(e.target.value)}
                            onBlur={() => handleInlineSave(r.id, 'note', inlineValue)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleInlineSave(r.id, 'note', inlineValue);
                              if (e.key === 'Escape') setInlineEdit(null);
                            }}
                            className="w-28 border border-indigo-400 rounded px-1 py-0.5 text-xs outline-none ring-1 ring-indigo-400"
                          />
                        );
                        return (
                          <span
                            onClick={() => { if (!isDeleted && !editMode) { setInlineEdit({ id: r.id, field: 'note' }); setInlineValue(r.note || ''); } }}
                            className={`block max-w-[112px] truncate text-xs ${r.note ? 'text-gray-500 cursor-pointer hover:text-indigo-600' : 'text-gray-200 cursor-pointer'}`}
                            title={r.note || '點擊新增備註'}>
                            {r.note || '—'}
                          </span>
                        );
                      };

                      const isPaymentComplete = !isDeleted && !isLocked && r.paymentFilled && !paymentMismatch;

                      return (
                        <tr key={r.id}
                          title={hasRowError || undefined}
                          className={`
                          ${isSelected ? 'bg-amber-50' : isLocked ? 'bg-slate-50' : paymentMismatch ? 'bg-orange-50' : isOverdueUnpaid ? 'bg-red-50' : isPaymentComplete ? 'bg-gray-100 text-gray-400' : 'hover:bg-gray-50'}
                          ${isDeleted ? 'opacity-40' : ''}
                          ${hasRowError ? 'ring-2 ring-inset ring-red-400' : editMode && isDirty ? 'ring-1 ring-inset ring-emerald-200' : ''}
                        `}>
                          <td className="px-3 py-2">
                            {!isDeleted && (
                              <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(r.id)}
                                className="rounded cursor-pointer" />
                            )}
                          </td>
                          <td className="px-3 py-2 text-gray-400 text-xs whitespace-nowrap">{r.warehouse}</td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <span className={`text-xs px-1.5 py-0.5 rounded ${SOURCE_COLORS[r.source] || SOURCE_COLORS['其他']}`}>{r.source}</span>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap max-w-[140px]">
                            <span className="truncate">{r.guestName}</span>
                            {r.isComplimentary && <span className="ml-1 text-[10px] bg-rose-100 text-rose-600 px-1 py-0.5 rounded">招待</span>}
                          </td>
                          <td className="px-3 py-2 text-gray-500 text-xs">{r.roomNo || '—'}</td>
                          <td className="px-3 py-2 text-gray-600 text-xs whitespace-nowrap">
                            {r.checkInDate}
                            {r.checkOutDate && r.checkOutDate.substring(0, 7) !== r.importMonth && (
                              <span className="ml-1 text-[10px] px-1 py-0.5 rounded bg-orange-100 text-orange-600 font-medium"
                                title={`退房日 ${r.checkOutDate} 與入住月 ${r.importMonth} 不同月份；此訂單收入整筆計入入住月`}>跨月</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-gray-600 text-xs whitespace-nowrap">{r.checkOutDate}</td>
                          <td className={`px-3 py-2 text-right ${paymentMismatch ? 'text-red-600' : ''}`}>
                            {Math.round(Number(r.roomCharge)).toLocaleString()}
                            {paymentMismatch && (
                              <div className="text-[10px] text-red-500 whitespace-nowrap" title={`收款合計 ${Math.round(payTotal).toLocaleString()} ≠ 房費+消費 ${Math.round(chargeTotal).toLocaleString()}`}>
                                差 {(payTotal - chargeTotal) > 0 ? '+' : ''}{Math.round(payTotal - chargeTotal).toLocaleString()}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right text-gray-500">{Number(r.otherCharge) > 0 ? Math.round(Number(r.otherCharge)).toLocaleString() : '—'}</td>

                          {/* 訂金 + 後五碼（點擊開啟付款 Modal 以填寫日期+後五碼） */}
                          <td className="px-3 py-1.5 text-right">
                            {inExcelMode ? (
                              <div className="flex flex-col gap-0.5 items-end">
                                {excelInput('payDeposit', 'border-blue-300 focus:ring-blue-300')}
                                <input
                                  id={`pc-${r.id}-depositDate`}
                                  type="date"
                                  value={editMap[r.id]?.depositDate ?? (r.depositDate || '')}
                                  onChange={e => updateCell(r.id, 'depositDate', e.target.value)}
                                  onKeyDown={e => handlePayKeyDown(e, r.id, 'depositDate', editableRecords)}
                                  className={`w-32 border rounded px-1.5 py-0.5 text-xs outline-none focus:ring-1 border-blue-200 focus:ring-blue-300 ${(editMap[r.id]?.depositDate !== undefined) ? 'bg-yellow-50' : 'bg-white'} text-blue-500`}
                                />
                                {excelTextInput('depositLast5')}
                              </div>
                            ) : (() => {
                              const depVal = Math.round(Number(r.payDeposit));
                              return (
                                <div>
                                  <span
                                    onClick={() => {
                                      if (isLocked) { showToast(monthLocked ? `${filterMonth} 已鎖帳，如需修改請先解鎖該月` : '此筆記錄已鎖帳，請點擊右側「解鎖」按鈕', 'error'); return; }
                                      if (!isDeleted && !editMode) setEditRecord(r);
                                    }}
                                    className={`${!isLocked && !editMode ? 'cursor-pointer hover:underline hover:text-indigo-600' : 'cursor-not-allowed'} text-blue-600 ${depVal > 0 ? '' : 'text-gray-300'}`}
                                    title={isLocked ? (monthLocked ? `${filterMonth} 已鎖帳` : '此筆已鎖帳') : editMode ? '' : '點擊開啟付款明細'}>
                                    {depVal > 0 ? depVal.toLocaleString() : '—'}
                                  </span>
                                  {r.depositLast5 && <div className="text-[10px] text-blue-300 font-mono">{r.depositLast5}</div>}
                                  {r.depositDate && <div className="text-[10px] text-blue-300">{r.depositDate}</div>}
                                </div>
                              );
                            })()}
                          </td>

                          {/* 當天匯款 */}
                          <td className="px-3 py-1.5 text-right">
                            {inExcelMode ? (
                              <div className="flex flex-col gap-0.5 items-end">
                                {excelInput('payTransfer', 'border-teal-300 focus:ring-teal-300')}
                                <input
                                  id={`pc-${r.id}-transferDate`}
                                  type="date"
                                  value={editMap[r.id]?.transferDate ?? (r.transferDate || '')}
                                  onChange={e => updateCell(r.id, 'transferDate', e.target.value)}
                                  onKeyDown={e => handlePayKeyDown(e, r.id, 'transferDate', editableRecords)}
                                  className={`w-32 border rounded px-1.5 py-0.5 text-xs outline-none focus:ring-1 border-teal-200 focus:ring-teal-300 ${(editMap[r.id]?.transferDate !== undefined) ? 'bg-yellow-50' : 'bg-white'} text-teal-500`}
                                />
                                <input
                                  id={`pc-${r.id}-transferLast5`}
                                  type="text" maxLength={5}
                                  value={editMap[r.id]?.transferLast5 ?? (r.transferLast5 || '')}
                                  onChange={e => updateCell(r.id, 'transferLast5', e.target.value)}
                                  onKeyDown={e => handlePayKeyDown(e, r.id, 'transferLast5', editableRecords)}
                                  placeholder="後五碼"
                                  className={`w-16 border rounded px-1.5 py-0.5 text-xs outline-none focus:ring-1 focus:ring-teal-300 border-teal-200 ${isDirty ? 'bg-yellow-50' : 'bg-white'} text-teal-500 font-mono`}
                                />
                              </div>
                            ) : (() => {
                              const trnVal = Math.round(Number(r.payTransfer));
                              return (
                                <div>
                                  <span
                                    onClick={() => {
                                      if (isLocked) { showToast(monthLocked ? `${filterMonth} 已鎖帳，如需修改請先解鎖該月` : '此筆記錄已鎖帳，請點擊右側「解鎖」按鈕', 'error'); return; }
                                      if (!isDeleted && !editMode) setEditRecord(r);
                                    }}
                                    className={`${!isLocked && !editMode ? 'cursor-pointer hover:underline hover:text-indigo-600' : 'cursor-not-allowed'} text-teal-600 ${trnVal > 0 ? '' : 'text-gray-300'}`}
                                    title={isLocked ? (monthLocked ? `${filterMonth} 已鎖帳` : '此筆已鎖帳') : editMode ? '' : '點擊開啟付款明細'}>
                                    {trnVal > 0 ? trnVal.toLocaleString() : '—'}
                                  </span>
                                  {r.transferLast5 && <div className="text-[10px] text-teal-300 font-mono">{r.transferLast5}</div>}
                                  {r.transferDate && <div className="text-[10px] text-teal-300">{r.transferDate}</div>}
                                </div>
                              );
                            })()}
                          </td>

                          {/* 刷卡 */}
                          <td className="px-3 py-1.5 text-right">
                            {inExcelMode ? excelInput('payCard', 'border-purple-300 focus:ring-purple-300') : editCell('payCard', 'text-purple-600')}
                          </td>

                          {/* 手續費（唯讀） */}
                          <td className="px-3 py-2 text-right text-red-400 text-xs">
                            {Number(r.cardFee) > 0 ? Math.round(Number(r.cardFee)).toLocaleString() : '—'}
                          </td>

                          {/* 現金 */}
                          <td className="px-3 py-1.5 text-right">
                            {inExcelMode ? (
                              <div className="flex flex-col gap-0.5 items-end">
                                {excelInput('payCash', 'border-green-300 focus:ring-green-300')}
                                <label className="flex items-center gap-1 text-[10px] cursor-pointer select-none"
                                  title="勾選表示此現金由老闆直接收取">
                                  <input type="checkbox"
                                    checked={(editMap[r.id]?.cashDestination ?? r.cashDestination) === '老闆收取'}
                                    onChange={e => updateCell(r.id, 'cashDestination', e.target.checked ? '老闆收取' : '')}
                                    className="w-3 h-3 accent-orange-500 cursor-pointer" />
                                  <span className={(editMap[r.id]?.cashDestination ?? r.cashDestination) === '老闆收取' ? 'text-orange-600 font-medium' : 'text-gray-400'}>老闆收現</span>
                                </label>
                              </div>
                            ) : editCell('payCash', 'text-green-600')}
                          </td>

                          {/* 住宿卷 */}
                          <td className="px-3 py-1.5 text-right">
                            {inExcelMode ? excelInput('payVoucher', 'border-amber-300 focus:ring-amber-300') : editCell('payVoucher', 'text-amber-600')}
                          </td>

                          {/* 金流狀態 */}
                          <td className="px-3 py-1.5">
                            <div className="flex flex-col gap-0.5 text-[10px] leading-tight">
                              {/* 訂金 */}
                              {r.depositCashTxId ? (
                                <span className={`px-1 py-0.5 rounded ${r.depositMatched ? 'bg-blue-100 text-blue-700' : 'bg-blue-50 text-blue-400'}`}
                                  title={r.depositMatched ? '訂金已對帳' : '訂金已記帳，待對帳'}>
                                  匯{r.depositMatched ? '✓' : '…'}
                                </span>
                              ) : Number(r.payDeposit) > 0 ? (
                                <span className="px-1 py-0.5 rounded bg-gray-50 text-gray-300" title="訂金尚未填入匯款日期">匯?</span>
                              ) : null}
                              {/* 當天匯款 */}
                              {r.transferCashTxId ? (
                                <span className={`px-1 py-0.5 rounded ${r.transferMatched ? 'bg-teal-100 text-teal-700' : 'bg-teal-50 text-teal-400'}`}
                                  title={r.transferMatched ? '當天匯款已對帳' : '當天匯款已記帳，待對帳'}>
                                  轉{r.transferMatched ? '✓' : '…'}
                                </span>
                              ) : Number(r.payTransfer) > 0 ? (
                                <span className="px-1 py-0.5 rounded bg-gray-50 text-gray-300" title="當天匯款尚未填入匯款日期">轉?</span>
                              ) : null}
                              {/* 刷卡 */}
                              {r.cardCashTxId ? (
                                <span className={`px-1 py-0.5 rounded ${r.cardMatched ? 'bg-purple-100 text-purple-700' : 'bg-purple-50 text-purple-400'}`}
                                  title={r.cardMatched ? `刷卡已對帳 (${r.cardSettlementDate || ''})` : `刷卡已記帳，入帳日 ${r.cardSettlementDate || '未填'}`}>
                                  卡{r.cardMatched ? '✓' : r.cardSettlementDate ? `${r.cardSettlementDate.slice(5)}` : '…'}
                                </span>
                              ) : Number(r.payCard) > 0 ? (
                                <span className="px-1 py-0.5 rounded bg-gray-50 text-gray-300" title="刷卡尚未填入入帳日">卡?</span>
                              ) : null}
                              {/* 現金 */}
                              {r.cashCashTxId ? (
                                <span className={`px-1 py-0.5 rounded ${r.cashMatched ? 'bg-green-100 text-green-700' : 'bg-green-50 text-green-400'}`}
                                  title={r.cashMatched ? '現金存帳已對帳' : '現金存帳已記帳，待對帳'}>
                                  存{r.cashMatched ? '✓' : '…'}
                                </span>
                              ) : r.cashDestination === '老闆收取' && Number(r.payCash) > 0 ? (
                                <span className="px-1 py-0.5 rounded bg-orange-50 text-orange-500" title="老闆收取">老闆</span>
                              ) : Number(r.payCash) > 0 ? (
                                <span className="px-1 py-0.5 rounded bg-gray-50 text-gray-300" title="現金尚未設定去向">現?</span>
                              ) : null}
                            </div>
                          </td>

                          {/* 狀態 + 鎖帳標示 */}
                          <td className="px-3 py-2">
                            <span className={`text-xs px-1.5 py-0.5 rounded ${getStatusColor(r.status)}`}>{r.status || '—'}</span>
                            {isRowLocked && <span className="ml-1 text-[10px] px-1 py-0.5 rounded bg-red-100 text-red-600 font-medium" title={r.paymentLockedBy ? `鎖帳人：${r.paymentLockedBy}` : '此筆已鎖帳'}>已鎖帳</span>}
                            {!isRowLocked && monthLocked && <span className="ml-1 text-[10px] px-1 py-0.5 rounded bg-amber-100 text-amber-600 font-medium" title={`${filterMonth} 整月已鎖帳`}>月鎖</span>}
                            {!r.paymentFilled && !isDeleted && !isLocked && (
                              <span className="ml-1 text-[10px] text-amber-500">未填</span>
                            )}
                            {paymentMismatch && (
                              <span className="ml-1 text-[10px] text-red-500" title={`收款 ${Math.round(payTotal).toLocaleString()} ≠ 費用 ${Math.round(chargeTotal).toLocaleString()}`}>金額不符</span>
                            )}
                          </td>

                          {/* 備註（點擊 inline 編輯） */}
                          <td className="px-3 py-2">{noteCell()}</td>

                          {/* 操作欄（非 Excel 模式才顯示） */}
                          {!editMode && (
                            <td className="px-3 py-2 whitespace-nowrap">
                              {isDeleted ? (
                                <button onClick={() => handleRestore(r.id, r.guestName)}
                                  title="還原此筆訂房記錄"
                                  className="text-xs px-2 py-1 rounded border border-green-300 text-green-600 hover:bg-green-50">
                                  還原
                                </button>
                              ) : isLocked ? (
                                <button onClick={() => handleUnlockRow(r.id, r.guestName)}
                                  title="解除此筆付款鎖定"
                                  className="text-xs px-2 py-1 rounded border border-amber-300 text-amber-600 hover:bg-amber-50">
                                  🔓 解鎖
                                </button>
                              ) : (
                                <>
                                  <button onClick={() => setEditBooking(r)}
                                    title="編輯訂房資料"
                                    className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 mr-1">
                                    編輯
                                  </button>
                                  <button onClick={() => setEditRecord(r)}
                                    title="編輯付款明細"
                                    className="text-xs px-2 py-1 rounded border border-indigo-300 text-indigo-600 hover:bg-indigo-50 mr-1">
                                    付款
                                  </button>
                                  <button onClick={() => handleDelete(r.id, r.guestName)}
                                    title="刪除此筆訂房（可還原）"
                                    className="text-xs px-2 py-1 rounded border border-red-200 text-red-400 hover:bg-red-50">
                                    刪除
                                  </button>
                                </>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              );
            })()}
            {/* 分頁控制 */}
            {recTotal > REC_PAGE_SIZE && (
              <div className="flex items-center justify-between mt-3 px-1">
                <span className="text-xs text-gray-400">
                  顯示第 {(recPage - 1) * REC_PAGE_SIZE + 1}–{Math.min(recPage * REC_PAGE_SIZE, recTotal)} 筆，共 {recTotal} 筆
                </span>
                <div className="flex gap-1">
                  <button onClick={() => fetchRecords(recPage - 1)} disabled={recPage <= 1}
                    className="px-2 py-1 text-xs rounded border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40">
                    ← 上一頁
                  </button>
                  <button onClick={() => fetchRecords(recPage + 1)} disabled={recPage * REC_PAGE_SIZE >= recTotal}
                    className="px-2 py-1 text-xs rounded border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40">
                    下一頁 →
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══ Tab: 每日收入 ══ */}
        {activeTab === 'analytics' && analyticsSub === 'dailyRev' && (
          <div>
            {/* 搜尋列 */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4 flex flex-wrap gap-3 items-end">
              <div>
                <label htmlFor="f-6" className="block text-xs text-gray-500 mb-1">月份</label>
                <input id="f-6" type="month" value={drMonth} onChange={e => setDrMonth(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label htmlFor="f-7" className="block text-xs text-gray-500 mb-1">館別</label>
                <select id="f-7" value={drWarehouse} onChange={e => setDrWarehouse(e.target.value)} className={inputCls}>
                  {(warehouseList.length ? warehouseList : [drWarehouse]).map(w => <option key={w} value={w}>{w}</option>)}
                </select>
                <WhQuickBtns list={warehouseList} value={drWarehouse} onChange={setDrWarehouse} />
              </div>
              <button onClick={fetchDailyRevenue} disabled={drLoading}
                className={`${btnCls} bg-indigo-50 text-indigo-700 disabled:opacity-40`}>
                {drLoading ? '查詢中…' : '查詢'}
              </button>
              {drData && (
                <>
                  <div className="ml-auto flex gap-2">
                    <ExportButtons
                      data={(drData?.days || []).map(d => ({
                        ...d,
                        revenue: d.roomCharge + d.otherCharge,
                        netRevenue: d.roomCharge + d.otherCharge - d.cardFee,
                        dateLabel: `${d.day}日`,
                      }))}
                      columns={[
                        { header: '日期',     key: 'dateLabel' },
                        { header: '筆數',     key: 'count',       format: 'number' },
                        { header: '房費',     key: 'roomCharge',  format: 'number' },
                        { header: '消費',     key: 'otherCharge', format: 'number' },
                        { header: '營收合計', key: 'revenue',     format: 'number' },
                        { header: '訂金',     key: 'payDeposit',  format: 'number' },
                        { header: '當天匯款', key: 'payTransfer', format: 'number' },
                        { header: '刷卡',     key: 'payCard',     format: 'number' },
                        { header: '現金',     key: 'payCash',     format: 'number' },
                        { header: '住宿卷',   key: 'payVoucher',  format: 'number' },
                        { header: '手續費',   key: 'cardFee',     format: 'number' },
                      ]}
                      filename={`每日收入_${drMonth}`}
                      title={`每日收入 ${drMonth}（${drWarehouse}）`}
                    />
                    <button
                      onClick={() => {
                        const cols = ['日期','筆數','房費','消費','營收','訂金','當天匯款','刷卡','現金','住宿卷','手續費'];
                        const rows = (drData?.days || []).filter(d => d.count > 0).map(d => [
                          `${d.day}日`,
                          d.count,
                          d.roomCharge.toLocaleString(),
                          d.otherCharge > 0 ? d.otherCharge.toLocaleString() : '',
                          (d.roomCharge + d.otherCharge).toLocaleString(),
                          d.payDeposit  > 0 ? d.payDeposit.toLocaleString()  : '',
                          d.payTransfer > 0 ? d.payTransfer.toLocaleString() : '',
                          d.payCard     > 0 ? d.payCard.toLocaleString()     : '',
                          d.payCash     > 0 ? d.payCash.toLocaleString()     : '',
                          d.payVoucher  > 0 ? d.payVoucher.toLocaleString()  : '',
                          d.cardFee     > 0 ? d.cardFee.toLocaleString()     : '',
                        ]);
                        const t = drData.totals;
                        rows.push(['合計', t.count,
                          t.roomCharge.toLocaleString(), t.otherCharge.toLocaleString(),
                          (t.roomCharge + t.otherCharge).toLocaleString(),
                          t.payDeposit.toLocaleString(), t.payTransfer.toLocaleString(), t.payCard.toLocaleString(),
                          t.payCash.toLocaleString(), t.payVoucher.toLocaleString(),
                          t.cardFee.toLocaleString(),
                        ]);
                        doPrint(`每日收入 ${drMonth}（${drWarehouse}）`, cols, rows);
                      }}
                      className={`${btnCls} text-gray-600`}
                    >列印</button>
                  </div>
                </>
              )}
            </div>

            {/* 摘要卡 */}
            {drData && (
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 mb-4">
                {[
                  { label: '營業天數', val: drData.days.filter(d => d.count > 0).length, color: '' },
                  { label: '總筆數',   val: drData.totals.count, color: '' },
                  { label: '房費',     val: NT(drData.totals.roomCharge), color: 'text-indigo-700' },
                  { label: '消費',     val: NT(drData.totals.otherCharge), color: 'text-gray-600' },
                  { label: '訂金',     val: NT(drData.totals.payDeposit),  color: 'text-blue-600' },
                  { label: '當天匯款', val: NT(drData.totals.payTransfer), color: 'text-teal-600' },
                  { label: '刷卡',     val: NT(drData.totals.payCard),     color: 'text-purple-600' },
                  { label: '現金',     val: NT(drData.totals.payCash),     color: 'text-green-600' },
                  { label: '手續費',   val: NT(drData.totals.cardFee),     color: 'text-red-400' },
                ].map(c => (
                  <div key={c.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
                    <p className="text-xs text-gray-500">{c.label}</p>
                    <p className={`font-bold text-sm mt-0.5 ${c.color}`}>{c.val}</p>
                  </div>
                ))}
              </div>
            )}

            {/* 每日收入表格 */}
            {drLoading ? (
              <div className="text-center py-16 text-gray-400">載入中…</div>
            ) : !drData ? (
              <div className="text-center py-16 text-gray-400">請選擇月份後按「查詢」</div>
            ) : (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 tbl-wrap">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-indigo-50">
                    <tr className="bg-indigo-50 text-indigo-800 text-xs">
                      {['日期','筆數','房費','消費','營收合計','訂金','當天匯款','刷卡','現金','住宿卷','手續費',''].map(h => (
                        <th key={h} className="px-3 py-2.5 text-right first:text-left font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {drData.days.map(d => {
                      const rev = d.roomCharge + d.otherCharge;
                      const hasData = d.count > 0;
                      const isExpanded = drExpandDay === d.day;
                      return (
                        <React.Fragment key={d.day}>
                          <tr className={`${hasData ? 'hover:bg-gray-50 cursor-pointer' : 'text-gray-300'} transition-colors`}
                            onClick={() => hasData && setDrExpandDay(isExpanded ? null : d.day)}>
                            <td className="px-3 py-2 font-medium text-gray-700">
                              <span className={hasData ? '' : 'text-gray-300'}>{d.day}日</span>
                              {hasData && (
                                <span className="ml-1.5 text-[10px] text-gray-400">{isExpanded ? '▼' : '▶'}</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right">{hasData ? d.count : '—'}</td>
                            <td className="px-3 py-2 text-right text-indigo-700">{hasData ? d.roomCharge.toLocaleString() : '—'}</td>
                            <td className="px-3 py-2 text-right text-gray-500">{d.otherCharge > 0 ? d.otherCharge.toLocaleString() : '—'}</td>
                            <td className="px-3 py-2 text-right font-semibold">{hasData ? rev.toLocaleString() : '—'}</td>
                            <td className="px-3 py-2 text-right text-blue-600">{d.payDeposit > 0 ? d.payDeposit.toLocaleString() : '—'}</td>
                            <td className="px-3 py-2 text-right text-teal-600">{d.payTransfer > 0 ? d.payTransfer.toLocaleString() : '—'}</td>
                            <td className="px-3 py-2 text-right text-purple-600">{d.payCard > 0 ? d.payCard.toLocaleString() : '—'}</td>
                            <td className="px-3 py-2 text-right text-green-600">{d.payCash > 0 ? d.payCash.toLocaleString() : '—'}</td>
                            <td className="px-3 py-2 text-right text-amber-600">{d.payVoucher > 0 ? d.payVoucher.toLocaleString() : '—'}</td>
                            <td className="px-3 py-2 text-right text-red-400">{d.cardFee > 0 ? `(${d.cardFee.toLocaleString()})` : '—'}</td>
                            <td className="px-3 py-2 w-4"></td>
                          </tr>
                          {isExpanded && d.bookings.map((b, i) => (
                            <tr key={`${d.day}-${i}`} className="bg-gray-50/70">
                              <td className="px-3 py-1.5 pl-8 text-xs text-gray-400" colSpan={2}>
                                <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] mr-1.5 ${
                                  b.source === 'Booking' ? 'bg-indigo-100 text-indigo-600' : 'bg-amber-100 text-amber-600'
                                }`}>{b.source}</span>
                                {b.guestName}
                              </td>
                              <td className="px-3 py-1.5 text-right text-xs text-gray-500">{b.roomCharge.toLocaleString()}</td>
                              <td className="px-3 py-1.5 text-xs text-gray-400">{b.roomNo || ''}</td>
                              <td colSpan={8}></td>
                            </tr>
                          ))}
                        </React.Fragment>
                      );
                    })}
                    {/* 合計列 */}
                    {(() => {
                      const t = drData.totals;
                      return (
                        <tr className="bg-indigo-50 font-bold text-indigo-800">
                          <td className="px-3 py-2.5">合計</td>
                          <td className="px-3 py-2.5 text-right">{t.count}</td>
                          <td className="px-3 py-2.5 text-right">{Math.round(t.roomCharge).toLocaleString()}</td>
                          <td className="px-3 py-2.5 text-right">{Math.round(t.otherCharge).toLocaleString()}</td>
                          <td className="px-3 py-2.5 text-right">{Math.round(t.roomCharge + t.otherCharge).toLocaleString()}</td>
                          <td className="px-3 py-2.5 text-right">{Math.round(t.payDeposit).toLocaleString()}</td>
                          <td className="px-3 py-2.5 text-right">{Math.round(t.payTransfer).toLocaleString()}</td>
                          <td className="px-3 py-2.5 text-right">{Math.round(t.payCard).toLocaleString()}</td>
                          <td className="px-3 py-2.5 text-right">{Math.round(t.payCash).toLocaleString()}</td>
                          <td className="px-3 py-2.5 text-right">{Math.round(t.payVoucher).toLocaleString()}</td>
                          <td className="px-3 py-2.5 text-right">({Math.round(t.cardFee).toLocaleString()})</td>
                          <td className="px-3 py-2.5"></td>
                        </tr>
                      );
                    })()}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ══ Tab: 月收入總表 ══ */}
        {activeTab === 'analytics' && analyticsSub === 'monthly' && (
          <div>
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <label htmlFor="f-8" className="text-sm text-gray-600">年份</label>
              <select id="f-8" value={summaryYear} onChange={e => setSummaryYear(e.target.value)} className={inputCls}>
                {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <label htmlFor="f-28" className="text-sm text-gray-600">館別</label>
              <select id="f-28" value={summaryWarehouse} onChange={e => setSummaryWarehouse(e.target.value)} className={inputCls}>
                <option value="">全部</option>
                {warehouseList.map(w => <option key={w} value={w}>{w}</option>)}
              </select>
              <WhQuickBtns list={warehouseList} value={summaryWarehouse} onChange={setSummaryWarehouse} />
              <button onClick={fetchSummary} className={`${btnCls} bg-indigo-50 text-indigo-700`}>重新整理</button>
              <div className="ml-auto flex gap-2">
                <ExportButtons
                  data={summaryRows}
                  columns={MONTHLY_EXPORT_COLS}
                  filename={`月收入總表_${summaryYear}`}
                  title={`月收入總表 ${summaryYear}`}
                />
                <button
                  onClick={() => doPrint(
                    `月收入總表 ${summaryYear}`,
                    MONTHLY_EXPORT_COLS.map(c => c.header),
                    summaryRows.map(r => MONTHLY_EXPORT_COLS.map(c => r[c.key] ?? ''))
                  )}
                  className={`${btnCls} text-gray-600`}
                >列印</button>
              </div>
            </div>

            <p className="text-xs text-gray-400 mb-3">
              ※ 依「入住月份」分組；跨月入住（如月底入住隔月退房）整筆計入入住當月，退房月不另計。訂房明細中標有
              <span className="mx-1 px-1 py-0.5 rounded bg-orange-100 text-orange-600 text-[10px] font-medium">跨月</span>
              的訂單即為此情況。
            </p>
            {summaryLoading ? (
              <div className="text-center py-16 text-gray-400">載入中…</div>
            ) : (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 tbl-wrap">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-indigo-50">
                    <tr className="bg-indigo-50 text-indigo-800 text-xs">
                      {['月份','間數','住宿房費','其他消費','訂金匯款','當天匯款','刷卡','現金','住宿卷','手續費','淨收入','鎖帳'].map(h => (
                        <th key={h} className="px-3 py-2 text-right first:text-left font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {summaryRows.length === 0 && (
                      <tr><td colSpan={12} className="text-center py-10 text-gray-400">無資料</td></tr>
                    )}
                    {summaryRows.map(r => {
                      const lockRatio = r.rooms > 0 ? (r.lockedCount || 0) / r.rooms : 0;
                      const lockColor = lockRatio === 1 ? 'text-green-600 font-semibold' : lockRatio > 0 ? 'text-amber-600' : 'text-gray-300';
                      return (
                      <tr key={r.month} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-medium">{r.month}</td>
                        <td className="px-3 py-2 text-right">{r.rooms}</td>
                        <td className="px-3 py-2 text-right">{Math.round(r.totalRevenue).toLocaleString()}</td>
                        <td className="px-3 py-2 text-right text-gray-500">{Math.round(r.otherCharge).toLocaleString()}</td>
                        <td className="px-3 py-2 text-right text-blue-600">{Math.round(r.payDeposit).toLocaleString()}</td>
                        <td className="px-3 py-2 text-right text-teal-600">{Math.round(r.payTransfer).toLocaleString()}</td>
                        <td className="px-3 py-2 text-right text-purple-600">{Math.round(r.payCard).toLocaleString()}</td>
                        <td className="px-3 py-2 text-right text-green-600">{Math.round(r.payCash).toLocaleString()}</td>
                        <td className="px-3 py-2 text-right text-amber-600">{Math.round(r.payVoucher).toLocaleString()}</td>
                        <td className="px-3 py-2 text-right text-red-400">({Math.round(r.cardFee).toLocaleString()})</td>
                        <td className="px-3 py-2 text-right font-semibold text-indigo-700">{Math.round(r.netRevenue).toLocaleString()}</td>
                        <td className={`px-3 py-2 text-right text-xs ${lockColor}`} title={`${r.lockedCount || 0}/${r.rooms} 筆已鎖帳`}>
                          {r.lockedCount || 0}/{r.rooms}
                        </td>
                      </tr>
                    );})}
                    {summaryRows.length > 0 && (() => {
                      const tot = summaryRows.reduce((a, r) => ({
                        rooms: a.rooms + r.rooms,
                        totalRevenue: a.totalRevenue + r.totalRevenue,
                        otherCharge: a.otherCharge + r.otherCharge,
                        payDeposit: a.payDeposit + r.payDeposit,
                        payTransfer: a.payTransfer + (r.payTransfer || 0),
                        payCard: a.payCard + r.payCard,
                        payCash: a.payCash + r.payCash,
                        payVoucher: a.payVoucher + r.payVoucher,
                        cardFee: a.cardFee + r.cardFee,
                        netRevenue: a.netRevenue + r.netRevenue,
                      }), { rooms:0, totalRevenue:0, otherCharge:0, payDeposit:0, payTransfer:0, payCard:0, payCash:0, payVoucher:0, cardFee:0, netRevenue:0 });
                      return (
                        <tr className="bg-indigo-50 font-bold text-indigo-800">
                          <td className="px-3 py-2">總計</td>
                          <td className="px-3 py-2 text-right">{tot.rooms}</td>
                          <td className="px-3 py-2 text-right">{Math.round(tot.totalRevenue).toLocaleString()}</td>
                          <td className="px-3 py-2 text-right">{Math.round(tot.otherCharge).toLocaleString()}</td>
                          <td className="px-3 py-2 text-right">{Math.round(tot.payDeposit).toLocaleString()}</td>
                          <td className="px-3 py-2 text-right">{Math.round(tot.payTransfer).toLocaleString()}</td>
                          <td className="px-3 py-2 text-right">{Math.round(tot.payCard).toLocaleString()}</td>
                          <td className="px-3 py-2 text-right">{Math.round(tot.payCash).toLocaleString()}</td>
                          <td className="px-3 py-2 text-right">{Math.round(tot.payVoucher).toLocaleString()}</td>
                          <td className="px-3 py-2 text-right">({Math.round(tot.cardFee).toLocaleString()})</td>
                          <td className="px-3 py-2 text-right">{Math.round(tot.netRevenue).toLocaleString()}</td>
                          <td className="px-3 py-2 text-right text-xs">
                            {summaryRows.reduce((s, r) => s + (r.lockedCount || 0), 0)}/{tot.rooms}
                          </td>
                        </tr>
                      );
                    })()}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ══ Tab: 損益表（月報 / 年報）══ */}
        {activeTab === 'analytics' && analyticsSub === 'pnl' && (
          <div>
            {/* 控制列 */}
            <div className="flex flex-wrap items-center gap-3 mb-4">
              {/* 月報/年報 切換 */}
              <div className="flex rounded-lg overflow-hidden border border-gray-200 text-sm">
                {[['monthly','月報'],['annual','年報']].map(([v, label]) => (
                  <button
                    key={v}
                    onClick={() => setSummaryMode(v)}
                    className={`px-4 py-1.5 ${summaryMode === v ? 'bg-indigo-600 text-white font-medium' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                  >{label}</button>
                ))}
              </div>
              {summaryMode === 'monthly' && (
                <>
                  <label htmlFor="f-29" className="text-sm text-gray-600">年份</label>
                  <select id="f-29" value={summaryYear} onChange={e => setSummaryYear(e.target.value)} className={inputCls}>
                    {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </>
              )}
              <label htmlFor="f-30" className="text-sm text-gray-600">館別</label>
              <select id="f-30" value={summaryWarehouse} onChange={e => setSummaryWarehouse(e.target.value)} className={inputCls}>
                <option value="">全部</option>
                {warehouseList.map(w => <option key={w} value={w}>{w}</option>)}
              </select>
              <WhQuickBtns list={warehouseList} value={summaryWarehouse} onChange={setSummaryWarehouse} />
              <button onClick={fetchSummary} className={`${btnCls} bg-indigo-50 text-indigo-700`}>重新整理</button>
              <div className="ml-auto flex gap-2">
                {(() => {
                  const pnlData = summaryRows.map(r => ({
                    ...r,
                    month: summaryMode === 'annual' ? r.year : r.month,
                    incomeTotal:  r.netRevenue + (r.otherIncome || 0),
                    pnlNetProfit: r.netProfit,
                  }));
                  const title = summaryMode === 'annual'
                    ? `損益年報_${summaryWarehouse || '全館'}`
                    : `損益月報_${summaryYear}${summaryWarehouse ? '_' + summaryWarehouse : ''}`;
                  return (
                    <>
                      <ExportButtons
                        data={pnlData}
                        columns={PNL_EXPORT_COLS}
                        filename={title}
                        title={title}
                      />
                      <button
                        onClick={() => doPrint(
                          title,
                          PNL_EXPORT_COLS.map(c => c.header),
                          pnlData.map(r => PNL_EXPORT_COLS.map(c => r[c.key] ?? ''))
                        )}
                        className={`${btnCls} text-gray-600`}
                      >列印</button>
                    </>
                  );
                })()}
              </div>
            </div>

            {/* 月報：固定費用提示 */}
            {summaryMode === 'monthly' && !summaryLoading && summaryFixedHelp && (
              <div className="space-y-2 mb-4 text-sm">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-gray-600">
                  <span>此表固定費用來自費用管理之共通費用（僅計入<strong>已確認</strong>）。</span>
                  <Link href="/expenses" className="text-indigo-600 hover:underline font-medium whitespace-nowrap">
                    前往費用管理
                  </Link>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500 space-y-0.5">
                  <div><span className="font-medium text-gray-700">採購支出</span>：依進貨單的<strong>進貨日期</strong>歸月，僅計入狀態為「已入庫」或「已完成」的進貨單。</div>
                  <div><span className="font-medium text-gray-700">固定費用</span>：依共通費用記錄的<strong>費用月份</strong>歸月，僅計入狀態為「已確認」、類型為固定費用（非進貨單連結）的記錄。</div>
                </div>
                {(summaryFixedHelp.pendingFixedCount ?? 0) > 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
                    {summaryYear} 年度尚有 <strong>{summaryFixedHelp.pendingFixedCount}</strong> 筆共通費用紀錄未確認，不會計入上表固定費用；請至費用管理處理。
                  </div>
                )}
                {(summaryFixedHelp.monthsWithZeroFixed?.length ?? 0) > 0 && (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-800">
                    以下月份有訂房或房費收入，但固定費用為 NT$0，請確認該月是否已建立並確認共通費用：
                    <span className="ml-1 font-mono text-xs sm:text-sm">
                      {summaryFixedHelp.monthsWithZeroFixed.join('、')}
                    </span>
                  </div>
                )}
              </div>
            )}

            {summaryLoading ? (
              <div className="text-center py-16 text-gray-400">載入中…</div>
            ) : (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 tbl-wrap">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-indigo-50">
                    <tr className="bg-indigo-50 text-indigo-800 text-xs">
                      {[summaryMode === 'annual' ? '年份' : '月份','住宿淨收入','其他收入','收入合計','採購支出','固定費用','支出合計','淨利'].map(h => (
                        <th key={h} className="px-3 py-2 text-right first:text-left font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {summaryRows.length === 0 && (
                      <tr><td colSpan={8} className="text-center py-10 text-gray-400">無資料</td></tr>
                    )}
                    {summaryRows.map(r => {
                      const key = summaryMode === 'annual' ? r.year : r.month;
                      const incomeTotal = r.netRevenue + (r.otherIncome || 0);
                      const zeroFixedHint =
                        summaryMode === 'monthly' && (summaryFixedHelp?.monthsWithZeroFixed?.includes(r.month) ?? false);
                      const fixedExpenseLink = summaryMode === 'monthly'
                        ? `/expenses?month=${r.month}&subTab=records${summaryWarehouse ? `&warehouse=${encodeURIComponent(summaryWarehouse)}` : ''}`
                        : null;
                      const purchaseLink = summaryMode === 'monthly'
                        ? `/purchasing?startDate=${r.month}-01&endDate=${r.month}-31${summaryWarehouse ? `&warehouse=${encodeURIComponent(summaryWarehouse)}` : ''}`
                        : null;
                      return (
                        <tr
                          key={key}
                          className={`hover:bg-gray-50 ${zeroFixedHint ? 'bg-amber-50/60' : ''}`}
                        >
                          <td className="px-3 py-2 font-medium">{key}</td>
                          <td className="px-3 py-2 text-right text-indigo-700">{Math.round(r.netRevenue).toLocaleString()}</td>
                          <td className="px-3 py-2 text-right text-gray-500">{Math.round(r.otherIncome || 0).toLocaleString()}</td>
                          <td className="px-3 py-2 text-right font-semibold">{Math.round(incomeTotal).toLocaleString()}</td>
                          <td className="px-3 py-2 text-right text-red-500">
                            {purchaseLink ? (
                              <a href={purchaseLink} target="_blank" rel="noopener" className="hover:underline hover:text-red-600">
                                ({Math.round(r.purchaseExpense).toLocaleString()})
                              </a>
                            ) : (
                              <span>({Math.round(r.purchaseExpense).toLocaleString()})</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right text-red-400">
                            {fixedExpenseLink ? (
                              <a href={fixedExpenseLink} target="_blank" rel="noopener" className="hover:underline hover:text-red-600">
                                ({Math.round(r.fixedExpense).toLocaleString()})
                              </a>
                            ) : (
                              <span>({Math.round(r.fixedExpense).toLocaleString()})</span>
                            )}
                            {zeroFixedHint && (
                              <span className="block text-[10px] leading-tight text-amber-800 font-normal mt-0.5">可能未登記或未確認</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right text-red-600">({Math.round(r.totalExpense).toLocaleString()})</td>
                          <td className={`px-3 py-2 text-right font-bold ${r.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {Math.round(r.netProfit).toLocaleString()}
                          </td>
                        </tr>
                      );
                    })}
                    {/* 合計列（月報模式才顯示，年報各年已是年度合計） */}
                    {summaryMode === 'monthly' && summaryRows.length > 0 && (() => {
                      const tot = summaryRows.reduce((a, r) => ({
                        netRevenue:      (a.netRevenue      || 0) + r.netRevenue,
                        otherIncome:     (a.otherIncome     || 0) + (r.otherIncome || 0),
                        purchaseExpense: (a.purchaseExpense || 0) + r.purchaseExpense,
                        fixedExpense:    (a.fixedExpense    || 0) + r.fixedExpense,
                        totalExpense:    (a.totalExpense    || 0) + r.totalExpense,
                        netProfit:       (a.netProfit       || 0) + r.netProfit,
                      }), {});
                      const incomeTotal = tot.netRevenue + tot.otherIncome;
                      return (
                        <tr className="bg-indigo-50 font-bold text-indigo-800 text-xs border-t-2 border-indigo-200">
                          <td className="px-3 py-2">全年合計</td>
                          <td className="px-3 py-2 text-right">{Math.round(tot.netRevenue).toLocaleString()}</td>
                          <td className="px-3 py-2 text-right">{Math.round(tot.otherIncome).toLocaleString()}</td>
                          <td className="px-3 py-2 text-right">{Math.round(incomeTotal).toLocaleString()}</td>
                          <td className="px-3 py-2 text-right text-red-600">({Math.round(tot.purchaseExpense).toLocaleString()})</td>
                          <td className="px-3 py-2 text-right text-red-500">({Math.round(tot.fixedExpense).toLocaleString()})</td>
                          <td className="px-3 py-2 text-right text-red-700">({Math.round(tot.totalExpense).toLocaleString()})</td>
                          <td className={`px-3 py-2 text-right ${tot.netProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                            {Math.round(tot.netProfit).toLocaleString()}
                          </td>
                        </tr>
                      );
                    })()}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ══ Tab: 旅宿網申報 ══ */}
        {activeTab === 'declaration' && (
          <div>
            {/* 搜尋列 */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4 flex flex-wrap gap-3 items-end">
              <div>
                <label htmlFor="f-9" className="block text-xs text-gray-500 mb-1">申報月份</label>
                <input id="f-9" type="month" value={declMonth} onChange={e => setDeclMonth(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label htmlFor="f-10" className="block text-xs text-gray-500 mb-1">館別</label>
                <select id="f-10" value={declWarehouse} onChange={e => setDeclWarehouse(e.target.value)} className={inputCls}>
                  {(warehouseList.length ? warehouseList : [declWarehouse]).map(w => <option key={w} value={w}>{w}</option>)}
                </select>
                <WhQuickBtns list={warehouseList} value={declWarehouse} onChange={setDeclWarehouse} />
              </div>
              <button onClick={fetchDecl} disabled={declLoading}
                className={`${btnCls} bg-indigo-50 text-indigo-700 disabled:opacity-40`}>
                {declLoading ? '查詢中…' : '查詢'}
              </button>
            </div>

            {!declSearched && !declLoading && (
              <div className="text-center py-20 text-gray-400">請選擇月份與館別後按「查詢」</div>
            )}

            {declSearched && !declLoading && (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">

                {/* ── 左欄：實際資料（唯讀）── */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="px-5 py-3 bg-emerald-50 border-b border-emerald-100">
                    <h3 className="text-sm font-semibold text-emerald-800">實際營業資料（自動計算）</h3>
                    <p className="text-[11px] text-emerald-500 mt-0.5">來源：{declMonth} {declWarehouse} 訂房明細</p>
                  </div>
                  {declActual ? (
                    <div className="p-5">
                      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                        {[
                          ['刷卡總計',        Math.round(declActual.payCard),        'text-purple-600'],
                          ['房費+消費金額',   Math.round(declActual.revenueTotal),   'text-indigo-700'],
                          ['平均房價',        declActual.avgRoomRate,                'text-blue-600'],
                          ['每月間數（筆數）', declActual.roomCount,                  'text-gray-800'],
                          ['住宿間數（晚）',   declActual.roomNights,                 'text-teal-700'],
                          ['訂金匯款',        Math.round(declActual.payDeposit),     'text-blue-500'],
                          ['當天匯款',        Math.round(declActual.payTransfer),    'text-teal-600'],
                          ['現金收入',        Math.round(declActual.payCash),        'text-green-600'],
                          ['住宿卷',          Math.round(declActual.payVoucher),     'text-amber-600'],
                          ['刷卡手續費',      Math.round(declActual.cardFee),        'text-red-400'],
                        ].map(([label, val, color]) => (
                          <div key={label} className="flex justify-between items-center py-1 border-b border-gray-50">
                            <span className="text-xs text-gray-500">{label}</span>
                            <span className={`text-sm font-semibold ${color}`}>{Number(val).toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 pt-3 border-t flex justify-between items-center">
                        <span className="text-xs text-gray-500">業務來源（自動）</span>
                        <span className="text-xs text-gray-700">{declActual.businessSourceAuto || '—'}</span>
                      </div>
                      <div className="mt-2 flex justify-between items-center text-[11px] text-gray-400">
                        <span>Booking {declActual.sourceBooking} 筆 / 電話 {declActual.sourcePhone} 筆 / 其他 {declActual.sourceOther} 筆</span>
                      </div>
                    </div>
                  ) : (
                    <div className="p-8 text-center text-gray-400 text-sm">本月無訂房資料</div>
                  )}
                </div>

                {/* ── 右欄：申報資料（可編輯）── */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="px-5 py-3 bg-indigo-50 border-b border-indigo-100 flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-indigo-800">旅宿網申報資料{isLocked ? '（已鎖帳）' : '（可編輯）'}</h3>
                      <p className="text-[11px] text-indigo-400 mt-0.5">{isLocked ? '本月已鎖帳，僅供檢視' : '調整後按儲存，此為實際申報數字'}</p>
                    </div>
                    <button onClick={handleAutoFillDecl} disabled={isLocked}
                      className="text-[11px] px-2.5 py-1 rounded-lg border border-blue-300 text-blue-600 hover:bg-blue-50 whitespace-nowrap disabled:opacity-40">
                      ← 從實際帶入
                    </button>
                  </div>
                  <div className="p-5 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        ['cardTotal',        '刷卡總計'],
                        ['roomPriceTotal',   '房價金額'],
                        ['subsidizedRooms',  '補助間數'],
                        ['avgRoomRate',      '平均房價'],
                        ['monthlyRoomCount', '每月間數'],
                        ['roomSuppliesCost', '客房備品'],
                        ['fbExpense',        '餐飲支出'],
                        ['fitGuestCount',    '住客FIT人數'],
                        ['staffCount',       '員工人數'],
                        ['salary',           '薪資'],
                      ].map(([k, label]) => (
                        <div key={k}>
                          <label className="block text-[11px] text-gray-500 mb-0.5">{label}</label>
                          <input type="number" value={declForm[k]} disabled={isLocked}
                            onChange={e => setDeclForm(p => ({ ...p, [k]: e.target.value }))}
                            className={inputCls + ' w-full text-sm disabled:bg-gray-100'} />
                        </div>
                      ))}
                    </div>

                    <div>
                      <label htmlFor="f-31" className="block text-[11px] text-gray-500 mb-0.5">業務來源%</label>
                      <input id="f-31" type="text" value={declForm.businessSource} disabled={isLocked}
                        onChange={e => setDeclForm(p => ({ ...p, businessSource: e.target.value }))}
                        placeholder="例：Booking 60%、電話 40%" className={inputCls + ' w-full text-sm disabled:bg-gray-100'} />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="f-11" className="block text-[11px] text-gray-500 mb-0.5">其他額外收入</label>
                        <input id="f-11" type="number" value={declForm.otherIncome} disabled={isLocked}
                          onChange={e => setDeclForm(p => ({ ...p, otherIncome: e.target.value }))}
                          className={inputCls + ' w-full text-sm disabled:bg-gray-100'} />
                      </div>
                      <div>
                        <label htmlFor="f-12" className="block text-[11px] text-gray-500 mb-0.5">收入說明</label>
                        <input id="f-12" type="text" value={declForm.otherIncomeNote} disabled={isLocked}
                          onChange={e => setDeclForm(p => ({ ...p, otherIncomeNote: e.target.value }))}
                          className={inputCls + ' w-full text-sm disabled:bg-gray-100'} />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="f-13" className="block text-[11px] text-gray-500 mb-0.5">備註</label>
                      <textarea id="f-13" rows={2} value={declForm.note} disabled={isLocked}
                        onChange={e => setDeclForm(p => ({ ...p, note: e.target.value }))}
                        className={inputCls + ' w-full text-sm resize-none disabled:bg-gray-100'} />
                    </div>

                    <div className="flex gap-2">
                      <button onClick={handleDeclSave} disabled={declSaving || isLocked}
                        className="flex-1 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                        {declSaving ? '儲存中…' : isLocked ? '已鎖帳' : '儲存申報資料'}
                      </button>
                      <button onClick={() => {
                        const d = declForm;
                        const fmtN = v => v != null && v !== '' ? Number(v).toLocaleString() : '—';
                        doPrint(
                          `旅宿網申報 ${declMonth}（${declWarehouse}）`,
                          ['項目', '申報數值'],
                          [
                            ['刷卡總計',   fmtN(d.cardTotal)],
                            ['房價金額',   fmtN(d.roomPriceTotal)],
                            ['補助間數',   fmtN(d.subsidizedRooms)],
                            ['平均房價',   fmtN(d.avgRoomRate)],
                            ['每月間數',   fmtN(d.monthlyRoomCount)],
                            ['客房備品',   fmtN(d.roomSuppliesCost)],
                            ['餐飲支出',   fmtN(d.fbExpense)],
                            ['住客FIT人數',fmtN(d.fitGuestCount)],
                            ['員工人數',   fmtN(d.staffCount)],
                            ['薪資',       fmtN(d.salary)],
                            ['業務來源%',  d.businessSource || '—'],
                            ['其他額外收入',fmtN(d.otherIncome)],
                            ['收入說明',   d.otherIncomeNote || '—'],
                            ['備註',       d.note || '—'],
                          ]
                        );
                      }}
                        className={`${btnCls} text-gray-600 whitespace-nowrap`}>
                        列印申報表
                      </button>
                    </div>
                  </div>
                </div>

              </div>
            )}
          </div>
        )}

        {/* ══ Tab: 年度申報總覽 ══ */}
        {activeTab === 'analytics' && analyticsSub === 'declList' && (
          <div>
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <label htmlFor="f-14" className="text-sm text-gray-600">年份</label>
              <select id="f-14" value={dlYear} onChange={e => setDlYear(e.target.value)} className={inputCls}>
                {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <label htmlFor="f-32" className="text-sm text-gray-600">館別</label>
              <select id="f-32" value={dlWarehouse} onChange={e => setDlWarehouse(e.target.value)} className={inputCls}>
                {(warehouseList.length ? warehouseList : [dlWarehouse]).map(w => <option key={w} value={w}>{w}</option>)}
              </select>
              <WhQuickBtns list={warehouseList} value={dlWarehouse} onChange={setDlWarehouse} />
              <button onClick={fetchDeclList} className={`${btnCls} bg-indigo-50 text-indigo-700`}>查詢</button>
              <ExportButtons
                data={dlRows}
                columns={[
                  { header: '月份',       key: 'monthLabel' },
                  { header: '刷卡總計',    key: 'cardTotal',        format: 'number' },
                  { header: '房價金額',    key: 'roomPriceTotal',   format: 'number' },
                  { header: '補助間數',    key: 'subsidizedRooms',  format: 'number' },
                  { header: '平均房價',    key: 'avgRoomRate',      format: 'number' },
                  { header: '每月間數',    key: 'monthlyRoomCount', format: 'number' },
                  { header: '客房備品',    key: 'roomSuppliesCost', format: 'number' },
                  { header: '餐飲支出',    key: 'fbExpense',        format: 'number' },
                  { header: '住客FIT人數', key: 'fitGuestCount',    format: 'number' },
                  { header: '員工人數',    key: 'staffCount',       format: 'number' },
                  { header: '薪資',       key: 'salary',           format: 'number' },
                  { header: '業務來源%',   key: 'businessSource' },
                  { header: '其他收入',    key: 'otherIncome',      format: 'number' },
                  { header: '收入說明',    key: 'otherIncomeNote' },
                  { header: '備註',       key: 'note' },
                ]}
                filename={`旅宿網申報_${dlYear}`}
                title={`旅宿網申報 ${dlYear}（${dlWarehouse}）`}
              />
              <button
                onClick={() => {
                  const cols = ['月份','刷卡總計','房價金額','補助間數','平均房價','每月間數','客房備品','餐飲支出','住客FIT','員工','薪資','業務來源%','其他收入','收入說明','備註'];
                  const rows = dlRows.map(r => [
                    r.monthLabel,
                    r.cardTotal != null ? Number(r.cardTotal).toLocaleString() : '',
                    r.roomPriceTotal != null ? Number(r.roomPriceTotal).toLocaleString() : '',
                    r.subsidizedRooms ?? '',
                    r.avgRoomRate != null ? Number(r.avgRoomRate).toLocaleString() : '',
                    r.monthlyRoomCount ?? '',
                    r.roomSuppliesCost != null ? Number(r.roomSuppliesCost).toLocaleString() : '',
                    r.fbExpense != null ? Number(r.fbExpense).toLocaleString() : '',
                    r.fitGuestCount ?? '',
                    r.staffCount ?? '',
                    r.salary != null ? Number(r.salary).toLocaleString() : '',
                    r.businessSource || '',
                    r.otherIncome ? Number(r.otherIncome).toLocaleString() : '',
                    r.otherIncomeNote || '',
                    r.note || '',
                  ]);
                  doPrint(`旅宿網申報 ${dlYear}年（${dlWarehouse}）`, cols, rows);
                }}
                className={`${btnCls} text-gray-600`}
              >列印</button>
            </div>

            {dlLoading ? (
              <div className="text-center py-16 text-gray-400">載入中…</div>
            ) : (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 tbl-wrap">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-indigo-50">
                    <tr className="bg-indigo-50 text-indigo-800 text-xs">
                      {['月份','刷卡總計','房價金額','補助間數','平均房價','每月間數','客房備品','餐飲支出','住客FIT','員工','薪資','業務來源%','其他收入','備註'].map(h => (
                        <th key={h} className="px-3 py-2.5 text-right first:text-left font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {dlRows.map(r => (
                      <tr key={r.month} className={`hover:bg-gray-50 ${r.hasReport ? '' : 'text-gray-300'}`}>
                        <td className="px-3 py-2.5 font-medium text-gray-800">{r.monthLabel}</td>
                        <td className="px-3 py-2.5 text-right text-purple-600">{r.cardTotal != null ? Number(r.cardTotal).toLocaleString() : '—'}</td>
                        <td className="px-3 py-2.5 text-right text-indigo-700 font-semibold">{r.roomPriceTotal != null ? Number(r.roomPriceTotal).toLocaleString() : '—'}</td>
                        <td className="px-3 py-2.5 text-right text-gray-600">{r.subsidizedRooms ?? '—'}</td>
                        <td className="px-3 py-2.5 text-right text-blue-600">{r.avgRoomRate != null ? Number(r.avgRoomRate).toLocaleString() : '—'}</td>
                        <td className="px-3 py-2.5 text-right text-gray-700">{r.monthlyRoomCount ?? '—'}</td>
                        <td className="px-3 py-2.5 text-right text-gray-600">{r.roomSuppliesCost != null ? Number(r.roomSuppliesCost).toLocaleString() : '—'}</td>
                        <td className="px-3 py-2.5 text-right text-gray-600">{r.fbExpense != null ? Number(r.fbExpense).toLocaleString() : '—'}</td>
                        <td className="px-3 py-2.5 text-right text-teal-600">{r.fitGuestCount ?? '—'}</td>
                        <td className="px-3 py-2.5 text-right text-gray-600">{r.staffCount ?? '—'}</td>
                        <td className="px-3 py-2.5 text-right text-gray-700">{r.salary != null ? Number(r.salary).toLocaleString() : '—'}</td>
                        <td className="px-3 py-2.5 text-left text-gray-500 text-xs">{r.businessSource || '—'}</td>
                        <td className="px-3 py-2.5 text-right text-gray-600">{r.otherIncome ? Number(r.otherIncome).toLocaleString() : '—'}</td>
                        <td className="px-3 py-2.5 text-left text-gray-400 text-xs max-w-[120px] truncate" title={[r.otherIncomeNote, r.note].filter(Boolean).join(' / ')}>{r.note || r.otherIncomeNote || '—'}</td>
                      </tr>
                    ))}
                    {dlRows.length > 0 && (() => {
                      const tot = dlRows.reduce((a, r) => ({
                        cardTotal:       a.cardTotal       + (Number(r.cardTotal) || 0),
                        roomPriceTotal:  a.roomPriceTotal  + (Number(r.roomPriceTotal) || 0),
                        subsidizedRooms: a.subsidizedRooms + (r.subsidizedRooms || 0),
                        monthlyRoomCount:a.monthlyRoomCount+ (r.monthlyRoomCount || 0),
                        roomSuppliesCost:a.roomSuppliesCost+ (Number(r.roomSuppliesCost) || 0),
                        fbExpense:       a.fbExpense       + (Number(r.fbExpense) || 0),
                        fitGuestCount:   a.fitGuestCount   + (r.fitGuestCount || 0),
                        salary:          a.salary          + (Number(r.salary) || 0),
                        otherIncome:     a.otherIncome     + (Number(r.otherIncome) || 0),
                      }), { cardTotal:0, roomPriceTotal:0, subsidizedRooms:0, monthlyRoomCount:0, roomSuppliesCost:0, fbExpense:0, fitGuestCount:0, salary:0, otherIncome:0 });
                      return (
                        <tr className="bg-indigo-50 font-bold text-indigo-800">
                          <td className="px-3 py-2.5">合計</td>
                          <td className="px-3 py-2.5 text-right">{tot.cardTotal.toLocaleString()}</td>
                          <td className="px-3 py-2.5 text-right">{tot.roomPriceTotal.toLocaleString()}</td>
                          <td className="px-3 py-2.5 text-right">{tot.subsidizedRooms}</td>
                          <td className="px-3 py-2.5 text-right">—</td>
                          <td className="px-3 py-2.5 text-right">{tot.monthlyRoomCount}</td>
                          <td className="px-3 py-2.5 text-right">{tot.roomSuppliesCost.toLocaleString()}</td>
                          <td className="px-3 py-2.5 text-right">{tot.fbExpense.toLocaleString()}</td>
                          <td className="px-3 py-2.5 text-right">{tot.fitGuestCount}</td>
                          <td className="px-3 py-2.5 text-right">—</td>
                          <td className="px-3 py-2.5 text-right">{tot.salary.toLocaleString()}</td>
                          <td className="px-3 py-2.5"></td>
                          <td className="px-3 py-2.5 text-right">{tot.otherIncome ? tot.otherIncome.toLocaleString() : ''}</td>
                          <td className="px-3 py-2.5"></td>
                        </tr>
                      );
                    })()}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ══ Tab: 訂金核對 ══ */}
        {activeTab === 'deposit' && (() => {
          const suggestMap = new Map((dmData?.suggestions || []).map(s => [s.bnbId, s.bankLineId]));
          const lineMatchedByBnb = new Map(
            (dmData?.bnbRecords || [])
              .filter(r => r.bankLineId)
              .map(r => [r.bankLineId, r.guestName])
          );
          const summary    = dmData?.summary;
          const bnbRecords = dmData?.bnbRecords || [];
          const bankLines  = dmData?.bankLines  || [];
          const allSummary = dmData?.summary;  // for paymentType=all view

          const PAY_TYPE_TABS = [
            { key: 'payment', label: '收款明細' },
            { key: 'ledger',  label: '流水帳' },
            { key: 'all',     label: '整體進度' },
          ];
          const PAY_SUB_TYPES = [
            { key: 'combined', label: '全部' },
            { key: 'deposit',  label: '訂金匯款' },
            { key: 'transfer', label: '當天匯款' },
            { key: 'card',     label: '刷卡' },
            { key: 'cash',     label: '現金存款' },
          ];
          const activeOuterTab = dmPayType === 'all' ? 'all' : dmPayType === 'ledger' ? 'ledger' : 'payment';

          return (
            <div>
              {/* 付款類型切換 */}
              <div className="flex gap-1 mb-4 overflow-x-auto">
                {PAY_TYPE_TABS.map(t => (
                  <button key={t.key}
                    onClick={() => {
                      if (t.key === 'all') { setDmPayType('all'); setDmData(null); setDmSelBnb(null); setDmSelLine(null); }
                      else if (t.key === 'ledger') { setDmPayType('ledger'); }
                      else if (dmPayType === 'all' || dmPayType === 'ledger') { setDmPayType('deposit'); setDmData(null); setDmSelBnb(null); setDmSelLine(null); }
                    }}
                    className={`px-4 py-1.5 text-sm rounded-lg whitespace-nowrap transition-colors ${
                      activeOuterTab === t.key
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'bg-white border border-gray-200 text-gray-600 hover:bg-indigo-50'
                    }`}>
                    {t.label}
                  </button>
                ))}
              </div>

              {/* 篩選列 */}
              {activeOuterTab !== 'ledger' && <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4 flex flex-wrap gap-3 items-end">
                <div>
                  <label htmlFor="f-15" className="block text-xs text-gray-500 mb-1">月份</label>
                  <input id="f-15" type="month" value={dmMonth} onChange={e => setDmMonth(e.target.value)} className={inputCls} />
                </div>
                {dmPayType !== 'all' && (
                  <div>
                    <label htmlFor="f-16" className="block text-xs text-gray-500 mb-1">分類</label>
                    <select id="f-16" value={dmPayType} onChange={e => { setDmPayType(e.target.value); setDmData(null); setDmSelBnb(null); setDmSelLine(null); }} className={inputCls}>
                      {PAY_SUB_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                    </select>
                  </div>
                )}
                <div>
                  <label htmlFor="f-33" className="block text-xs text-gray-500 mb-1">館別</label>
                  <select id="f-33" value={dmWarehouse} onChange={e => setDmWarehouse(e.target.value)} className={inputCls}>
                    <option value="">全部</option>
                    {warehouseList.map(w => <option key={w} value={w}>{w}</option>)}
                  </select>
                  <WhQuickBtns list={warehouseList} value={dmWarehouse} onChange={setDmWarehouse} />
                </div>
                {dmPayType !== 'all' && dmPayType !== 'combined' && (
                  <div>
                    <label htmlFor="f-34" className="block text-xs text-gray-500 mb-1">存簿帳戶</label>
                    <select id="f-34" value={dmAccountId} onChange={e => setDmAccountId(e.target.value)} className={inputCls}>
                      <option value="">請選擇帳戶</option>
                      {dmAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </div>
                )}
                <button onClick={fetchDepositMatch} disabled={dmLoading || (dmPayType !== 'all' && dmPayType !== 'combined' && !dmAccountId)}
                  className={`${btnCls} bg-indigo-50 text-indigo-700 disabled:opacity-40`}>
                  {dmLoading ? '載入中…' : '查詢'}
                </button>
                <button
                  type="button"
                  onClick={() => { setBankImportLines([]); setBankImportError(''); setShowBankImport(true); }}
                  className="px-4 py-1.5 text-sm rounded-lg font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors whitespace-nowrap">
                  ↑ 匯入銀行對帳單
                </button>
                {dmData && dmPayType !== 'all' && (
                  <>
                    <button onClick={handleAutoMatch} disabled={dmMatching || !(dmData?.suggestions?.length) || isLocked}
                      className={`${btnCls} bg-amber-50 text-amber-700 disabled:opacity-40`}>
                      ⚡ 自動配對{dmData?.suggestions?.length ? `（${dmData.suggestions.length}筆）` : ''}
                    </button>
                    <ExportButtons
                      data={(dmData?.bnbRecords || []).map(r => ({
                        guestName:   r.guestName,
                        checkInDate: r.checkInDate,
                        checkOutDate:r.checkOutDate,
                        payAmount:   r.payAmount,
                        payDate:     r.payDate,
                        last5:       r.last5,
                        matchStatus: r.bankLineId ? '已配對' : '未配對',
                        matchedBy:   r.matchedBy || '',
                      }))}
                      columns={[
                        { header: '姓名',    key: 'guestName' },
                        { header: '入住',    key: 'checkInDate' },
                        { header: '退房',    key: 'checkOutDate' },
                        { header: '金額',    key: 'payAmount',  format: 'number' },
                        { header: '付款日期', key: 'payDate' },
                        { header: '後五碼',  key: 'last5' },
                        { header: '配對狀態', key: 'matchStatus' },
                        { header: '配對者',  key: 'matchedBy' },
                      ]}
                      filename={`核對_${dmPayType}_${dmMonth}`}
                      title={`${PAY_SUB_TYPES.find(t => t.key === dmPayType)?.label || ''} 核對 ${dmMonth}`}
                    />
                  </>
                )}
              </div>}

              {/* 流水帳 */}
              {activeOuterTab === 'ledger' && (
                <div>
                  {/* 流水帳篩選列 */}
                  <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4 flex flex-wrap gap-3 items-end">
                    <div>
                      <label htmlFor="f-17" className="block text-xs text-gray-500 mb-1">月份起</label>
                      <input id="f-17" type="month" value={ledgerMonthFrom} onChange={e => setLedgerMonthFrom(e.target.value)} className={inputCls} />
                    </div>
                    <div>
                      <label htmlFor="f-18" className="block text-xs text-gray-500 mb-1">月份迄</label>
                      <input id="f-18" type="month" value={ledgerMonthTo} onChange={e => setLedgerMonthTo(e.target.value)} className={inputCls} />
                    </div>
                    <div>
                      <label htmlFor="f-19" className="block text-xs text-gray-500 mb-1">館別</label>
                      <select id="f-19" value={ledgerWarehouse} onChange={e => setLedgerWarehouse(e.target.value)} className={inputCls}>
                        <option value="">全部</option>
                        {warehouseList.map(w => <option key={w} value={w}>{w}</option>)}
                      </select>
                      <WhQuickBtns list={warehouseList} value={ledgerWarehouse} onChange={setLedgerWarehouse} />
                    </div>
                    <button onClick={fetchLedger} disabled={ledgerLoading}
                      className={`${btnCls} bg-indigo-50 text-indigo-700 disabled:opacity-40`}>
                      {ledgerLoading ? '載入中…' : '查詢'}
                    </button>
                    {ledgerRows.length > 0 && (() => {
                      const sumRoom    = ledgerRows.reduce((s, r) => s + Number(r.roomCharge  || 0), 0);
                      const sumOther   = ledgerRows.reduce((s, r) => s + Number(r.otherCharge || 0), 0);
                      const sumDeposit = ledgerRows.reduce((s, r) => s + Number(r.payDeposit  || 0), 0);
                      const sumXfer    = ledgerRows.reduce((s, r) => s + Number(r.payTransfer || 0), 0);
                      const sumCard    = ledgerRows.reduce((s, r) => s + Number(r.payCard     || 0), 0);
                      const sumCash    = ledgerRows.reduce((s, r) => s + Number(r.payCash     || 0), 0);
                      const sumVoucher = ledgerRows.reduce((s, r) => s + Number(r.payVoucher  || 0), 0);
                      const sumFee     = ledgerRows.reduce((s, r) => s + Number(r.cardFee     || 0), 0);
                      const net = sumDeposit + sumXfer + sumCard + sumCash + sumVoucher - sumFee;
                      return (
                        <div className="flex flex-wrap gap-2 items-center ml-2 text-xs">
                          <span className="text-gray-400">{ledgerRows.length} 筆</span>
                          <span className="text-gray-500">房費 <b className="text-indigo-700">{NT(sumRoom)}</b></span>
                          <span className="text-gray-500">訂金 <b>{NT(sumDeposit)}</b></span>
                          <span className="text-gray-500">匯款 <b>{NT(sumXfer)}</b></span>
                          <span className="text-gray-500">刷卡 <b>{NT(sumCard)}</b></span>
                          <span className="text-gray-500">現金 <b>{NT(sumCash)}</b></span>
                          <span className="text-gray-500">住宿券 <b>{NT(sumVoucher)}</b></span>
                          <span className="text-gray-500">手續費 <b className="text-red-500">-{NT(sumFee)}</b></span>
                          <span className="text-gray-700 font-semibold">淨收入 <b className="text-green-700">{NT(net)}</b></span>
                        </div>
                      );
                    })()}
                    {ledgerRows.length > 0 && (
                      <ExportButtons
                        data={ledgerRows.map(r => ({
                          importMonth:  r.importMonth,
                          warehouse:    r.warehouse,
                          source:       r.source,
                          guestName:    r.guestName,
                          roomNo:       r.roomNo || '',
                          checkInDate:  r.checkInDate,
                          checkOutDate: r.checkOutDate,
                          roomCharge:   Number(r.roomCharge  || 0),
                          otherCharge:  Number(r.otherCharge || 0),
                          payDeposit:   Number(r.payDeposit  || 0),
                          depositDate:  r.depositDate  || '',
                          depositLast5: r.depositLast5 || '',
                          payTransfer:  Number(r.payTransfer || 0),
                          transferDate: r.transferDate  || '',
                          transferLast5:r.transferLast5 || '',
                          payCard:      Number(r.payCard     || 0),
                          cardFeeRate:  Number(r.cardFeeRate || 0),
                          cardFee:      Number(r.cardFee     || 0),
                          payCash:      Number(r.payCash     || 0),
                          payVoucher:   Number(r.payVoucher  || 0),
                          net: Number(r.payDeposit||0)+Number(r.payTransfer||0)+Number(r.payCard||0)+Number(r.payCash||0)+Number(r.payVoucher||0)-Number(r.cardFee||0),
                          status:       r.status,
                          note:         r.note || '',
                        }))}
                        columns={[
                          { header: '月份',     key: 'importMonth' },
                          { header: '館別',     key: 'warehouse' },
                          { header: '來源',     key: 'source' },
                          { header: '姓名',     key: 'guestName' },
                          { header: '房號',     key: 'roomNo' },
                          { header: '入住',     key: 'checkInDate' },
                          { header: '退房',     key: 'checkOutDate' },
                          { header: '房費',     key: 'roomCharge',   format: 'number' },
                          { header: '其他費用', key: 'otherCharge',  format: 'number' },
                          { header: '訂金',     key: 'payDeposit',   format: 'number' },
                          { header: '訂金日期', key: 'depositDate' },
                          { header: '訂金後五碼',key:'depositLast5' },
                          { header: '當天匯款', key: 'payTransfer',  format: 'number' },
                          { header: '匯款日期', key: 'transferDate' },
                          { header: '匯款後五碼',key:'transferLast5'},
                          { header: '刷卡',     key: 'payCard',      format: 'number' },
                          { header: '手續費率', key: 'cardFeeRate',  format: 'number' },
                          { header: '手續費',   key: 'cardFee',      format: 'number' },
                          { header: '現金',     key: 'payCash',      format: 'number' },
                          { header: '住宿券',   key: 'payVoucher',   format: 'number' },
                          { header: '淨收入',   key: 'net',          format: 'number' },
                          { header: '狀態',     key: 'status' },
                          { header: '備註',     key: 'note' },
                        ]}
                        filename={`流水帳_${ledgerMonthFrom}_${ledgerMonthTo}${ledgerWarehouse ? '_' + ledgerWarehouse : ''}`}
                        title={`收款流水帳 ${ledgerMonthFrom} ~ ${ledgerMonthTo}${ledgerWarehouse ? '　' + ledgerWarehouse : ''}`}
                      />
                    )}
                  </div>

                  {/* 流水帳表格 */}
                  {ledgerLoading && <div className="text-center py-20 text-gray-400">載入中…</div>}
                  {!ledgerLoading && ledgerRows.length === 0 && (
                    <div className="text-center py-20 text-gray-400">請設定月份區間後按「查詢」</div>
                  )}
                  {!ledgerLoading && ledgerRows.length > 0 && (
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 tbl-wrap">
                      <table className="w-full text-xs whitespace-nowrap">
                        <thead className="sticky top-0 bg-indigo-50 text-indigo-800">
                          <tr>
                            <th className="px-3 py-2 text-left">月份</th>
                            <th className="px-3 py-2 text-left">館別</th>
                            <th className="px-3 py-2 text-left">姓名</th>
                            <th className="px-3 py-2 text-left">入住</th>
                            <th className="px-3 py-2 text-left">退房</th>
                            <th className="px-3 py-2 text-right">房費</th>
                            <th className="px-3 py-2 text-right">其他</th>
                            <th className="px-3 py-2 text-right">訂金</th>
                            <th className="px-3 py-2 text-left">訂金日</th>
                            <th className="px-3 py-2 text-left">後五碼</th>
                            <th className="px-3 py-2 text-right">匯款</th>
                            <th className="px-3 py-2 text-left">匯款日</th>
                            <th className="px-3 py-2 text-left">後五碼</th>
                            <th className="px-3 py-2 text-right">刷卡</th>
                            <th className="px-3 py-2 text-right">手續費</th>
                            <th className="px-3 py-2 text-right">現金</th>
                            <th className="px-3 py-2 text-right">住宿券</th>
                            <th className="px-3 py-2 text-right font-semibold">淨收入</th>
                            <th className="px-3 py-2 text-left">狀態</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {ledgerRows.map(r => {
                            const net = Number(r.payDeposit||0)+Number(r.payTransfer||0)+Number(r.payCard||0)+Number(r.payCash||0)+Number(r.payVoucher||0)-Number(r.cardFee||0);
                            return (
                              <tr key={r.id} className="hover:bg-gray-50">
                                <td className="px-3 py-2">{r.importMonth}</td>
                                <td className="px-3 py-2">{r.warehouse}</td>
                                <td className="px-3 py-2">{r.guestName}</td>
                                <td className="px-3 py-2">{r.checkInDate}</td>
                                <td className="px-3 py-2">{r.checkOutDate}</td>
                                <td className="px-3 py-2 text-right">{Number(r.roomCharge||0) > 0 ? NT(r.roomCharge) : ''}</td>
                                <td className="px-3 py-2 text-right">{Number(r.otherCharge||0) > 0 ? NT(r.otherCharge) : ''}</td>
                                <td className="px-3 py-2 text-right">{Number(r.payDeposit||0) > 0 ? NT(r.payDeposit) : ''}</td>
                                <td className="px-3 py-2 text-gray-500">{r.depositDate || ''}</td>
                                <td className="px-3 py-2 font-mono text-gray-500">{r.depositLast5 || ''}</td>
                                <td className="px-3 py-2 text-right">{Number(r.payTransfer||0) > 0 ? NT(r.payTransfer) : ''}</td>
                                <td className="px-3 py-2 text-gray-500">{r.transferDate || ''}</td>
                                <td className="px-3 py-2 font-mono text-gray-500">{r.transferLast5 || ''}</td>
                                <td className="px-3 py-2 text-right">{Number(r.payCard||0) > 0 ? NT(r.payCard) : ''}</td>
                                <td className="px-3 py-2 text-right text-red-500">{Number(r.cardFee||0) > 0 ? `-${NT(r.cardFee)}` : ''}</td>
                                <td className="px-3 py-2 text-right">{Number(r.payCash||0) > 0 ? NT(r.payCash) : ''}</td>
                                <td className="px-3 py-2 text-right">{Number(r.payVoucher||0) > 0 ? NT(r.payVoucher) : ''}</td>
                                <td className="px-3 py-2 text-right font-semibold text-green-700">{net > 0 ? NT(net) : ''}</td>
                                <td className="px-3 py-2 text-gray-500">{r.status}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* 整體進度視圖 */}
              {dmPayType === 'all' && dmData && !dmLoading && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {(dmData.summary || []).map(s => {
                      const pct = s.total > 0 ? Math.round(s.matched / s.total * 100) : 0;
                      return (
                        <div key={s.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                          <div className="text-xs text-gray-500 mb-1">{s.label}</div>
                          <div className="text-lg font-bold text-indigo-700">
                            NT$ {s.amount.toLocaleString()}
                          </div>
                          <div className="mt-2 flex items-center gap-2">
                            <div className="flex-1 bg-gray-100 rounded-full h-2">
                              <div className="bg-green-500 h-2 rounded-full transition-all"
                                style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs text-gray-500">{pct}%</span>
                          </div>
                          <div className="mt-1 flex justify-between text-xs">
                            <span className="text-green-600">✓ {s.matched}</span>
                            {s.skipped > 0 && <span className="text-orange-500">↗ {s.skipped}</span>}
                            <span className={s.unmatched > 0 ? 'text-amber-600' : 'text-gray-400'}>
                              ○ {s.unmatched}
                            </span>
                            <span className="text-gray-400">共 {s.total}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 摘要卡 */}
              {summary && dmPayType !== 'all' && dmPayType !== 'ledger' && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
                  {[
                    { label: `BNB ${PAY_SUB_TYPES.find(t => t.key === dmPayType)?.label || ''}合計`,
                      val: `NT$ ${summary.totalBnbAmount.toLocaleString()}`, color: 'text-indigo-700' },
                    { label: '存簿入帳合計',   val: `NT$ ${summary.totalBankCredit.toLocaleString()}`,  color: 'text-blue-700' },
                    { label: '差異',          val: `NT$ ${Math.abs(summary.diff).toLocaleString()}`,    color: summary.diff !== 0 ? 'text-red-600 font-bold' : 'text-green-600' },
                    { label: '已配對',         val: `${summary.matchedCount} 筆`,                        color: 'text-green-600' },
                    { label: '標記處理',       val: `${summary.skippedCount || 0} 筆`,                   color: summary.skippedCount > 0 ? 'text-orange-500' : 'text-gray-400' },
                    { label: '未配對（BNB）',  val: `${summary.unmatchedBnbCount} 筆`,                   color: summary.unmatchedBnbCount > 0 ? 'text-amber-600' : 'text-gray-500' },
                  ].map(c => (
                    <div key={c.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
                      <p className="text-xs text-gray-500">{c.label}</p>
                      <p className={`font-bold text-sm mt-0.5 ${c.color}`}>{c.val}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* 配對按鈕 */}
              {(dmSelBnb && dmSelLine) && (
                <div className="mb-3 flex items-center gap-3 p-3 bg-indigo-50 rounded-xl border border-indigo-200">
                  <span className="text-sm text-indigo-700">已選取雙側各一筆，確認配對？</span>
                  <button onClick={handleMatch} disabled={dmMatching || isLocked}
                    className="px-4 py-1.5 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
                    {dmMatching ? '配對中…' : isLocked ? '已鎖帳' : '確認配對'}
                  </button>
                  <button onClick={() => { setDmSelBnb(null); setDmSelLine(null); }}
                    className="text-xs text-gray-500 hover:underline">取消</button>
                </div>
              )}

              {!dmData && !dmLoading && activeOuterTab !== 'ledger' && (
                <div className="text-center py-20 text-gray-400">
                  {dmPayType === 'all' ? '請選擇月份後按「查詢」' : '請選擇存簿帳戶後按「查詢」'}
                </div>
              )}
              {dmLoading && activeOuterTab !== 'ledger' && (
                <div className="text-center py-20 text-gray-400">載入中…</div>
              )}

              {/* 雙欄核對表 */}
              {/* 全部分類合併列表 */}
              {dmData && !dmLoading && dmPayType === 'combined' && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="px-4 py-2.5 bg-indigo-50 border-b border-indigo-100 flex items-center justify-between">
                    <span className="text-sm font-semibold text-indigo-800">全部收款類型（BNB）</span>
                    <span className="text-xs text-indigo-500">
                      {bnbRecords.length} 筆 　合計 NT${bnbRecords.reduce((s, r) => s + (r.payAmount || 0), 0).toLocaleString('zh-TW')}
                    </span>
                  </div>
                  <div className="overflow-y-auto max-h-[600px]">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-gray-50">
                        <tr className="text-gray-500">
                          <th className="px-3 py-2 text-left">姓名</th>
                          <th className="px-3 py-2 text-left">入住</th>
                          <th className="px-3 py-2 text-left">付款日</th>
                          <th className="px-3 py-2 text-left">分類</th>
                          <th className="px-3 py-2 text-left">後五碼</th>
                          <th className="px-3 py-2 text-right">金額</th>
                          <th className="px-3 py-2 text-center">配對</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {bnbRecords.length === 0 && (
                          <tr><td colSpan={7} className="text-center py-8 text-gray-400">本月無收款記錄</td></tr>
                        )}
                        {bnbRecords.map(r => {
                          const typeColors = { deposit: 'bg-blue-50 text-blue-700', transfer: 'bg-indigo-50 text-indigo-700', card: 'bg-purple-50 text-purple-700', cash: 'bg-green-50 text-green-700' };
                          return (
                            <tr key={r.id} className={r.bankLineId ? 'bg-green-50' : 'hover:bg-gray-50'}>
                              <td className="px-3 py-2 font-medium max-w-[90px] truncate">{r.guestName}</td>
                              <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{r.checkInDate}</td>
                              <td className="px-3 py-2 text-blue-500 whitespace-nowrap">{r.payDate || '—'}</td>
                              <td className="px-3 py-2">
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${typeColors[r.paymentTypeKey] || 'bg-gray-100 text-gray-600'}`}>
                                  {r.paymentTypeLabel}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-blue-600 font-mono">{r.last5 || '—'}</td>
                              <td className="px-3 py-2 text-right font-semibold text-indigo-700">{r.payAmount.toLocaleString()}</td>
                              <td className="px-3 py-2 text-center">
                                {r.bankLineId
                                  ? <span className="text-green-600 font-bold">✓</span>
                                  : r.matchSkip
                                    ? <div className="flex items-center justify-center gap-1">
                                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${r.matchSkip === 'next_month' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'}`}
                                          title={r.matchSkipNote || ''}>
                                          {r.matchSkip === 'next_month' ? '跨月' : '免配'}
                                        </span>
                                        <button onClick={() => handleClearMark(r.bnbId, r.paymentTypeKey)}
                                          className="text-gray-300 hover:text-red-400 text-sm leading-none">×</button>
                                      </div>
                                    : <div className="flex items-center justify-center gap-1">
                                        <button onClick={() => { setDmMarkNote(''); setDmMarkModal({ bnbId: r.bnbId, skipType: 'next_month', paymentType: r.paymentTypeKey }); }}
                                          className="text-[10px] text-orange-600 border border-orange-200 hover:bg-orange-50 px-1 py-0.5 rounded">跨月</button>
                                        <button onClick={() => { setDmMarkNote(''); setDmMarkModal({ bnbId: r.bnbId, skipType: 'no_match', paymentType: r.paymentTypeKey }); }}
                                          className="text-[10px] text-gray-500 border border-gray-200 hover:bg-gray-50 px-1 py-0.5 rounded">免配</button>
                                      </div>
                                }
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="bg-gray-50 font-semibold text-xs">
                        <tr>
                          {['deposit','transfer','card','cash'].map(key => {
                            const typeRows = bnbRecords.filter(r => r.paymentTypeKey === key);
                            if (typeRows.length === 0) return null;
                            const label = PAY_SUB_TYPES.find(t => t.key === key)?.label || key;
                            const total = typeRows.reduce((s, r) => s + (r.payAmount || 0), 0);
                            return <td key={key} className="px-3 py-2 text-gray-600">{label}: {total.toLocaleString()}</td>;
                          })}
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              {dmData && !dmLoading && dmPayType !== 'all' && dmPayType !== 'combined' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

                  {/* 左欄：BNB 收款 */}
                  <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="px-4 py-2.5 bg-indigo-50 border-b border-indigo-100 flex items-center justify-between">
                      <span className="text-sm font-semibold text-indigo-800">
                        {PAY_SUB_TYPES.find(t => t.key === dmPayType)?.label || ''}（BNB）
                      </span>
                      <span className="text-xs text-indigo-500">{bnbRecords.length} 筆　點選後再點右側存簿行配對</span>
                    </div>
                    <div className="overflow-y-auto max-h-[480px]">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-gray-50">
                          <tr className="text-gray-500">
                            <th className="px-3 py-2 text-left">狀態</th>
                            <th className="px-3 py-2 text-left">姓名</th>
                            <th className="px-3 py-2 text-left">入住</th>
                            <th className="px-3 py-2 text-left">付款日</th>
                            <th className="px-3 py-2 text-left">分類</th>
                            {(dmPayType === 'deposit' || dmPayType === 'transfer') && (
                              <th className="px-3 py-2 text-left">後五碼</th>
                            )}
                            <th className="px-3 py-2 text-right">金額</th>
                            <th className="px-3 py-2"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {bnbRecords.length === 0 && (
                            <tr><td colSpan={(dmPayType === 'deposit' || dmPayType === 'transfer') ? 8 : 7} className="text-center py-8 text-gray-400">本月無此類型收款記錄</td></tr>
                          )}
                          {bnbRecords.map((r, _ri, arr) => {
                            const isMatched   = !!r.bankLineId;
                            const isSkipped   = !r.bankLineId && !!r.matchSkip;
                            const isSuggested = !isMatched && !isSkipped && suggestMap.has(r.id);
                            const isSelected  = dmSelBnb === r.id;
                            const isFirstUnmatched = !isMatched && !isSkipped && arr.findIndex(x => !x.bankLineId && !x.matchSkip) === _ri;
                            let rowCls = 'transition-colors ';
                            if (!isMatched && !isSkipped) rowCls += 'cursor-pointer ';
                            if (isSelected)       rowCls += 'bg-indigo-100 ring-1 ring-inset ring-indigo-300';
                            else if (isMatched)   rowCls += 'bg-green-50 hover:bg-green-100';
                            else if (isSkipped)   rowCls += r.matchSkip === 'next_month' ? 'bg-orange-50' : 'bg-gray-50';
                            else if (isSuggested) rowCls += 'bg-amber-50 hover:bg-amber-100';
                            else rowCls += 'hover:bg-gray-50';
                            return (
                              <tr key={r.id} className={rowCls}
                                {...(isFirstUnmatched ? { 'data-first-unmatched': '1' } : {})}
                                onClick={() => !isMatched && !isSkipped && setDmSelBnb(isSelected ? null : r.id)}>
                                <td className="px-3 py-2.5">
                                  {isMatched
                                    ? <span className="text-green-600 font-bold">✓</span>
                                    : isSkipped
                                      ? <span className={`text-[10px] font-semibold ${r.matchSkip === 'next_month' ? 'text-orange-500' : 'text-gray-400'}`}>
                                          {r.matchSkip === 'next_month' ? '↗' : '–'}
                                        </span>
                                      : isSuggested
                                        ? <span className="text-amber-500">⚡</span>
                                        : <span className="text-gray-300">○</span>
                                  }
                                </td>
                                <td className="px-3 py-2.5 max-w-[100px] truncate font-medium">{r.guestName}</td>
                                <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{r.checkInDate}</td>
                                <td className="px-3 py-2.5 text-blue-500 whitespace-nowrap text-xs">{r.payDate || '—'}</td>
                                <td className="px-3 py-2.5">
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-50 text-indigo-700 whitespace-nowrap">
                                    {PAY_SUB_TYPES.find(t => t.key === dmPayType)?.label || dmPayType}
                                  </span>
                                </td>
                                {(dmPayType === 'deposit' || dmPayType === 'transfer') && (
                                  <td className="px-3 py-2.5 text-blue-600 font-mono text-xs tracking-wider">{r.last5 || '—'}</td>
                                )}
                                <td className="px-3 py-2.5 text-right font-semibold text-indigo-700">
                                  {r.payAmount.toLocaleString()}
                                </td>
                                <td className="px-3 py-2.5 text-right">
                                  {isSkipped ? (
                                    <div className="flex items-center justify-end gap-1">
                                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${r.matchSkip === 'next_month' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'}`}
                                        title={r.matchSkipNote || ''}>
                                        {r.matchSkip === 'next_month' ? '跨月' : '免配'}
                                      </span>
                                      {!isLocked && (
                                        <button onClick={e => { e.stopPropagation(); handleClearMark(r.id); }}
                                          className="text-gray-300 hover:text-red-400 text-sm leading-none ml-0.5">×</button>
                                      )}
                                    </div>
                                  ) : isMatched ? (
                                    !isLocked && (
                                      <button onClick={e => { e.stopPropagation(); handleUnmatch(r.id); }}
                                        className="text-[10px] text-red-400 hover:text-red-600 px-1.5 py-0.5 rounded border border-red-200 hover:bg-red-50">
                                        解除
                                      </button>
                                    )
                                  ) : !isLocked ? (
                                    <div className="flex items-center justify-end gap-1">
                                      <button onClick={e => { e.stopPropagation(); setDmMarkNote(''); setDmMarkModal({ bnbId: r.id, skipType: 'next_month' }); }}
                                        className="text-[10px] text-orange-600 border border-orange-200 hover:bg-orange-50 px-1.5 py-0.5 rounded whitespace-nowrap">
                                        跨月
                                      </button>
                                      <button onClick={e => { e.stopPropagation(); setDmMarkNote(''); setDmMarkModal({ bnbId: r.id, skipType: 'no_match' }); }}
                                        className="text-[10px] text-gray-500 border border-gray-200 hover:bg-gray-50 px-1.5 py-0.5 rounded whitespace-nowrap">
                                        免配
                                      </button>
                                    </div>
                                  ) : null}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* 右欄：存簿入帳 */}
                  <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="px-4 py-2.5 bg-blue-50 border-b border-blue-100 flex items-center justify-between">
                      <span className="text-sm font-semibold text-blue-800">存簿入帳（銀行明細）</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-blue-500">{bankLines.length} 筆入帳</span>
                        {dmAccountId && (
                          <button onClick={() => { setBankImportLines([]); setBankImportError(''); setShowBankImport(true); }}
                            className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 whitespace-nowrap">
                            ↑ 匯入對帳單
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="overflow-y-auto max-h-[480px]">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-gray-50">
                          <tr className="text-gray-500">
                            <th className="px-3 py-2 text-left">狀態</th>
                            <th className="px-3 py-2 text-left">日期</th>
                            <th className="px-3 py-2 text-left">說明</th>
                            <th className="px-3 py-2 text-right">金額</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {bankLines.length === 0 && (
                            <tr><td colSpan={4} className="text-center py-8 text-gray-400">本月無存簿入帳資料</td></tr>
                          )}
                          {bankLines.map(l => {
                            const isUsed      = l.isUsed;
                            const isSuggested = !isUsed && [...suggestMap.values()].includes(l.id);
                            const isSelected  = dmSelLine === l.id;
                            const matchedTo   = lineMatchedByBnb.get(l.id);
                            let rowCls = 'transition-colors ';
                            if (isUsed) rowCls += 'bg-green-50 opacity-70';
                            else if (isSelected) rowCls += 'bg-indigo-100 cursor-pointer ring-1 ring-inset ring-indigo-300';
                            else if (isSuggested) rowCls += 'bg-amber-50 hover:bg-amber-100 cursor-pointer';
                            else rowCls += 'hover:bg-gray-50 cursor-pointer';
                            return (
                              <tr key={l.id} className={rowCls}
                                onClick={() => !isUsed && setDmSelLine(isSelected ? null : l.id)}>
                                <td className="px-3 py-2.5">
                                  {isUsed
                                    ? <span className="text-green-600 font-bold" title={`已配對：${matchedTo}`}>✓</span>
                                    : isSuggested
                                      ? <span className="text-amber-500">⚡</span>
                                      : <span className="text-gray-300">○</span>
                                  }
                                </td>
                                <td className="px-3 py-2.5 whitespace-nowrap text-gray-600">{l.txDate}</td>
                                <td className="px-3 py-2.5 max-w-[160px] truncate text-gray-500"
                                  title={l.description || ''}>
                                  {l.description || '—'}
                                  {isUsed && matchedTo && (
                                    <span className="ml-1 text-green-600">（{matchedTo}）</span>
                                  )}
                                </td>
                                <td className="px-3 py-2.5 text-right font-semibold text-blue-700">
                                  {l.creditAmount.toLocaleString()}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* ══ Tab: OTA比對 ══ */}
        {activeTab === 'otaRecon' && (
          <OtaReconTab
            otaSource={otaSource} setOtaSource={setOtaSource}
            otaDateFrom={otaDateFrom} setOtaDateFrom={setOtaDateFrom}
            otaDateTo={otaDateTo} setOtaDateTo={setOtaDateTo}
            otaWarehouse={otaWarehouse} setOtaWarehouse={setOtaWarehouse}
            otaFile={otaFile}
            onOtaFileChange={f => { setOtaFile(f); setOtaPreview(null); setOtaResult(null); }}
            otaPreview={otaPreview} otaPreviewLoading={otaPreviewLoading} previewOta={previewOta}
            otaResult={otaResult}
            otaLoading={otaLoading}
            otaMonth={otaMonth} setOtaMonth={setOtaMonth}
            otaViewTab={otaViewTab} setOtaViewTab={setOtaViewTab}
            commAmt={commAmt} setCommAmt={setCommAmt}
            commMethod={commMethod} setCommMethod={setCommMethod}
            commNote={commNote} setCommNote={setCommNote}
            commSubmitting={commSubmitting}
            commExisting={commExisting}
            reconcileConfirmed={reconcileConfirmed}
            reconcileConfirming={reconcileConfirming}
            warehouseList={warehouseList}
            runOtaReconcile={runOtaReconcile}
            confirmReconcile={confirmReconcile}
            submitCommission={submitCommission}
            cancelCommission={cancelCommission}
            openOtaEdit={openOtaEdit}
            openOtaAdd={openOtaAdd}
            deleteOtaBnb={deleteOtaBnb}
          />
        )}
        {/* ══ Tab: OTA傭金 ══ */}
        {activeTab === 'otaCommission' && (
          <OtaCommissionTab
            otaWarehouse={otaWarehouse} setOtaWarehouse={setOtaWarehouse}
            commSource={commSource} setCommSource={setCommSource}
            commHistRows={commHistRows} commHistLoading={commHistLoading}
            commEditId={commEditId} setCommEditId={setCommEditId}
            commEditData={commEditData} setCommEditData={setCommEditData}
            commEditSaving={commEditSaving}
            reconLogs={reconLogs} reconLogsLoading={reconLogsLoading}
            warehouseList={warehouseList}
            fetchCommHistory={fetchCommHistory}
            fetchReconLogs={fetchReconLogs}
            saveEditComm={saveEditComm}
            startEditComm={startEditComm}
            confirmCommission={confirmCommission}
            cancelCommission={cancelCommission}
          />
        )}
        {/* ══ Tab: 老闆收取 ══ */}
        {activeTab === 'bossWithdraw' && (
          <BossWithdrawTab
            bwData={bwData} bwLoading={bwLoading}
            bwMonth={bwMonth} setBwMonth={setBwMonth}
            bwWarehouse={bwWarehouse} setBwWarehouse={setBwWarehouse}
            bwViewMode={bwViewMode} setBwViewMode={setBwViewMode}
            bwYear={bwYear} setBwYear={setBwYear}
            bwSummary={bwSummary} bwSummaryLoad={bwSummaryLoad}
            warehouseList={warehouseList}
            fetchBossWithdraw={fetchBossWithdraw}
            fetchBossWithdrawSummary={fetchBossWithdrawSummary}
            showToast={showToast}
          />
        )}
        {/* ══ Tab: 其他收入 ══ */}
        {activeTab === 'otherIncome' && (
          <div>
            {/* 月固定費用模板 */}
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 mb-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-indigo-800">月固定費用模板</h4>
                <button onClick={() => { setShowRecurringMgr(!showRecurringMgr); if (!showRecurringMgr) fetchRecurringTemplates(); }}
                  className="text-xs text-indigo-600 border border-indigo-300 px-2.5 py-1 rounded hover:bg-indigo-100">
                  {showRecurringMgr ? '收起' : '管理模板'}
                </button>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <label className="text-xs text-indigo-700">建立月份草稿：</label>
                <input type="month" value={recurringDraftMonth} onChange={e => setRecurringDraftMonth(e.target.value)}
                  className="border border-indigo-300 rounded px-2 py-1 text-sm bg-white" />
                <button onClick={createRecurringDrafts} disabled={recurringDrafting}
                  className="px-3 py-1 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50">
                  {recurringDrafting ? '建立中…' : '建立本月草稿'}
                </button>
                <span className="text-xs text-indigo-500">（依模板建立草稿，已存在的自動跳過）</span>
              </div>
              {showRecurringMgr && (
                <div className="mt-4 space-y-3">
                  <div className="grid grid-cols-5 gap-2">
                    {[
                      { key: 'warehouse', placeholder: '館別', type: 'text' },
                      { key: 'category',  placeholder: '科目（如：清潔費）', type: 'text' },
                      { key: 'description', placeholder: '描述（如：清潔員薪資）', type: 'text' },
                      { key: 'defaultAmt', placeholder: '預設金額', type: 'number' },
                    ].map(f => (
                      <input key={f.key} type={f.type} placeholder={f.placeholder}
                        value={recurringForm[f.key]} onChange={e => setRecurringForm(p => ({ ...p, [f.key]: e.target.value }))}
                        className="border rounded px-2 py-1.5 text-sm" />
                    ))}
                    <button onClick={saveRecurringTemplate}
                      className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700">
                      新增
                    </button>
                  </div>
                  <div className="space-y-1">
                    {recurringTemplates.length === 0 && <p className="text-xs text-indigo-400">尚無模板</p>}
                    {recurringTemplates.map(t => (
                      <div key={t.id} className="flex items-center gap-3 bg-white rounded px-3 py-1.5 text-xs border border-indigo-100">
                        <span className="text-indigo-600 font-medium">{t.warehouse}</span>
                        <span className="text-gray-600">{t.category}</span>
                        <span className="text-gray-700 flex-1">{t.description}</span>
                        <span className="font-semibold text-indigo-700">NT${Number(t.defaultAmt).toLocaleString()}</span>
                        <button onClick={() => deleteRecurringTemplate(t.id)}
                          className="text-red-400 hover:text-red-600 hover:underline">停用</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {/* 篩選列 */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4 flex flex-wrap gap-3 items-end">
              <div>
                <label htmlFor="f-20" className="block text-xs text-gray-500 mb-1">月份</label>
                <input id="f-20" type="month" value={oiMonth} onChange={e => setOiMonth(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label htmlFor="f-21" className="block text-xs text-gray-500 mb-1">館別</label>
                <select id="f-21" value={oiWarehouse} onChange={e => setOiWarehouse(e.target.value)} className={inputCls}>
                  <option value="">全部</option>
                  {warehouseList.map(w => <option key={w} value={w}>{w}</option>)}
                </select>
                <WhQuickBtns list={warehouseList} value={oiWarehouse} onChange={setOiWarehouse} />
              </div>
              <button onClick={fetchOtherIncome} disabled={oiLoading}
                className={`${btnCls} bg-indigo-50 text-indigo-700 disabled:opacity-40`}>
                {oiLoading ? '載入中…' : '查詢'}
              </button>
              <button onClick={() => openOiModal(null)}
                className={`${btnCls} bg-indigo-600 text-white hover:bg-indigo-700`}>
                + 新增其他收入
              </button>
              {oiRows.length > 0 && (
                <ExportButtons
                  data={oiRows.map(r => ({ importMonth: r.importMonth, warehouse: r.warehouse, incomeDate: r.incomeDate, category: r.category || '', description: r.description, amount: r.amount, note: r.note || '' }))}
                  columns={[
                    { header: '月份',   key: 'importMonth' },
                    { header: '館別',   key: 'warehouse' },
                    { header: '日期',   key: 'incomeDate' },
                    { header: '類別',   key: 'category' },
                    { header: '說明',   key: 'description' },
                    { header: '金額',   key: 'amount', format: 'number' },
                    { header: '備註',   key: 'note' },
                  ]}
                  filename={`其他收入_${oiMonth}${oiWarehouse ? '_' + oiWarehouse : ''}`}
                  title={`其他收入 ${oiMonth}${oiWarehouse ? '　' + oiWarehouse : ''}`}
                />
              )}
              {oiRows.length > 0 && (
                <span className="text-sm text-gray-500 ml-2">
                  合計 <b className="text-indigo-700">{NT(oiRows.reduce((s, r) => s + Number(r.amount), 0))}</b>（{oiRows.length} 筆）
                </span>
              )}
            </div>

            {/* 資料表格 */}
            {oiLoading && <div className="text-center py-20 text-gray-400">載入中…</div>}
            {!oiLoading && oiRows.length === 0 && (
              <div className="text-center py-20 text-gray-400">請選擇月份後按「查詢」，或按「+ 新增其他收入」</div>
            )}
            {!oiLoading && oiRows.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 tbl-wrap">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-indigo-50">
                    <tr className="bg-indigo-50 text-indigo-800 text-xs">
                      <th className="px-3 py-2 text-left">月份</th>
                      <th className="px-3 py-2 text-left">館別</th>
                      <th className="px-3 py-2 text-left">日期</th>
                      <th className="px-3 py-2 text-left">類別</th>
                      <th className="px-3 py-2 text-left">說明</th>
                      <th className="px-3 py-2 text-right">金額</th>
                      <th className="px-3 py-2 text-left">備註</th>
                      <th className="px-3 py-2 text-center">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {oiRows.map(r => (
                      <tr key={r.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-xs text-gray-500">{r.importMonth}</td>
                        <td className="px-3 py-2 text-xs">{r.warehouse}</td>
                        <td className="px-3 py-2 text-xs text-gray-600">{r.incomeDate}</td>
                        <td className="px-3 py-2 text-xs">
                          {r.category ? <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-xs">{r.category}</span> : '—'}
                        </td>
                        <td className="px-3 py-2">{r.description}</td>
                        <td className="px-3 py-2 text-right font-medium text-indigo-700">{NT(r.amount)}</td>
                        <td className="px-3 py-2 text-xs text-gray-400">{r.note || '—'}</td>
                        <td className="px-3 py-2 text-center whitespace-nowrap">
                          <button onClick={() => openOiModal(r)}
                            className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 mr-1">編輯</button>
                          <button onClick={() => confirm(`確定刪除「${r.description}」？`, () => deleteOtherIncome(r.id), '刪除')}
                            className="text-xs px-2 py-1 rounded border border-red-200 text-red-400 hover:bg-red-50">刪除</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* 新增/編輯 Modal */}
            {oiModalOpen && (
              <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
                  <h3 className="text-lg font-bold mb-4">{oiEditRow ? '編輯其他收入' : '新增其他收入'}</h3>
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="f-22" className="block text-xs text-gray-500 mb-1">月份 *</label>
                        <input id="f-22" type="month" value={oiForm.importMonth} onChange={e => setOiForm(f => ({ ...f, importMonth: e.target.value }))} className="w-full border rounded-lg px-3 py-1.5 text-sm" />
                      </div>
                      <div>
                        <label htmlFor="f-23" className="block text-xs text-gray-500 mb-1">日期 *</label>
                        <input id="f-23" type="date" value={oiForm.incomeDate} onChange={e => setOiForm(f => ({ ...f, incomeDate: e.target.value }))} className="w-full border rounded-lg px-3 py-1.5 text-sm" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="f-24" className="block text-xs text-gray-500 mb-1">館別 *</label>
                        <select id="f-24" value={oiForm.warehouse} onChange={e => setOiForm(f => ({ ...f, warehouse: e.target.value }))} className="w-full border rounded-lg px-3 py-1.5 text-sm">
                          {warehouseList.map(w => <option key={w} value={w}>{w}</option>)}
                        </select>
                      </div>
                      <div>
                        <label htmlFor="f-35" className="block text-xs text-gray-500 mb-1">類別</label>
                        <select id="f-35" value={oiForm.category} onChange={e => setOiForm(f => ({ ...f, category: e.target.value }))} className="w-full border rounded-lg px-3 py-1.5 text-sm">
                          <option value="">請選擇</option>
                          {OI_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label htmlFor="f-36" className="block text-xs text-gray-500 mb-1">說明 *</label>
                      <input id="f-36" type="text" value={oiForm.description} onChange={e => setOiForm(f => ({ ...f, description: e.target.value }))}
                        placeholder="例：5月停車費" className="w-full border rounded-lg px-3 py-1.5 text-sm" />
                    </div>
                    <div>
                      <label htmlFor="f-37" className="block text-xs text-gray-500 mb-1">金額 *</label>
                      <input id="f-37" type="number" value={oiForm.amount} onChange={e => setOiForm(f => ({ ...f, amount: e.target.value }))}
                        placeholder="0" className="w-full border rounded-lg px-3 py-1.5 text-sm" />
                    </div>
                    <div>
                      <label htmlFor="f-38" className="block text-xs text-gray-500 mb-1">備註</label>
                      <input id="f-38" type="text" value={oiForm.note} onChange={e => setOiForm(f => ({ ...f, note: e.target.value }))}
                        className="w-full border rounded-lg px-3 py-1.5 text-sm" />
                    </div>
                  </div>
                  <div className="flex gap-3 mt-5">
                    <button onClick={saveOtherIncome} disabled={oiSaving}
                      className="flex-1 bg-indigo-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                      {oiSaving ? '儲存中…' : '儲存'}
                    </button>
                    <button onClick={() => setOiModalOpen(false)}
                      className="flex-1 border rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50">取消</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══ Tab: 訂房日曆 ══ */}
        {activeTab === 'analytics' && analyticsSub === 'calendar' && (
          <>
            {calOverflow && (
              <div className="mb-4 bg-amber-50 border border-amber-300 rounded-xl px-4 py-3">
                <span className="text-amber-700 font-medium text-sm">⚠ 資料超過 500 筆，部分訂房可能未顯示，請縮小篩選條件（選擇單一館別）</span>
              </div>
            )}
            <CalendarTab
              calYear={calYear} setCalYear={setCalYear}
              calMonth={calMonth} setCalMonth={setCalMonth}
              calWarehouse={calWarehouse} setCalWarehouse={setCalWarehouse}
              calData={calData} calLoading={calLoading}
              warehouseList={warehouseList}
            />
          </>
        )}
        {/* ══ Tab: 入住率統計 ══ */}
        {/* ══ Tab: 入住率統計 ══ */}
        {activeTab === 'analytics' && analyticsSub === 'occupancy' && (
          <OccupancyTab
            occYear={occYear} setOccYear={setOccYear}
            occWarehouse={occWarehouse} setOccWarehouse={setOccWarehouse}
            occData={occData} occLoading={occLoading}
            fetchOccupancy={fetchOccupancy} warehouseList={warehouseList}
          />
        )}

        {/* ══ Tab: 付款稽核 ══ */}
        {activeTab === 'payAudit' && (
          <>
            {auditOverflow && (
              <div className="mb-4 bg-amber-50 border border-amber-300 rounded-xl px-4 py-3">
                <span className="text-amber-700 font-medium text-sm">⚠ 資料超過 500 筆，部分記錄可能未顯示，請縮小篩選條件（選擇單一館別）</span>
              </div>
            )}
            <PayAuditTab
              auditMonth={auditMonth} setAuditMonth={setAuditMonth}
              auditWarehouse={auditWarehouse} setAuditWarehouse={setAuditWarehouse}
              auditData={auditData} auditLoading={auditLoading}
              fetchAudit={fetchAudit} warehouseList={warehouseList}
            />
          </>
        )}

        {/* ══ Tab: 來源分析 ══ */}
        {activeTab === 'analytics' && analyticsSub === 'sourceAnalysis' && (
          <SourceAnalysisTab
            saYear={saYear} setSaYear={setSaYear}
            saWarehouse={saWarehouse} setSaWarehouse={setSaWarehouse}
            saData={saData} saLoading={saLoading}
            fetchSourceAnalysis={fetchSourceAnalysis} warehouseList={warehouseList}
          />
        )}

        {/* ══ Tab: OTA收益分析 ══ */}
        {activeTab === 'analytics' && analyticsSub === 'otaAnalytics' && (
          <OtaAnalyticsTab
            oaYear={oaYear} setOaYear={setOaYear}
            oaWarehouse={oaWarehouse} setOaWarehouse={setOaWarehouse}
            oaData={oaData} oaPrevData={oaPrevData}
            oaCompare={oaCompare} setOaCompare={setOaCompare}
            oaLoading={oaLoading}
            fetchOtaAnalytics={fetchOtaAnalytics} warehouseList={warehouseList}
          />
        )}

        {/* ══ Tab: 收款分流 ══ */}
        {activeTab === 'analytics' && analyticsSub === 'paymentSplit' && (
          <PaymentSplitTab
            psYear={psYear} setPsYear={setPsYear}
            psWarehouse={psWarehouse} setPsWarehouse={setPsWarehouse}
            psData={psData} psLoading={psLoading}
            fetchPaymentSplit={fetchPaymentSplit} warehouseList={warehouseList}
          />
        )}

        {/* ══ Tab: 房客歷史 ══ */}
        {activeTab === 'guestHistory' && (
          <GuestHistoryTab
            ghSearch={ghSearch} setGhSearch={setGhSearch}
            ghData={ghData} ghLoading={ghLoading}
            ghSearched={ghSearched} fetchGuestHistory={fetchGuestHistory}
          />
        )}
      </main>

      {/* 付款明細 Modal */}
      {editRecord && (
        <PaymentModal
          key={editRecord.id}
          record={editRecord}
          onClose={() => setEditRecord(null)}
          onSaved={() => { setEditRecord(null); fetchRecords(); }}
        />
      )}

      {/* 編輯訂房 Modal（含 OTA 比對新增/編輯） */}
      {editBooking && (
        <BookingFormModal
          record={editBooking}
          warehouseList={warehouseList}
          roomNoList={roomNoList}
          existingRecords={records}
          onClose={() => setEditBooking(null)}
          onSaved={() => {
            setEditBooking(null);
            fetchRecords();
            if (activeTab === 'otaReconcile' && otaResult) runOtaReconcile();
          }}
        />
      )}

      {/* 新增訂房 Modal */}
      {addBookingOpen && (
        <BookingFormModal
          record={null}
          warehouseList={warehouseList}
          roomNoList={roomNoList}
          existingRecords={records}
          onClose={() => setAddBookingOpen(false)}
          onSaved={() => { setAddBookingOpen(false); fetchRecords(); }}
        />
      )}

      {/* ══ M9：鎖帳歷史 Modal ══ */}
      {showLockHistory && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]" onClick={() => setShowLockHistory(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-gray-800">鎖帳操作紀錄</h3>
              <button onClick={() => setShowLockHistory(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            {lockAudits.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">尚無紀錄</p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {lockAudits.map(a => (
                  <div key={a.id} className={`rounded-lg px-3 py-2 text-xs border ${a.action === 'lock' ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
                    <div className="flex items-center justify-between">
                      <span className={`font-semibold ${a.action === 'lock' ? 'text-red-700' : 'text-green-700'}`}>
                        {a.action === 'lock' ? '🔒 鎖帳' : '🔓 解鎖'}
                      </span>
                      <span className="text-gray-400">{new Date(a.performedAt).toLocaleString('zh-TW')}</span>
                    </div>
                    <div className="text-gray-600 mt-0.5">操作者：{a.performedBy}</div>
                    {a.reason && <div className="text-gray-700 mt-0.5">原因：{a.reason}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ M10：批次鎖帳 Modal ══ */}
      {showBatchLock && (
        <BnbBatchLockModal
          warehouseList={warehouseList}
          onClose={() => setShowBatchLock(false)}
          showToast={showToast}
        />
      )}

      {/* ══ 存簿比對：標記跳過 Modal ══ */}
      {dmMarkModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setDmMarkModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-[340px]" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-gray-800 mb-2">
              {dmMarkModal.skipType === 'next_month' ? '標記為跨月入帳' : '標記為無需配對'}
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              {dmMarkModal.skipType === 'next_month'
                ? '此筆款項下月才入帳存簿，本月暫不配對。'
                : '此筆款項為現金收帳或已另行處理，不需存簿配對。'}
            </p>
            <div className="mb-5">
              <label htmlFor="f-25" className="block text-xs text-gray-500 mb-1">備註（選填）</label>
              <input id="f-25"
                type="text"
                value={dmMarkNote}
                onChange={e => setDmMarkNote(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleMark()}
                placeholder="說明原因…"
                maxLength={255}
                autoFocus
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => { setDmMarkModal(null); setDmMarkNote(''); }}
                className="px-4 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
                取消
              </button>
              <button onClick={handleMark}
                className={`px-4 py-1.5 text-sm rounded-lg text-white ${dmMarkModal.skipType === 'next_month' ? 'bg-orange-500 hover:bg-orange-600' : 'bg-gray-600 hover:bg-gray-700'}`}>
                確認標記
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ 存簿對帳單匯入 Modal ══ */}
      {showBankImport && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowBankImport(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-800">↑ 匯入存簿對帳單</h3>
              <button onClick={() => setShowBankImport(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1">
              {/* 說明 */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
                <p className="font-medium mb-1">📥 土地銀行網路銀行下載步驟</p>
                <ol className="list-decimal ml-4 space-y-0.5 text-xs">
                  <li>登入土地銀行網銀 → 帳戶管理 → 存款交易明細</li>
                  <li>選擇帳戶（土海）、月份區間</li>
                  <li>點「匯出 Excel」下載 .xls 檔</li>
                  <li>上傳至此處即可</li>
                </ol>
              </div>

              {/* 匯入月份/帳戶 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="f-26" className="block text-xs text-gray-500 mb-1">月份</label>
                  <input id="f-26" type="month" value={dmMonth} onChange={e => setDmMonth(e.target.value)}
                    className="w-full border rounded-lg px-3 py-1.5 text-sm" />
                </div>
                <div>
                  <label htmlFor="f-27" className="block text-xs text-gray-500 mb-1">存簿帳戶 *</label>
                  <select id="f-27" value={dmAccountId} onChange={e => setDmAccountId(e.target.value)}
                    className="w-full border rounded-lg px-3 py-1.5 text-sm">
                    <option value="">請選擇帳戶</option>
                    {dmAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
              </div>

              {/* 檔案選擇 */}
              <div>
                <label htmlFor="xls-xlsx-csv" className="block text-sm font-medium text-gray-700 mb-1">選擇檔案（.xls / .xlsx / .csv）</label>
                <input id="xls-xlsx-csv" type="file" accept=".xls,.xlsx,.csv"
                  onChange={handleBankFileUpload}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
                {bankImportParsing && <p className="text-xs text-blue-500 mt-1">解析中…</p>}
                {bankImportError && <p className="text-xs text-red-500 mt-1">{bankImportError}</p>}
              </div>

              {/* 解析預覽 */}
              {bankImportLines.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">
                    預覽：共 {bankImportLines.length} 筆
                    （存入 {bankImportLines.filter(l => l.creditAmount > 0).length} 筆 /
                    支出 {bankImportLines.filter(l => l.debitAmount > 0).length} 筆）
                  </p>
                  <div className="border rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left">日期</th>
                          <th className="px-3 py-2 text-left">說明</th>
                          <th className="px-3 py-2 text-right text-green-700">存入</th>
                          <th className="px-3 py-2 text-right text-red-600">支出</th>
                          <th className="px-3 py-2 text-right">餘額</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {bankImportLines.map((l, i) => (
                          <tr key={i} className={l.creditAmount > 0 ? 'bg-green-50/30' : ''}>
                            <td className="px-3 py-1.5 whitespace-nowrap">{l.txDate}</td>
                            <td className="px-3 py-1.5 max-w-[200px] truncate" title={l.description}>{l.description}</td>
                            <td className="px-3 py-1.5 text-right text-green-700">{l.creditAmount > 0 ? l.creditAmount.toLocaleString() : ''}</td>
                            <td className="px-3 py-1.5 text-right text-red-600">{l.debitAmount > 0 ? l.debitAmount.toLocaleString() : ''}</td>
                            <td className="px-3 py-1.5 text-right text-gray-500">{l.runningBalance ? l.runningBalance.toLocaleString() : ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-3">
              <button onClick={() => setShowBankImport(false)}
                className="px-4 py-2 text-sm bg-gray-200 rounded-lg hover:bg-gray-300">取消</button>
              <button onClick={submitBankImport}
                disabled={bankImportLines.length === 0 || !dmAccountId || bankImportSubmitting}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40">
                {bankImportSubmitting ? '匯入中…' : bankImportLines.length === 0 ? '請先上傳檔案' : !dmAccountId ? '請選擇帳戶' : `確認匯入 ${bankImportLines.length} 筆`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <React.Suspense fallback={<div className="p-8 text-center text-gray-400">載入中…</div>}>
      <BnbPage />
    </React.Suspense>
  );
}
