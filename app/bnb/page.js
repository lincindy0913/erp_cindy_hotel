'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Navigation from '@/components/Navigation';
import FetchErrorBanner from '@/components/FetchErrorBanner';
import ModuleGuideCard from '@/components/ModuleGuideCard';
import HelpButton from '@/components/HelpButton';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import ExportButtons from '@/components/ExportButtons';
import PaymentModal from './_components/PaymentModal';
import BookingFormModal from './_components/BookingFormModal';
import BnbBatchLockModal from './_components/BnbBatchLockModal';
import WhQuickBtns from './_components/WhQuickBtns';
import { todayStr } from '@/lib/localDate';
import { openPrintWindow } from '@/lib/printWindow';
import { useDepositMatch } from './_hooks/useDepositMatch';
import { useBnbRecords } from './_hooks/useBnbRecords';
import { useBnbAnalytics } from './_hooks/useBnbAnalytics';
import { useBnbCalendar } from './_hooks/useBnbCalendar';
import { useOtaReconcile } from './_hooks/useOtaReconcile';
import { useOtherIncome } from './_hooks/useOtherIncome';
import { BNB_SOURCES, BNB_SOURCE_COLORS } from './_constants';
import RecordsTab       from './_tabs/RecordsTab';
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
import DailyRevTab      from './_tabs/DailyRevTab';
import MonthlySummaryTab from './_tabs/MonthlySummaryTab';
import PnlTab           from './_tabs/PnlTab';
import DeclarationTab   from './_tabs/DeclarationTab';
import AnnualDeclListTab from './_tabs/AnnualDeclListTab';
import DepositMatchTab  from './_tabs/DepositMatchTab';
import OtherIncomeTab  from './_tabs/OtherIncomeTab';

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
  { key: 'records',       label: '訂房明細',  group: '日常' },
  { key: 'otherIncome',   label: '其他收入',  group: '日常' },
  { key: 'deposit',       label: '訂金核對',  group: '日常' },
  { key: 'otaRecon',      label: 'OTA比對',   group: 'OTA' },
  { key: 'otaCommission', label: 'OTA傭金',   group: 'OTA' },
  { key: 'analytics',     label: '分析',      group: '分析申報' },
  { key: 'declaration',   label: '旅宿網申報', group: '分析申報' },
  { key: 'bossWithdraw',  label: '老闆收取',  group: '稽核' },
  { key: 'payAudit',      label: '付款稽核',  group: '稽核' },
  { key: 'guestHistory',  label: '房客歷史',  group: '稽核' },
];

