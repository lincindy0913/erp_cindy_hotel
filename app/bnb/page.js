'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useSearchParams, useRouter } from 'next/navigation';
import Navigation from '@/components/Navigation';
import ModuleGuideCard from '@/components/ModuleGuideCard';
import HelpButton from '@/components/HelpButton';
import { useToast } from '@/context/ToastContext';
import PaymentModal from './_components/PaymentModal';
import BookingFormModal from './_components/BookingFormModal';
import BnbBatchLockModal from './_components/BnbBatchLockModal';
import WhQuickBtns from './_components/WhQuickBtns';
import SyncFailuresBanner from './_components/SyncFailuresBanner';
import BnbTabBar from './_components/BnbTabBar';
import LockHistoryModal from './_components/LockHistoryModal';
import { openPrintWindow } from '@/lib/printWindow';
import { useDepositMatch } from './_hooks/useDepositMatch';
import { useBnbRecords } from './_hooks/useBnbRecords';
import { useBnbAnalytics } from './_hooks/useBnbAnalytics';
import { useBnbCalendar } from './_hooks/useBnbCalendar';
import { useOtaReconcile } from './_hooks/useOtaReconcile';
import { useOtherIncome } from './_hooks/useOtherIncome';
import { useBnbBossWithdraw } from './_hooks/useBnbBossWithdraw';
import { useBnbImport } from './_hooks/useBnbImport';
import { useBnbLock } from './_hooks/useBnbLock';
import { useBnbDeclaration } from './_hooks/useBnbDeclaration';
import { useBnbDeclList } from './_hooks/useBnbDeclList';
import { useBnbDailyRevenue } from './_hooks/useBnbDailyRevenue';
import { useBnbPageStats } from './_hooks/useBnbPageStats';
import { DEFAULT_WAREHOUSE } from './_constants';
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

