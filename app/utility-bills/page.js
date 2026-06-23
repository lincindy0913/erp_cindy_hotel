'use client';

import { useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import Navigation from '@/components/Navigation';
import NotificationBanner from '@/components/NotificationBanner';
import FetchErrorBanner from '@/components/FetchErrorBanner';
import ModuleGuideCard from '@/components/ModuleGuideCard';

// Hooks
import { useUtilityWarehouse } from './_hooks/useUtilityWarehouse';
import { useUtilityList } from './_hooks/useUtilityList';
import { useUtilityDetail } from './_hooks/useUtilityDetail';
import { useUtilityPayment } from './_hooks/useUtilityPayment';
import { useUtilityAnalysis } from './_hooks/useUtilityAnalysis';
import { useUtilityParse } from './_hooks/useUtilityParse';

// Tab components
import ListTab from './_tabs/ListTab';
import PaymentTab from './_tabs/PaymentTab';
import AnalysisTab from './_tabs/AnalysisTab';
import DetailTab from './_tabs/DetailTab';
import ParseTab from './_tabs/ParseTab';
import EditModal from './_tabs/EditModal';

const TABS_ADMIN = [
  { key: 'list',     label: '帳單記錄', icon: '📋' },
  { key: 'payment',  label: '付款進度', icon: '💳' },
  { key: 'analysis', label: '年度分析', icon: '📊' },
  { key: 'detail',   label: '明細管理', icon: '🗂' },
  { key: 'parse',    label: '電費解析', icon: '⚡' },
  { key: 'water',    label: '水費解析', icon: '💧' },
];
const TABS_VIEWER = [
  { key: 'list',     label: '帳單記錄', icon: '📋' },
  { key: 'payment',  label: '付款進度', icon: '💳' },
  { key: 'analysis', label: '年度分析', icon: '📊' },
  { key: 'detail',   label: '明細管理', icon: '🗂' },
];

const ADMIN_ONLY_TABS = new Set(['parse', 'water']);

export default function UtilityBillsPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === 'admin';
  const TABS = isAdmin ? TABS_ADMIN : TABS_VIEWER;

  const [activeTab, setActiveTab] = useState('list');
  const [message, setMessage] = useState({ text: '', type: '' });

  const showMessage = (text, type = 'success') => {
    const safe = typeof text === 'string' ? text : (text?.message || JSON.stringify(text) || '發生錯誤');
    setMessage({ text: safe, type });
    setTimeout(() => setMessage({ text: '', type: '' }), 4000);
  };

  // --- Hooks ---
  const { analysisFilter, setAnalysisFilter, analysisRecords, analysisLoading, analysisMode, setAnalysisMode, fetchAnalysisRecords, buildPivot } = useUtilityAnalysis();

  const { WAREHOUSE_OPTIONS } = useUtilityWarehouse({ session, setAnalysisFilter });

  const WAREHOUSE_KEYWORDS = WAREHOUSE_OPTIONS.filter(o => o.value).map(o => ({ keyword: o.value, warehouse: o.value }));

  // Use a ref so listHook can call fetchDetailRecords without circular initialization
  const fetchDetailRecordsRef = useRef(null);

  const listHook = useUtilityList({
    showMessage,
    onAfterSaveEdit: () => fetchDetailRecordsRef.current?.(),
  });
  const { records, listFilter, setListFilter, listLoading, recordsError, editRecord, editSummary, setEditSummary, savingEdit, fetchRecords, saveEdit, openEdit, closeEdit } = listHook;

  const { detailRecords, detailLoading, detailFilter, setDetailFilter, detailDeleting, confirmDelete, setConfirmDelete, fetchDetailRecords, deleteRecord } = useUtilityDetail({ showMessage, fetchRecords });

  // Keep ref up to date after detail hook is initialised
  fetchDetailRecordsRef.current = fetchDetailRecords;

  const { paymentRecords, paymentLoading, paymentFilter, setPaymentFilter, creatingPO, fetchPaymentRecords, createPaymentOrder } = useUtilityPayment({ showMessage });

  const parseHook = useUtilityParse({
    showMessage,
    setActiveTab,
    fetchPaymentRecords,
    fetchRecords,
    WAREHOUSE_KEYWORDS,
  });
  const {
    pdfFile, setPdfFile,
    startPage, setStartPage,
    extractedText, setExtractedText,
    pageTexts, setPageTexts,
    summary, setSummary,
    formRecords, setFormRecords,
    loading, saving,
    meta, setMeta,
    ocrRecords, setOcrRecords,
    ocrValidation,
    fileInputRef,
    handleFileChange,
    handleParse,
    handleOcrScan,
    generatePage1Summary,
    saveCurrentRecord,
  } = parseHook;

  // --- Effects ---

  // If session loads and user is not admin, redirect admin-only tabs to list
  useEffect(() => {
    if (session && !isAdmin && ADMIN_ONLY_TABS.has(activeTab)) setActiveTab('list');
  }, [session, isAdmin, activeTab]);

  // Reset parse state when switching tabs; set default startPage for water/parse
  useEffect(() => {
    if (activeTab === 'water') setStartPage(2);
    else if (activeTab === 'parse') setStartPage(1);
    if (activeTab !== 'list') {
      setSummary(null);
      setExtractedText('');
      setPageTexts([]);
    }
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeTab === 'list') fetchRecords();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, listFilter.warehouse, listFilter.year, listFilter.month, listFilter.billType]);

  useEffect(() => {
    if (activeTab === 'detail') fetchDetailRecords();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, detailFilter.warehouse, detailFilter.year, detailFilter.billType]);

  useEffect(() => {
    if (activeTab === 'analysis' && analysisFilter.warehouse && analysisFilter.year) {
      fetchAnalysisRecords();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'analysis' && analysisFilter.warehouse && analysisFilter.year) {
      fetchAnalysisRecords();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysisFilter.warehouse, analysisFilter.year, analysisFilter.billType]);

  useEffect(() => {
    if (activeTab === 'payment') fetchPaymentRecords();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'payment') fetchPaymentRecords();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentFilter.warehouse, paymentFilter.year, paymentFilter.billType, paymentFilter.status]);

  // --- Render ---
  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation borderColor="border-teal-600" />
      <NotificationBanner moduleFilter="utility" />
      {recordsError && (
        <div className="max-w-5xl mx-auto px-4 pt-4">
          <FetchErrorBanner message={recordsError} onRetry={fetchRecords} />
        </div>
      )}

      {/* Page header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-teal-800 flex items-center gap-2">
                <span className="text-2xl">🔌</span> 水電費管理
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {isAdmin ? 'OCR 自動辨識帳單 · 儲存記錄 · 各館別查詢' : '各館別水電費記錄查詢'}
              </p>
            </div>
            {!isAdmin && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-100 border border-gray-200 text-xs text-gray-500">
                👁 檢視模式
              </span>
            )}
          </div>

          {/* Tab navbar */}
          <div className="overflow-x-auto mt-4">
            <div className="flex gap-1 min-w-max">
              {TABS.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-1.5 px-3 py-2.5 rounded-t-lg text-sm font-medium border-b-2 transition-all whitespace-nowrap ${
                    activeTab === tab.key
                      ? 'border-teal-600 bg-teal-50 text-teal-800'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <span className="text-base leading-none">{tab.icon}</span>
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 pt-4">
        <ModuleGuideCard
          title="水電費管理流程指引"
          color="blue"
          storageKey="guide-utility-bills"
          steps={[
            { label: '上傳帳單', desc: '在「電費解析」或「水費解析」分頁上傳 PDF 帳單' },
            { label: '自動辨識', desc: 'OCR 解析帳單內容，確認各館別金額後儲存' },
            { label: '建立付款單', desc: '在「付款進度」分頁為已登記帳單建立付款單' },
            { label: '追蹤付款', desc: '追蹤各館別水電費付款進度與未付金額' },
            { label: '年度分析', desc: '查看各館別各年度水電費趨勢與月均值' },
          ]}
        />
      </div>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {message.text && (
          <div className={`mb-4 px-4 py-2 rounded-lg text-sm ${message.type === 'error' ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-green-100 text-green-700 border border-green-200'}`}>
            {message.text}
          </div>
        )}

        {(activeTab === 'parse' || activeTab === 'water') && (
          <ParseTab
            activeTab={activeTab}
            meta={meta}
            setMeta={setMeta}
            startPage={startPage}
            setStartPage={setStartPage}
            pdfFile={pdfFile}
            setPdfFile={setPdfFile}
            extractedText={extractedText}
            loading={loading}
            saving={saving}
            ocrRecords={ocrRecords}
            ocrValidation={ocrValidation}
            formRecords={formRecords}
            setFormRecords={setFormRecords}
            setOcrRecords={setOcrRecords}
            setSummary={setSummary}
            fileInputRef={fileInputRef}
            handleFileChange={handleFileChange}
            handleParse={handleParse}
            handleOcrScan={handleOcrScan}
            generatePage1Summary={generatePage1Summary}
            saveCurrentRecord={saveCurrentRecord}
            WAREHOUSE_OPTIONS={WAREHOUSE_OPTIONS}
          />
        )}

        {activeTab === 'list' && (
          <ListTab
            records={records}
            listFilter={listFilter}
            setListFilter={setListFilter}
            listLoading={listLoading}
            fetchRecords={fetchRecords}
            WAREHOUSE_OPTIONS={WAREHOUSE_OPTIONS}
            openEdit={openEdit}
          />
        )}

        {activeTab === 'payment' && (
          <PaymentTab
            paymentRecords={paymentRecords}
            paymentLoading={paymentLoading}
            paymentFilter={paymentFilter}
            setPaymentFilter={setPaymentFilter}
            fetchPaymentRecords={fetchPaymentRecords}
            createPaymentOrder={createPaymentOrder}
            creatingPO={creatingPO}
            WAREHOUSE_OPTIONS={WAREHOUSE_OPTIONS}
          />
        )}

        {activeTab === 'analysis' && (
          <AnalysisTab
            analysisFilter={analysisFilter}
            setAnalysisFilter={setAnalysisFilter}
            analysisRecords={analysisRecords}
            analysisLoading={analysisLoading}
            analysisMode={analysisMode}
            setAnalysisMode={setAnalysisMode}
            fetchAnalysisRecords={fetchAnalysisRecords}
            buildPivot={buildPivot}
            WAREHOUSE_OPTIONS={WAREHOUSE_OPTIONS}
          />
        )}

        {activeTab === 'detail' && (
          <DetailTab
            detailRecords={detailRecords}
            detailLoading={detailLoading}
            detailFilter={detailFilter}
            setDetailFilter={setDetailFilter}
            fetchDetailRecords={fetchDetailRecords}
            confirmDelete={confirmDelete}
            setConfirmDelete={setConfirmDelete}
            detailDeleting={detailDeleting}
            deleteRecord={deleteRecord}
            isAdmin={isAdmin}
            WAREHOUSE_OPTIONS={WAREHOUSE_OPTIONS}
            openEdit={openEdit}
          />
        )}

        {/* Shared edit modal (list + detail tabs) */}
        <EditModal
          editRecord={editRecord}
          editSummary={editSummary}
          setEditSummary={setEditSummary}
          savingEdit={savingEdit}
          saveEdit={saveEdit}
          closeEdit={closeEdit}
        />
      </main>
    </div>
  );
}