/** 分析分頁內子分頁（每日收入、報表與統計） */
const ANALYTICS_SUB_TABS = [
  { key: 'dailyRev',       label: '每日收入',    group: '報表' },
  { key: 'monthly',        label: '月收入總表',  group: '報表' },
  { key: 'pnl',            label: '月收支總表',  group: '報表' },
  { key: 'declList',       label: '年度申報總表', group: '報表' },
  { key: 'sourceAnalysis', label: '來源分析',    group: '統計圖表' },
  { key: 'otaAnalytics',   label: 'OTA收益分析', group: '統計圖表' },
  { key: 'paymentSplit',   label: '收款分流',    group: '統計圖表' },
  { key: 'occupancy',      label: '入住率統計',  group: '統計圖表' },
  { key: 'calendar',       label: '訂房日曆',    group: '統計圖表' },
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
    if (!openPrintWindow(title, headers, rows)) showToast('請允許彈出視窗以進行列印', 'error');
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
    recLoading, recError, recPage, recTotal,
    filterMonth, setFilterMonth,
    filterSource, setFilterSource,
    filterStatus, setFilterStatus,
    filterWarehouse, setFilterWarehouse,
    filterPayment, setFilterPayment,
    pageSize, setPageSize,
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
    occYear, setOccYear, occWarehouse, setOccWarehouse, occData, occLoading, occError, fetchOccupancy,
    saYear, setSaYear, saWarehouse, setSaWarehouse, saData, saLoading, saError, fetchSourceAnalysis,
    oaYear, setOaYear, oaWarehouse, setOaWarehouse, oaData, oaPrevData, oaCompare, setOaCompare, oaLoading, oaError, fetchOtaAnalytics,
    psYear, setPsYear, psWarehouse, setPsWarehouse, psData, psLoading, psError, fetchPaymentSplit,
    auditMonth, setAuditMonth, auditWarehouse, setAuditWarehouse, auditData, auditLoading, auditOverflow, auditError, fetchAudit,
    ghSearch, setGhSearch, ghData, ghLoading, ghSearched, ghError, fetchGuestHistory,
    summaryYear, setSummaryYear, summaryWarehouse, setSummaryWarehouse, summaryMode, setSummaryMode,
    summaryRows, summaryLoading, summaryFixedHelp, summaryError, fetchSummary,
  } = useBnbAnalytics({ showToast });

  // ── 館別清單 state ────────────────────────────────────────────
  const [warehouseList, setWarehouseList] = useState([]);

  // ── 訂金核對（已拆至 _hooks/useDepositMatch）────────────────────
  const {
    dmMonth, setDmMonth, dmWarehouse, setDmWarehouse,
    dmAccountId, setDmAccountId, dmData, setDmData,
    dmLoading, dmError, dmAccounts, dmSelBnb, setDmSelBnb,
    dmSelLine, setDmSelLine, dmMatching, dmPayType, setDmPayType,
    dmMarkModal, setDmMarkModal, dmMarkNote, setDmMarkNote,
    fetchDepositMatch, handleMatch, handleUnmatch,
    handleMark, handleClearMark, handleAutoMatch,
    ledgerMonthFrom, setLedgerMonthFrom,
    ledgerMonthTo,   setLedgerMonthTo,
    ledgerWarehouse, setLedgerWarehouse,
    ledgerRows,      ledgerLoading,
    fetchLedger,
    showBankImport,      setShowBankImport,
    bankImportLines,     setBankImportLines,
    bankImportParsing,
    bankImportSubmitting,
    bankImportError,     setBankImportError,
    handleBankFileUpload,
    submitBankImport,
  } = useDepositMatch();

  // ── 老闆收取 state ───────────────────────────────────────────
  const [bwMonth,       setBwMonth]       = useState(() => todayStr().slice(0, 7));
  const [bwWarehouse,   setBwWarehouse]   = useState('');
  const [bwViewMode,    setBwViewMode]    = useState('detail');
  const [bwYear,        setBwYear]        = useState(() => String(new Date().getFullYear()));
  const [bwData,        setBwData]        = useState(null);
  const [bwLoading,     setBwLoading]     = useState(false);
  const [bwError,       setBwError]       = useState(null);
  const [bwSummary,     setBwSummary]     = useState(null);
  const [bwSummaryLoad, setBwSummaryLoad] = useState(false);

  const fetchBossWithdraw = useCallback(async () => {
    setBwLoading(true);
    setBwError(null);
    try {
      const q = new URLSearchParams({ month: bwMonth });
      if (bwWarehouse) q.set('warehouse', bwWarehouse);
      const res = await fetch(`/api/bnb/boss-withdraw?${q}`);
      if (!res.ok) { setBwError('載入老闆收取失敗，請稍後再試'); return; }
      setBwData(await res.json());
    } catch { setBwError('載入老闆收取失敗'); } finally { setBwLoading(false); }
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

  // ── 其他收入 + 月固定費用模板 hook ───────────────────────────
  const {
    oiMonth, setOiMonth, oiWarehouse, setOiWarehouse,
    oiRows, oiLoading, oiError, fetchOtherIncome,
    oiModalOpen, setOiModalOpen, oiEditRow,
    oiForm, setOiForm, oiSaving,
    openOiModal, saveOtherIncome, deleteOtherIncome,
    recurringTemplates, recurringError, showRecurringMgr, setShowRecurringMgr,
    recurringForm, setRecurringForm,
    recurringDraftMonth, setRecurringDraftMonth, recurringDrafting,
    fetchRecurringTemplates, saveRecurringTemplate,
    deleteRecurringTemplate, createRecurringDrafts,
    OI_CATEGORIES,
  } = useOtherIncome({ showToast, defaultWarehouse: DEFAULT_WAREHOUSE });

  const thisMonth = todayStr().slice(0, 7);

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
  const [declError,   setDeclError]   = useState(null);

  // ── 年度申報總覽 state ─────────────────────────────────────
  const [dlYear,    setDlYear]    = useState(() => new Date().getFullYear().toString());
  const [dlWarehouse, setDlWarehouse] = useState(DEFAULT_WAREHOUSE);
  const [dlRows,    setDlRows]    = useState([]);
  const [dlLoading, setDlLoading] = useState(false);
  const [dlError,   setDlError]   = useState(null);

  // ── OTA 比對 + 傭金 hook ────────────────────────────────────
  const {
    otaSource, setOtaSource, otaDateFrom, setOtaDateFrom, otaDateTo, setOtaDateTo,
    otaWarehouse, setOtaWarehouse, otaFile, setOtaFile, otaPreview, otaPreviewLoading,
    otaResult, otaLoading, otaError, otaMonth, setOtaMonth, otaViewTab, setOtaViewTab,
    previewOta, runOtaReconcile, confirmReconcile, reconcileConfirmed, reconcileConfirming,
    openOtaEdit, deleteOtaBnb, openOtaAdd,
    reconLogs, reconLogsLoading, reconLogsError, fetchReconLogs,
    commAmt, setCommAmt, commMethod, setCommMethod, commNote, setCommNote,
    commSubmitting, commExisting, commSource, setCommSource,
    commHistRows, commHistLoading, commHistError, commEditId, setCommEditId, commEditData, setCommEditData, commEditSaving,
    submitCommission, fetchCommHistory, confirmCommission, cancelCommission,
    startEditComm, saveEditComm,
  } = useOtaReconcile({ showToast, confirm, setEditBooking, DEFAULT_WAREHOUSE });

  // ── 鎖帳 state ──────────────────────────────────────────────
  const [lockStatus, setLockStatus]       = useState(null);
  const [lockAudits, setLockAudits]       = useState([]);
  const [showLockHistory, setShowLockHistory] = useState(false);
  const [showBatchLock, setShowBatchLock]     = useState(false);
  const [lockLoading, setLockLoading] = useState(false);

  // ── 匯入 state ────────────────────────────────────────────────
  const [importMonth,     setImportMonth]     = useState(() => todayStr().slice(0, 7));
  const [importWarehouse, setImportWarehouse] = useState(DEFAULT_WAREHOUSE);
  const [importFile,      setImportFile]      = useState(null);
  const [importReplace,   setImportReplace]   = useState(false);
  const [importPreview,   setImportPreview]   = useState(null);
  const [importResult,    setImportResult]    = useState(null);
  const [importConfirm,   setImportConfirm]   = useState(null);
  const [showImportPanel, setShowImportPanel] = useState(false);
  const [importing,       setImporting]       = useState(false);
  const [importHistory,   setImportHistory]   = useState(() => {
    try { return JSON.parse(localStorage.getItem('bnb_import_history') || '[]'); } catch { return []; }
  });

  // ── 每日收入 state ────────────────────────────────────────────
  const [drMonth,     setDrMonth]     = useState(() => todayStr().slice(0, 7));
  const [drWarehouse, setDrWarehouse] = useState(DEFAULT_WAREHOUSE);
  const [drLoading,   setDrLoading]   = useState(false);
  const [drData,      setDrData]      = useState(null);
  const [drError,     setDrError]     = useState(null);
  const [drExpandDay, setDrExpandDay] = useState(null);

  // ── 訂房日曆 hook ─────────────────────────────────────────────
  const {
    calYear, setCalYear, calMonth, setCalMonth,
    calWarehouse, setCalWarehouse,
    calData, calLoading, calError, calOverflow,
    fetchCalendar,
  } = useBnbCalendar();

  // ── 館別清單（session 載入後才 fetch，否則會 401）────────────
  useEffect(() => {
    if (!session) return;
    fetch('/api/warehouse-departments')
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
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
      .catch(e => {
        console.error('[bnb] failed to load warehouse list', e);
        showToast('館別清單載入失敗，館別選單可能無選項，請重新整理頁面。', 'error');
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockStatus, lockLoading, getActiveLockContext]);

  // ── 月彙整 fetch ──────────────────────────────────────────────



  const fetchDailyRevenue = useCallback(async () => {
    setDrLoading(true);
    setDrExpandDay(null);
    setDrError(null);
    try {
      const p = new URLSearchParams({ month: drMonth });
      if (drWarehouse) p.set('warehouse', drWarehouse);
      const res = await fetch(`/api/bnb/daily-revenue?${p}`);
      if (!res.ok) { const msg = '載入每日收入失敗，請稍後再試'; setDrError(msg); showToast(msg, 'error'); return; }
      setDrData(await res.json());
    } catch { const msg = '載入每日收入失敗'; setDrError(msg); showToast(msg, 'error'); }
    finally { setDrLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drMonth, drWarehouse]);

  // ── 旅宿網申報 fetch（實際 + 已存報表）─────────────────────────
  const fetchDecl = useCallback(async () => {
    setDeclLoading(true);
    setDeclSearched(true);
    setDeclError(null);
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
    } catch { setDeclError('載入旅宿網申報資料失敗，請稍後再試'); }
    finally { setDeclLoading(false); }
  }, [declMonth, declWarehouse]);

  const fetchDeclList = useCallback(async () => {
    setDlLoading(true);
    setDlError(null);
    try {
      const res = await fetch(`/api/bnb/declaration-list?year=${dlYear}&warehouse=${encodeURIComponent(dlWarehouse)}`);
      if (!res.ok) { setDlError('載入年度申報總覽失敗，請稍後再試'); return; }
      const data = await res.json();
      setDlRows(data.rows || []);
    } catch { setDlError('載入年度申報總覽失敗'); }
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, analyticsSub]);

  useEffect(() => {
    const ctx = getActiveLockContext();
    fetchLockStatus(ctx.month, ctx.warehouse);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, filterMonth, declMonth, declWarehouse, dmMonth, dmWarehouse]);

  useEffect(() => {
    if (activeTab === 'records') { setSelectedIds(new Set()); fetchRecords(); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

    // ── 選檔後立即查覆蓋筆數（若 importReplace=true）──────────
    if (importReplace) {
      try {
        const res = await fetch(`/api/bnb/import?importMonth=${importMonth}&warehouse=${encodeURIComponent(importWarehouse)}`);
        const data = await res.json();
        if (data.count > 0) setImportConfirm({ existingCount: data.count });
      } catch (e) { console.warn('[bnb import] pre-check failed:', e.message); }
    }

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

  // ── 匯入（覆蓋確認已在選檔時完成，這裡直接執行）──────────────
  async function handleImport() {
    if (!importFile) { showToast('請選擇檔案', 'error'); return; }
    // importConfirm 若存在且使用者尚未確認則先等確認
    if (importReplace && importConfirm) return; // UI 會顯示確認框讓使用者按
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
  const _today = todayStr();
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
    if (r.status === '已退房' && !r.paymentFilled && !r.isComplimentary && r.checkOutDate && r.checkOutDate < _today) acc.overdueUnpaid++;
    if (Number(r.payCard) > 0 && !r.cardSettlementDate) acc.cardDateMissing++;
    const pt = Number(r.payDeposit) + Number(r.payTransfer) + Number(r.payCard) + Number(r.payCash) + Number(r.payVoucher);
    const ct = Number(r.roomCharge) + Number(r.otherCharge);
    if (r.paymentFilled && !r.isComplimentary && Math.abs(pt - ct) > 0.01) acc.mismatch++;
    return acc;
  }, { rooms: 0, revenue: 0, deposit: 0, transfer: 0, card: 0, cash: 0, voucher: 0, cardFee: 0, unfilled: 0, complimentary: 0, locked: 0, mismatch: 0, overdueUnpaid: 0, cardDateMissing: 0 });

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
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">民宿帳</h2>
            <p className="text-sm text-gray-500 mt-1">訂房收入、付款明細、月收支總表、旅宿網申報</p>
          </div>
          <HelpButton anchor="十五民宿帳務" className="mt-1" />
        </div>

        <ModuleGuideCard
          title="標準月底流程說明"
          color="blue"
          storageKey="guide:bnb:monthly"
          steps={[
            {
              label: '訂房明細',
              desc: '逐筆登錄或批次匯入訂房記錄 → 填寫付款方式與實收金額 → 確認總額與 PMS 系統相符',
            },
            {
              label: '訂金核對',
              desc: '至「訂金核對」分頁，將銀行流水（匯款、信用卡）與訂金／尾款逐筆配對，未配對者需手動確認或補登',
            },
            {
              label: 'OTA 比對',
              desc: '上傳 Booking.com 對帳單 → 系統自動比對差異 → 確認後至「OTA傭金」分頁送出佣金。目前僅支援 Booking.com。',
            },
            {
              label: '付款稽核',
              desc: '至「付款稽核」分頁，查找未填款項、金額不符或已退房未收款的訂單，逐一補正',
            },
            {
              label: '鎖帳與申報',
              desc: '確認無誤後執行「鎖帳此月」→ 至分析頁確認月收支總表 → 完成旅宿網月營業額申報',
              link: { href: '/manual#十五民宿帳務', text: '查看手冊說明' },
            },
          ]}
        />

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
          {TABS.map((t, i) => {
            const prevGroup = i > 0 ? TABS[i - 1].group : null;
            const showDivider = prevGroup && t.group !== prevGroup;
            return (
              <span key={t.key} className="flex items-center">
                {showDivider && <span className="w-px h-6 bg-gray-200 mx-1 self-center" aria-hidden />}
                <button onClick={() => {
                  setActiveTab(t.key);
                  const url = t.key === 'analytics' ? `?tab=analytics&sub=${analyticsSub}` : `?tab=${t.key}`;
                  router.replace(url, { scroll: false });
                }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                    activeTab === t.key ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                  title={t.group}>
                  {t.label}
                </button>
              </span>
            );
          })}
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
              {lockLoading ? `${getActiveLockContext().month} 處理中…` : isLocked ? '解鎖此月' : '鎖帳此月'}
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
          <div className="mb-6 bg-indigo-50/80 rounded-xl border border-indigo-100 p-1.5 space-y-1">
            {['報表', '統計圖表'].map(grp => (
              <div key={grp} className="flex flex-wrap items-center gap-1">
                <span className="text-[10px] text-indigo-400 font-medium w-14 shrink-0 pl-1">{grp}</span>
                {ANALYTICS_SUB_TABS.filter(st => st.group === grp).map(st => (
                  <button
                    key={st.key}
                    type="button"
                    onClick={() => { setAnalyticsSub(st.key); router.replace(`?tab=analytics&sub=${st.key}`, { scroll: false }); }}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                      analyticsSub === st.key ? 'bg-indigo-700 text-white shadow-sm' : 'text-indigo-900/80 hover:bg-white/80'
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* ══ Tab: 訂房明細 ══ */}
        {activeTab === 'records' && (
          <RecordsTab
            records={records}
            recLoading={recLoading} recError={recError} recPage={recPage} recTotal={recTotal}
            filterMonth={filterMonth} setFilterMonth={setFilterMonth}
            filterSource={filterSource} setFilterSource={setFilterSource}
            filterStatus={filterStatus} setFilterStatus={setFilterStatus}
            filterWarehouse={filterWarehouse} setFilterWarehouse={setFilterWarehouse}
            filterPayment={filterPayment} setFilterPayment={setFilterPayment}
            pageSize={pageSize} setPageSize={setPageSize}
            selectedIds={selectedIds} setSelectedIds={setSelectedIds}
            batchField={batchField} setBatchField={setBatchField}
            batchValue={batchValue} setBatchValue={setBatchValue}
            batchApplying={batchApplying}
            inlineEdit={inlineEdit} setInlineEdit={setInlineEdit}
            editMode={editMode} editMap={editMap} dirtyIds={dirtyIds}
            batchSaving={batchSaving} locking={locking} rowErrors={rowErrors} roomNoList={roomNoList}
            fetchRecords={fetchRecords}
            handleBatchApply={handleBatchApply} handleInlineSave={handleInlineSave}
            enterEditMode={enterEditMode} cancelEditMode={cancelEditMode}
            updateCell={updateCell} focusPayCell={focusPayCell}
            handlePayKeyDown={handlePayKeyDown} saveAllEdits={saveAllEdits}
            handleLockToggle={handleLockToggle} lockAllFilled={lockAllFilled}
            handleUnlockRow={handleUnlockRow} handleDelete={handleDelete} handleRestore={handleRestore}
            editRecord={editRecord} setEditRecord={setEditRecord}
            editBooking={editBooking} setEditBooking={setEditBooking}
            addBookingOpen={addBookingOpen} setAddBookingOpen={setAddBookingOpen}
            importMonth={importMonth} setImportMonth={setImportMonth}
            importWarehouse={importWarehouse} setImportWarehouse={setImportWarehouse}
            importFile={importFile} setImportFile={setImportFile}
            importReplace={importReplace} setImportReplace={setImportReplace}
            importPreview={importPreview} setImportPreview={setImportPreview}
            importResult={importResult} setImportResult={setImportResult}
            importConfirm={importConfirm} setImportConfirm={setImportConfirm}
            showImportPanel={showImportPanel} setShowImportPanel={setShowImportPanel}
            importing={importing}
            importHistory={importHistory} setImportHistory={setImportHistory}
            handleFileSelect={handleFileSelect}
            handleImport={handleImport}
            doImport={doImport}
            canLock={canLock}
            isLocked={isLocked}
            monthLocked={monthLocked}
            warehouseList={warehouseList}
            recStats={recStats}
            roomStats={roomStats}
            setActiveTab={setActiveTab} router={router}
            doPrint={doPrint}
            onGoToPayAudit={() => { setActiveTab('payAudit'); router.replace('?tab=payAudit', { scroll: false }); }}
            onGoToDeposit={() => { setActiveTab('deposit'); router.replace('?tab=deposit', { scroll: false }); }}
          />
        )}

        {/* ══ Tab: 每日收入 ══ */}
        {activeTab === 'analytics' && analyticsSub === 'dailyRev' && (
          <DailyRevTab
            drMonth={drMonth} setDrMonth={setDrMonth}
            drWarehouse={drWarehouse} setDrWarehouse={setDrWarehouse}
            drData={drData} drLoading={drLoading} drError={drError}
            drExpandDay={drExpandDay} setDrExpandDay={setDrExpandDay}
            fetchDailyRevenue={fetchDailyRevenue}
            warehouseList={warehouseList}
            doPrint={doPrint}
          />
        )}

        {/* ══ Tab: 月收入總表 ══ */}
        {activeTab === 'analytics' && analyticsSub === 'monthly' && (
          <MonthlySummaryTab
            summaryYear={summaryYear} setSummaryYear={setSummaryYear}
            summaryWarehouse={summaryWarehouse} setSummaryWarehouse={setSummaryWarehouse}
            summaryRows={summaryRows} summaryLoading={summaryLoading} summaryError={summaryError}
            fetchSummary={fetchSummary}
            warehouseList={warehouseList}
            doPrint={doPrint}
          />
        )}

        {/* ══ Tab: 損益表（月報 / 年報）══ */}
        {activeTab === 'analytics' && analyticsSub === 'pnl' && (
          <PnlTab
            summaryMode={summaryMode} setSummaryMode={setSummaryMode}
            summaryYear={summaryYear} setSummaryYear={setSummaryYear}
            summaryWarehouse={summaryWarehouse} setSummaryWarehouse={setSummaryWarehouse}
            summaryRows={summaryRows} summaryLoading={summaryLoading} summaryError={summaryError}
            summaryFixedHelp={summaryFixedHelp}
            fetchSummary={fetchSummary}
            warehouseList={warehouseList}
            doPrint={doPrint}
          />
        )}

        {/* ══ Tab: 旅宿網申報 ══ */}
        {activeTab === 'declaration' && (
          <DeclarationTab
            declMonth={declMonth} setDeclMonth={setDeclMonth}
            declWarehouse={declWarehouse} setDeclWarehouse={setDeclWarehouse}
            declLoading={declLoading} declError={declError}
            declSearched={declSearched} setDeclSearched={setDeclSearched}
            declActual={declActual}
            declForm={declForm} setDeclForm={setDeclForm}
            declSaving={declSaving}
            fetchDecl={fetchDecl}
            handleAutoFillDecl={handleAutoFillDecl}
            handleDeclSave={handleDeclSave}
            warehouseList={warehouseList}
            isLocked={isLocked}
            doPrint={doPrint}
          />
        )}

                {/* ══ Tab: 年度申報總覽 ══ */}
        {activeTab === 'analytics' && analyticsSub === 'declList' && (
          <AnnualDeclListTab
            dlYear={dlYear} setDlYear={setDlYear}
            dlWarehouse={dlWarehouse} setDlWarehouse={setDlWarehouse}
            dlRows={dlRows} dlLoading={dlLoading} dlError={dlError}
            fetchDeclList={fetchDeclList}
            warehouseList={warehouseList}
            doPrint={doPrint}
          />
        )}

        {/* ══ Tab: 訂金核對 ══ */}
        {activeTab === 'deposit' && (
          <DepositMatchTab
            dmMonth={dmMonth} setDmMonth={setDmMonth}
            dmWarehouse={dmWarehouse} setDmWarehouse={setDmWarehouse}
            dmAccountId={dmAccountId} setDmAccountId={setDmAccountId}
            dmData={dmData} setDmData={setDmData}
            dmLoading={dmLoading} dmError={dmError}
            dmAccounts={dmAccounts}
            dmSelBnb={dmSelBnb} setDmSelBnb={setDmSelBnb}
            dmSelLine={dmSelLine} setDmSelLine={setDmSelLine}
            dmMatching={dmMatching}
            dmPayType={dmPayType} setDmPayType={setDmPayType}
            dmMarkModal={dmMarkModal} setDmMarkModal={setDmMarkModal}
            dmMarkNote={dmMarkNote} setDmMarkNote={setDmMarkNote}
            fetchDepositMatch={fetchDepositMatch}
            handleMatch={handleMatch}
            handleUnmatch={handleUnmatch}
            handleMark={handleMark}
            handleClearMark={handleClearMark}
            handleAutoMatch={handleAutoMatch}
            warehouseList={warehouseList}
            isLocked={isLocked}
            onGoToBooking={(bookingId) => {
              setFilterMonth(dmMonth);
              setActiveTab('records');
              router.replace('?tab=records', { scroll: false });
            }}
            ledgerMonthFrom={ledgerMonthFrom} setLedgerMonthFrom={setLedgerMonthFrom}
            ledgerMonthTo={ledgerMonthTo}     setLedgerMonthTo={setLedgerMonthTo}
            ledgerWarehouse={ledgerWarehouse} setLedgerWarehouse={setLedgerWarehouse}
            ledgerRows={ledgerRows}
            ledgerLoading={ledgerLoading}
            fetchLedger={fetchLedger}
            showBankImport={showBankImport} setShowBankImport={setShowBankImport}
            bankImportLines={bankImportLines} setBankImportLines={setBankImportLines}
            bankImportParsing={bankImportParsing}
            bankImportSubmitting={bankImportSubmitting}
            bankImportError={bankImportError} setBankImportError={setBankImportError}
            handleBankFileUpload={handleBankFileUpload}
            submitBankImport={submitBankImport}
          />
        )}

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
            otaError={otaError}
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
            onGoToCommission={() => { setCommSource(otaSource); setActiveTab('otaCommission'); router.replace('?tab=otaCommission', { scroll: false }); }}
          />
        )}
        {/* ══ Tab: OTA傭金 ══ */}
        {activeTab === 'otaCommission' && (
          <OtaCommissionTab
            otaWarehouse={otaWarehouse} setOtaWarehouse={setOtaWarehouse}
            commSource={commSource} setCommSource={setCommSource}
            commHistRows={commHistRows} commHistLoading={commHistLoading} commHistError={commHistError}
            commEditId={commEditId} setCommEditId={setCommEditId}
            commEditData={commEditData} setCommEditData={setCommEditData}
            commEditSaving={commEditSaving}
            reconLogs={reconLogs} reconLogsLoading={reconLogsLoading} reconLogsError={reconLogsError}
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
            bwData={bwData} bwLoading={bwLoading} bwError={bwError}
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
          <OtherIncomeTab
            oiRows={oiRows}
            oiLoading={oiLoading}
            oiError={oiError}
            fetchOtherIncome={fetchOtherIncome}
            oiMonth={oiMonth}
            setOiMonth={setOiMonth}
            oiWarehouse={oiWarehouse}
            setOiWarehouse={setOiWarehouse}
            oiModalOpen={oiModalOpen}
            setOiModalOpen={setOiModalOpen}
            oiEditRow={oiEditRow}
            oiForm={oiForm}
            setOiForm={setOiForm}
            oiSaving={oiSaving}
            saveOtherIncome={saveOtherIncome}
            deleteOtherIncome={deleteOtherIncome}
            openOiModal={openOiModal}
            recurringTemplates={recurringTemplates}
            recurringError={recurringError}
            showRecurringMgr={showRecurringMgr}
            setShowRecurringMgr={setShowRecurringMgr}
            recurringForm={recurringForm}
            setRecurringForm={setRecurringForm}
            fetchRecurringTemplates={fetchRecurringTemplates}
            saveRecurringTemplate={saveRecurringTemplate}
            deleteRecurringTemplate={deleteRecurringTemplate}
            recurringDraftMonth={recurringDraftMonth}
            setRecurringDraftMonth={setRecurringDraftMonth}
            recurringDrafting={recurringDrafting}
            createRecurringDrafts={createRecurringDrafts}
            warehouseList={warehouseList}
            showToast={showToast}
            confirm={confirm}
          />
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
              calData={calData} calLoading={calLoading} calError={calError}
              fetchCalendar={fetchCalendar}
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
            occData={occData} occLoading={occLoading} occError={occError}
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
              auditData={auditData} auditLoading={auditLoading} auditError={auditError}
              fetchAudit={fetchAudit} warehouseList={warehouseList}
              onGoToRecords={(filter) => {
                setFilterPayment(filter);
                setFilterMonth(auditMonth);
                setActiveTab('records');
                router.replace('?tab=records', { scroll: false });
              }}
            />
          </>
        )}

        {/* ══ Tab: 來源分析 ══ */}
        {activeTab === 'analytics' && analyticsSub === 'sourceAnalysis' && (
          <SourceAnalysisTab
            saYear={saYear} setSaYear={setSaYear}
            saWarehouse={saWarehouse} setSaWarehouse={setSaWarehouse}
            saData={saData} saLoading={saLoading} saError={saError}
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
            oaLoading={oaLoading} oaError={oaError}
            fetchOtaAnalytics={fetchOtaAnalytics} warehouseList={warehouseList}
          />
        )}

        {/* ══ Tab: 收款分流 ══ */}
        {activeTab === 'analytics' && analyticsSub === 'paymentSplit' && (
          <PaymentSplitTab
            psYear={psYear} setPsYear={setPsYear}
            psWarehouse={psWarehouse} setPsWarehouse={setPsWarehouse}
            psData={psData} psLoading={psLoading} psError={psError}
            fetchPaymentSplit={fetchPaymentSplit} warehouseList={warehouseList}
          />
        )}

        {/* ══ Tab: 房客歷史 ══ */}
        {activeTab === 'guestHistory' && (
          <GuestHistoryTab
            ghSearch={ghSearch} setGhSearch={setGhSearch}
            ghData={ghData} ghLoading={ghLoading}
            ghSearched={ghSearched} ghError={ghError} fetchGuestHistory={fetchGuestHistory}
          />
        )}
      </main>

      {/* 付款明細 Modal */}
      {editRecord && (
        <PaymentModal
          key={editRecord.id}
          record={editRecord}
          onClose={() => setEditRecord(null)}
          onSaved={() => {
            setEditRecord(null);
            fetchRecords();
            showToast('付款已儲存，下一步：訂金核對', 'success', {
              onClick: () => { setActiveTab('deposit'); router.replace('?tab=deposit', { scroll: false }); },
              label: '→ 訂金核對',
            });
          }}
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