function BnbPage() {
  const { data: session } = useSession();
  const { showToast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const doPrint = useCallback((title, headers, rows) => {
    if (!openPrintWindow(title, headers, rows)) showToast('請允許彈出視窗以進行列印', 'error');
  }, [showToast]);

  const [activeTab, setActiveTab] = useState(() => searchParams.get('tab') || 'records');
  const [analyticsSub, setAnalyticsSub] = useState(() => searchParams.get('sub') || 'dailyRev');
  const [warehouseList, setWarehouseList] = useState([]);

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

  const canLock = session?.user?.role === 'admin'
    || (session?.user?.permissions || []).includes('bnb.lock')
    || (session?.user?.permissions || []).includes('bnb.edit');

  // ── hooks ────────────────────────────────────────────────────
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
    auditSummary, auditSummaryLoading, fetchAuditSummary,
    fetchRecords,
    handleBatchApply,
    handleInlineSave,
    enterEditMode, cancelEditMode, updateCell, focusPayCell, handlePayKeyDown, saveAllEdits,
    handleLockToggle, lockAllFilled, handleUnlockRow, handleDelete, handleRestore,
  } = useBnbRecords();

  const [editRecord,    setEditRecord]    = useState(null);
  const [editBooking,   setEditBooking]   = useState(null);
  const [addBookingOpen,setAddBookingOpen]= useState(false);

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
  } = useOtaReconcile({ showToast, confirm: undefined, setEditBooking, DEFAULT_WAREHOUSE });

  const {
    calYear, setCalYear, calMonth, setCalMonth,
    calWarehouse, setCalWarehouse,
    calData, calLoading, calError, calOverflow,
    fetchCalendar,
  } = useBnbCalendar();

  const bw = useBnbBossWithdraw();
  const imp = useBnbImport({ setFilterMonth, fetchRecords });
  const { dlYear, setDlYear, dlWarehouse, setDlWarehouse, dlRows, dlLoading, dlError, fetchDeclList } = useBnbDeclList();
  const { drMonth, setDrMonth, drWarehouse, setDrWarehouse, drLoading, drData, drError, drExpandDay, setDrExpandDay, fetchDailyRevenue } = useBnbDailyRevenue({ showToast });

  const getActiveLockContext = useCallback(() => {
    switch (activeTab) {
      case 'declaration': return { month: decl.declMonth, warehouse: decl.declWarehouse };
      case 'deposit':     return { month: dmMonth, warehouse: dmWarehouse || DEFAULT_WAREHOUSE };
      default:            return { month: filterMonth, warehouse: DEFAULT_WAREHOUSE };
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, filterMonth, dmMonth, dmWarehouse]);

  const decl = useBnbDeclaration({
    onSaved: () => {
      if (analyticsSub === 'monthly' || analyticsSub === 'pnl') fetchSummary();
      if (analyticsSub === 'declList') fetchDeclList();
    },
  });

  const {
    lockStatus, lockAudits, showLockHistory, setShowLockHistory,
    showBatchLock, setShowBatchLock, lockLoading,
    fetchLockStatus, fetchLockAudits, toggleLock,
  } = useBnbLock({ getActiveLockContext });

  const { recStats, roomStats } = useBnbPageStats(records);

  // ── 館別清單 ───────────────────────────────────────────────────
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
          imp.setImportWarehouse(prev => prev === DEFAULT_WAREHOUSE ? first : prev);
          setDrWarehouse(prev    => prev === DEFAULT_WAREHOUSE ? first : prev);
          decl.setDeclWarehouse(prev  => prev === DEFAULT_WAREHOUSE ? first : prev);
          setDlWarehouse(prev    => prev === DEFAULT_WAREHOUSE ? first : prev);
          setOtaWarehouse(prev   => prev === DEFAULT_WAREHOUSE ? first : prev);
        }
      })
      .catch(e => { console.error('[bnb] failed to load warehouse list', e); showToast('館別清單載入失敗，館別選單可能無選項，請重新整理頁面。', 'error'); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // ── Tab switch effects ─────────────────────────────────────────
  useEffect(() => {
    if (activeTab === 'records')     fetchRecords();
    if (activeTab === 'otherIncome') fetchOtherIncome();
    if (activeTab === 'analytics' && analyticsSub === 'dailyRev') fetchDailyRevenue();
    if (activeTab === 'analytics' && (analyticsSub === 'monthly' || analyticsSub === 'pnl')) fetchSummary();
    if (activeTab === 'declaration') { decl.setDeclSearched(false); decl.setDeclActual?.(null); }
    if (activeTab === 'analytics' && analyticsSub === 'declList') fetchDeclList();
    if (activeTab === 'deposit' && dmAccountId) fetchDepositMatch();
    if (activeTab === 'otaCommission') { fetchCommHistory(); fetchReconLogs(); }
    if (activeTab === 'bossWithdraw')  bw.fetchBossWithdraw();
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
  }, [activeTab, filterMonth, decl.declMonth, decl.declWarehouse, dmMonth, dmWarehouse]);

  useEffect(() => {
    if (activeTab === 'records') { setSelectedIds(new Set()); fetchRecords(); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterMonth, filterSource, filterStatus, filterWarehouse]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (activeTab === 'analytics' && (analyticsSub === 'monthly' || analyticsSub === 'pnl')) fetchSummary(); }, [summaryYear, summaryWarehouse, summaryMode, activeTab, analyticsSub]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (activeTab === 'analytics' && analyticsSub === 'declList') fetchDeclList(); }, [dlYear, dlWarehouse, activeTab, analyticsSub]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (activeTab === 'bossWithdraw') bw.fetchBossWithdraw(); }, [bw.bwMonth, bw.bwWarehouse, activeTab]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (activeTab === 'analytics' && analyticsSub === 'occupancy') fetchOccupancy(); }, [occYear, occWarehouse, activeTab, analyticsSub]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (activeTab === 'analytics' && analyticsSub === 'sourceAnalysis') fetchSourceAnalysis(); }, [saYear, saWarehouse, activeTab, analyticsSub]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (activeTab === 'analytics' && analyticsSub === 'otaAnalytics') fetchOtaAnalytics(); }, [oaYear, oaWarehouse, oaCompare, activeTab, analyticsSub]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (activeTab === 'analytics' && analyticsSub === 'paymentSplit') fetchPaymentSplit(); }, [psYear, psWarehouse, activeTab, analyticsSub]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (activeTab === 'deposit') fetchDepositMatch(); }, [dmPayType, activeTab]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (activeTab === 'payAudit') fetchAudit(); }, [auditMonth, auditWarehouse, activeTab]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (activeTab === 'analytics' && analyticsSub === 'calendar') fetchCalendar(); }, [calYear, calMonth, calWarehouse, activeTab, analyticsSub]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (activeTab === 'analytics' && analyticsSub === 'dailyRev') fetchDailyRevenue(); }, [drMonth, drWarehouse, activeTab, analyticsSub]);

  const isLocked   = !!lockStatus?.locked;
  const monthLocked = isLocked;

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
            { step: '1', text: '匯入訂房資料（Excel 匯入）' },
            { step: '2', text: '核對付款資料（訂金核對、付款稽核）' },
            { step: '3', text: '填寫旅宿網申報' },
            { step: '4', text: '確認月收支總表無誤' },
            { step: '5', text: '鎖帳（防止後續意外修改）' },
          ]}
        />

        <SyncFailuresBanner syncFailures={syncFailures} syncRetrying={syncRetrying} retrySyncFailure={retrySyncFailure} />

        <WhQuickBtns warehouseList={warehouseList} filterWarehouse={filterWarehouse} setFilterWarehouse={setFilterWarehouse} />

        <BnbTabBar
          activeTab={activeTab} setActiveTab={setActiveTab}
          analyticsSub={analyticsSub} setAnalyticsSub={setAnalyticsSub}
          router={router}
          isLocked={isLocked} lockLoading={lockLoading} lockStatus={lockStatus}
          getActiveLockContext={getActiveLockContext} toggleLock={toggleLock}
          fetchLockAudits={fetchLockAudits} setShowLockHistory={setShowLockHistory}
          setShowBatchLock={setShowBatchLock}
        />

        {activeTab === 'records' && (
          <RecordsTab
            records={records} recLoading={recLoading} recError={recError} recPage={recPage} recTotal={recTotal}
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
            importMonth={imp.importMonth} setImportMonth={imp.setImportMonth}
            importWarehouse={imp.importWarehouse} setImportWarehouse={imp.setImportWarehouse}
            importFile={imp.importFile} setImportFile={imp.setImportFile}
            importReplace={imp.importReplace} setImportReplace={imp.setImportReplace}
            importPreview={imp.importPreview} setImportPreview={imp.setImportPreview}
            importResult={imp.importResult} setImportResult={imp.setImportResult}
            importConfirm={imp.importConfirm} setImportConfirm={imp.setImportConfirm}
            showImportPanel={imp.showImportPanel} setShowImportPanel={imp.setShowImportPanel}
            importing={imp.importing}
            importHistory={imp.importHistory} setImportHistory={imp.setImportHistory}
            handleFileSelect={imp.handleFileSelect}
            handleImport={imp.handleImport}
            doImport={imp.doImport}
            canLock={canLock} isLocked={isLocked} monthLocked={monthLocked}
            warehouseList={warehouseList}
            recStats={recStats} roomStats={roomStats}
            auditSummary={auditSummary} auditSummaryLoading={auditSummaryLoading} fetchAuditSummary={fetchAuditSummary}
            setActiveTab={setActiveTab} router={router} doPrint={doPrint}
            onGoToPayAudit={() => { setActiveTab('payAudit'); router.replace('?tab=payAudit', { scroll: false }); }}
            onGoToDeposit={() => { setActiveTab('deposit'); router.replace('?tab=deposit', { scroll: false }); }}
          />
        )}

        {activeTab === 'analytics' && analyticsSub === 'dailyRev' && (
          <DailyRevTab
            drMonth={drMonth} setDrMonth={setDrMonth}
            drWarehouse={drWarehouse} setDrWarehouse={setDrWarehouse}
            drData={drData} drLoading={drLoading} drError={drError}
            drExpandDay={drExpandDay} setDrExpandDay={setDrExpandDay}
            fetchDailyRevenue={fetchDailyRevenue} warehouseList={warehouseList} doPrint={doPrint}
          />
        )}

        {activeTab === 'analytics' && analyticsSub === 'monthly' && (
          <MonthlySummaryTab
            summaryYear={summaryYear} setSummaryYear={setSummaryYear}
            summaryWarehouse={summaryWarehouse} setSummaryWarehouse={setSummaryWarehouse}
            summaryRows={summaryRows} summaryLoading={summaryLoading} summaryError={summaryError}
            fetchSummary={fetchSummary} warehouseList={warehouseList} doPrint={doPrint}
          />
        )}

        {activeTab === 'analytics' && analyticsSub === 'pnl' && (
          <PnlTab
            summaryMode={summaryMode} setSummaryMode={setSummaryMode}
            summaryYear={summaryYear} setSummaryYear={setSummaryYear}
            summaryWarehouse={summaryWarehouse} setSummaryWarehouse={setSummaryWarehouse}
            summaryRows={summaryRows} summaryLoading={summaryLoading} summaryError={summaryError}
            summaryFixedHelp={summaryFixedHelp} fetchSummary={fetchSummary}
            warehouseList={warehouseList} doPrint={doPrint}
          />
        )}

        {activeTab === 'declaration' && (
          <DeclarationTab
            declMonth={decl.declMonth} setDeclMonth={decl.setDeclMonth}
            declWarehouse={decl.declWarehouse} setDeclWarehouse={decl.setDeclWarehouse}
            declLoading={decl.declLoading} declError={decl.declError}
            declSearched={decl.declSearched} setDeclSearched={decl.setDeclSearched}
            declActual={decl.declActual}
            declForm={decl.declForm} setDeclForm={decl.setDeclForm}
            declSaving={decl.declSaving}
            fetchDecl={decl.fetchDecl}
            handleAutoFillDecl={decl.handleAutoFillDecl}
            handleDeclSave={decl.handleDeclSave}
            warehouseList={warehouseList} isLocked={isLocked} doPrint={doPrint}
          />
        )}

        {activeTab === 'analytics' && analyticsSub === 'declList' && (
          <AnnualDeclListTab
            dlYear={dlYear} setDlYear={setDlYear}
            dlWarehouse={dlWarehouse} setDlWarehouse={setDlWarehouse}
            dlRows={dlRows} dlLoading={dlLoading} dlError={dlError}
            fetchDeclList={fetchDeclList} warehouseList={warehouseList} doPrint={doPrint}
          />
        )}

        {activeTab === 'deposit' && (
          <DepositMatchTab
            dmMonth={dmMonth} setDmMonth={setDmMonth}
            dmWarehouse={dmWarehouse} setDmWarehouse={setDmWarehouse}
            dmAccountId={dmAccountId} setDmAccountId={setDmAccountId}
            dmData={dmData} setDmData={setDmData}
            dmLoading={dmLoading} dmError={dmError} dmAccounts={dmAccounts}
            dmSelBnb={dmSelBnb} setDmSelBnb={setDmSelBnb}
            dmSelLine={dmSelLine} setDmSelLine={setDmSelLine}
            dmMatching={dmMatching} dmPayType={dmPayType} setDmPayType={setDmPayType}
            dmMarkModal={dmMarkModal} setDmMarkModal={setDmMarkModal}
            dmMarkNote={dmMarkNote} setDmMarkNote={setDmMarkNote}
            fetchDepositMatch={fetchDepositMatch}
            handleMatch={handleMatch} handleUnmatch={handleUnmatch}
            handleMark={handleMark} handleClearMark={handleClearMark} handleAutoMatch={handleAutoMatch}
            warehouseList={warehouseList} isLocked={isLocked}
            onGoToBooking={() => { setFilterMonth(dmMonth); setActiveTab('records'); router.replace('?tab=records', { scroll: false }); }}
            ledgerMonthFrom={ledgerMonthFrom} setLedgerMonthFrom={setLedgerMonthFrom}
            ledgerMonthTo={ledgerMonthTo}     setLedgerMonthTo={setLedgerMonthTo}
            ledgerWarehouse={ledgerWarehouse} setLedgerWarehouse={setLedgerWarehouse}
            ledgerRows={ledgerRows} ledgerLoading={ledgerLoading} fetchLedger={fetchLedger}
            showBankImport={showBankImport} setShowBankImport={setShowBankImport}
            bankImportLines={bankImportLines} setBankImportLines={setBankImportLines}
            bankImportParsing={bankImportParsing} bankImportSubmitting={bankImportSubmitting}
            bankImportError={bankImportError} setBankImportError={setBankImportError}
            handleBankFileUpload={handleBankFileUpload} submitBankImport={submitBankImport}
          />
        )}

        {activeTab === 'otaRecon' && (
          <OtaReconTab
            otaSource={otaSource} setOtaSource={setOtaSource}
            otaDateFrom={otaDateFrom} setOtaDateFrom={setOtaDateFrom}
            otaDateTo={otaDateTo} setOtaDateTo={setOtaDateTo}
            otaWarehouse={otaWarehouse} setOtaWarehouse={setOtaWarehouse}
            otaFile={otaFile}
            onOtaFileChange={f => { setOtaFile(f); }}
            otaPreview={otaPreview} otaPreviewLoading={otaPreviewLoading} previewOta={previewOta}
            otaResult={otaResult} otaLoading={otaLoading} otaError={otaError}
            otaMonth={otaMonth} setOtaMonth={setOtaMonth}
            otaViewTab={otaViewTab} setOtaViewTab={setOtaViewTab}
            commAmt={commAmt} setCommAmt={setCommAmt}
            commMethod={commMethod} setCommMethod={setCommMethod}
            commNote={commNote} setCommNote={setCommNote}
            commSubmitting={commSubmitting} commExisting={commExisting}
            reconcileConfirmed={reconcileConfirmed} reconcileConfirming={reconcileConfirming}
            warehouseList={warehouseList}
            runOtaReconcile={runOtaReconcile} confirmReconcile={confirmReconcile}
            submitCommission={submitCommission} cancelCommission={cancelCommission}
            openOtaEdit={openOtaEdit} openOtaAdd={openOtaAdd} deleteOtaBnb={deleteOtaBnb}
            onGoToCommission={() => { setCommSource(otaSource); setActiveTab('otaCommission'); router.replace('?tab=otaCommission', { scroll: false }); }}
          />
        )}

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
            fetchCommHistory={fetchCommHistory} fetchReconLogs={fetchReconLogs}
            saveEditComm={saveEditComm} startEditComm={startEditComm}
            confirmCommission={confirmCommission} cancelCommission={cancelCommission}
          />
        )}

        {activeTab === 'bossWithdraw' && (
          <BossWithdrawTab
            bwData={bw.bwData} bwLoading={bw.bwLoading} bwError={bw.bwError}
            bwMonth={bw.bwMonth} setBwMonth={bw.setBwMonth}
            bwWarehouse={bw.bwWarehouse} setBwWarehouse={bw.setBwWarehouse}
            bwViewMode={bw.bwViewMode} setBwViewMode={bw.setBwViewMode}
            bwYear={bw.bwYear} setBwYear={bw.setBwYear}
            bwSummary={bw.bwSummary} bwSummaryLoad={bw.bwSummaryLoad}
            warehouseList={warehouseList}
            fetchBossWithdraw={bw.fetchBossWithdraw}
            fetchBossWithdrawSummary={bw.fetchBossWithdrawSummary}
            showToast={showToast}
          />
        )}

        {activeTab === 'otherIncome' && (
          <OtherIncomeTab
            oiRows={oiRows} oiLoading={oiLoading} oiError={oiError} fetchOtherIncome={fetchOtherIncome}
            oiMonth={oiMonth} setOiMonth={setOiMonth}
            oiWarehouse={oiWarehouse} setOiWarehouse={setOiWarehouse}
            oiModalOpen={oiModalOpen} setOiModalOpen={setOiModalOpen}
            oiEditRow={oiEditRow} oiForm={oiForm} setOiForm={setOiForm} oiSaving={oiSaving}
            saveOtherIncome={saveOtherIncome} deleteOtherIncome={deleteOtherIncome} openOiModal={openOiModal}
            recurringTemplates={recurringTemplates} recurringError={recurringError}
            showRecurringMgr={showRecurringMgr} setShowRecurringMgr={setShowRecurringMgr}
            recurringForm={recurringForm} setRecurringForm={setRecurringForm}
            fetchRecurringTemplates={fetchRecurringTemplates} saveRecurringTemplate={saveRecurringTemplate}
            deleteRecurringTemplate={deleteRecurringTemplate}
            recurringDraftMonth={recurringDraftMonth} setRecurringDraftMonth={setRecurringDraftMonth}
            recurringDrafting={recurringDrafting} createRecurringDrafts={createRecurringDrafts}
            warehouseList={warehouseList} showToast={showToast} confirm={undefined}
          />
        )}

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
              fetchCalendar={fetchCalendar} warehouseList={warehouseList}
            />
          </>
        )}

        {activeTab === 'analytics' && analyticsSub === 'occupancy' && (
          <OccupancyTab
            occYear={occYear} setOccYear={setOccYear}
            occWarehouse={occWarehouse} setOccWarehouse={setOccWarehouse}
            occData={occData} occLoading={occLoading} occError={occError}
            fetchOccupancy={fetchOccupancy} warehouseList={warehouseList}
          />
        )}

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
              onGoToRecords={(filter) => { setFilterPayment(filter); setFilterMonth(auditMonth); setActiveTab('records'); router.replace('?tab=records', { scroll: false }); }}
            />
          </>
        )}

        {activeTab === 'analytics' && analyticsSub === 'sourceAnalysis' && (
          <SourceAnalysisTab
            saYear={saYear} setSaYear={setSaYear}
            saWarehouse={saWarehouse} setSaWarehouse={setSaWarehouse}
            saData={saData} saLoading={saLoading} saError={saError}
            fetchSourceAnalysis={fetchSourceAnalysis} warehouseList={warehouseList}
          />
        )}

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

        {activeTab === 'analytics' && analyticsSub === 'paymentSplit' && (
          <PaymentSplitTab
            psYear={psYear} setPsYear={setPsYear}
            psWarehouse={psWarehouse} setPsWarehouse={setPsWarehouse}
            psData={psData} psLoading={psLoading} psError={psError}
            fetchPaymentSplit={fetchPaymentSplit} warehouseList={warehouseList}
          />
        )}

        {activeTab === 'guestHistory' && (
          <GuestHistoryTab
            ghSearch={ghSearch} setGhSearch={setGhSearch}
            ghData={ghData} ghLoading={ghLoading}
            ghSearched={ghSearched} ghError={ghError} fetchGuestHistory={fetchGuestHistory}
          />
        )}
      </main>

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

      {editBooking && (
        <BookingFormModal
          record={editBooking}
          warehouseList={warehouseList}
          roomNoList={roomNoList}
          existingRecords={records}
          onClose={() => setEditBooking(null)}
          onSaved={() => { setEditBooking(null); fetchRecords(); if (activeTab === 'otaReconcile' && otaResult) runOtaReconcile(); }}
        />
      )}

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

      {showLockHistory && (
        <LockHistoryModal lockAudits={lockAudits} onClose={() => setShowLockHistory(false)} />
      )}

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
